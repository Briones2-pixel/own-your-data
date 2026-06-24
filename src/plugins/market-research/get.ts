/**
 * Market Research GET — collect raw sector signals.
 * Run: npm run market:get
 *
 * For each tracked issuer it pulls (best-effort, no API keys required):
 *   - a delayed quote + 52-week / momentum stats from Stooq
 *   - recent SEC filings from EDGAR (CIK auto-resolved from ticker)
 *   - issuer-specific news from Google News RSS
 * Plus sector-level news and any broker-research text files the user has
 * dropped into raw-dumps/market-research/research/.
 *
 * Writes one bundle to raw-dumps/market-research/bundle.json (latest), and an
 * archival copy bundle-YYYY-MM-DD.json.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { loadConfig, loadPluginConfig, getResolvedPaths, getTodayString } from '../../config/config';
import { initPluginLog } from '../../shared/plugin-logger';
import { MarketResearchPluginConfig, mergeWithDefaults } from './config';
import { IssuerSnapshot, NewsItem, ResearchBundle, ResearchNote } from './types';
import {
    fetchFilings,
    fetchNews,
    fetchPriceStats,
    fetchQuote,
    resolveCik,
    sleep,
} from './sources';

/** Read broker/analyst research notes dropped as .txt/.md files. */
async function loadResearchNotes(researchDir: string): Promise<ResearchNote[]> {
    const notes: ResearchNote[] = [];
    let files: string[];
    try {
        files = (await fs.readdir(researchDir)).filter((f) => /\.(txt|md|markdown)$/i.test(f));
    } catch {
        return notes;
    }
    for (const file of files) {
        try {
            const full = path.join(researchDir, file);
            const text = await fs.readFile(full, 'utf-8');
            const stat = await fs.stat(full);
            const title = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0) || file;
            notes.push({ file, title, text, date: stat.mtime.toISOString().split('T')[0] });
        } catch {
            // skip unreadable file
        }
    }
    return notes;
}

/** Build the news query for an issuer (name + aliases OR-joined). */
function issuerNewsQuery(name: string, aliases: string[] = []): string {
    const terms = [name, ...aliases].map((t) => `"${t}"`);
    return terms.join(' OR ');
}

async function main() {
    initPluginLog('market-research');

    const config = await loadConfig();
    const paths = getResolvedPaths(config);
    const cfg = mergeWithDefaults((await loadPluginConfig<MarketResearchPluginConfig>('market-research')) || undefined);

    const rawDir = path.join(paths.rawDumps, 'market-research');
    const researchDir = path.join(rawDir, 'research');
    await fs.mkdir(rawDir, { recursive: true });
    await fs.mkdir(researchDir, { recursive: true });

    const fetchedAt = new Date().toISOString();
    console.log(`📈 Market Research GET — ${cfg.sector}`);
    console.log(`📅 ${getTodayString()}`);
    console.log(`🏢 Issuers: ${cfg.issuers.length} | sector queries: ${cfg.sectorQueries.length}\n`);

    const snapshots: IssuerSnapshot[] = [];

    for (const issuer of cfg.issuers) {
        const ticker = issuer.ticker?.toUpperCase() || null;
        console.log(`▶ ${issuer.name}${ticker ? ` (${ticker})` : ' (private / news-only)'}`);

        let quote = null;
        let stats = null;
        let filings: IssuerSnapshot['filings'] = [];
        let cik: string | null = null;

        if (ticker) {
            quote = await fetchQuote(ticker);
            stats = await fetchPriceStats(ticker, cfg.historyDays);
            if (quote?.close != null) console.log(`   💲 ${quote.close}${stats?.dayChangePct != null ? ` (${stats.dayChangePct.toFixed(1)}% d/d)` : ''}`);
        }

        cik = await resolveCik(issuer.ticker, issuer.cik, cfg.secUserAgent);
        if (cik) {
            filings = await fetchFilings(cik, 15, cfg.secUserAgent);
            console.log(`   📄 ${filings.length} recent SEC filings (CIK ${cik})`);
            await sleep(150); // be polite to EDGAR (10 req/s limit)
        }

        const news = await fetchNews(issuerNewsQuery(issuer.name, issuer.aliases), issuer.name, cfg.newsPerQuery);
        console.log(`   📰 ${news.length} news items`);

        snapshots.push({
            name: issuer.name,
            ticker,
            cik,
            note: issuer.note,
            fetchedAt,
            quote,
            stats,
            filings,
            news,
        });

        await sleep(250);
    }

    // Sector-level news
    console.log(`\n🌐 Sector news...`);
    const sectorNews: NewsItem[] = [];
    for (const q of cfg.sectorQueries) {
        const items = await fetchNews(q, 'Sector', cfg.newsPerQuery);
        console.log(`   📰 "${q}": ${items.length}`);
        sectorNews.push(...items);
        await sleep(250);
    }

    // Broker / analyst research drop-in
    const research = await loadResearchNotes(researchDir);
    console.log(`\n📑 Broker research notes: ${research.length}`);

    const bundle: ResearchBundle = {
        fetchedAt,
        sector: cfg.sector,
        issuers: snapshots,
        sectorNews,
        research,
    };

    const latestPath = path.join(rawDir, 'bundle.json');
    const archivePath = path.join(rawDir, `bundle-${getTodayString()}.json`);
    await fs.writeFile(latestPath, JSON.stringify(bundle, null, 2));
    await fs.writeFile(archivePath, JSON.stringify(bundle, null, 2));

    const totalNews = snapshots.reduce((a, s) => a + s.news.length, 0) + sectorNews.length;
    const totalFilings = snapshots.reduce((a, s) => a + s.filings.length, 0);
    console.log(`\n📊 Summary: ${snapshots.length} issuers | ${totalFilings} filings | ${totalNews} news | ${research.length} research notes`);
    console.log(`💾 Saved ${latestPath}`);
    console.log('✅ GET complete. Run `npm run market:process` next.');
}

main().catch((e) => {
    console.error('❌ market-research get failed:', e);
    process.exit(1);
});
