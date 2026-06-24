/**
 * Dashboard synthesis — turns a raw {@link ResearchBundle} into a MindCache
 * whose markdown IS the sector research note. Shared by `process` (writes a
 * local .md) and `push` (syncs the same content to GitHub) so the synthesis
 * logic has a single source of truth.
 */

import { MindCache } from 'mindcache';
import { flagFiling, flagNews, sortFlags, SEVERITY_ICON } from './flags';
import { Flag, NewsItem, PriceStats, ResearchBundle } from './types';

function pct(n: number | null | undefined, digits = 1): string {
    if (n === null || n === undefined || !Number.isFinite(n)) return '—';
    const s = n.toFixed(digits);
    return `${n >= 0 ? '+' : ''}${s}%`;
}

function money(n: number | null | undefined): string {
    if (n === null || n === undefined || !Number.isFinite(n)) return '—';
    return `$${n.toFixed(2)}`;
}

function shortDate(d: string | null): string {
    if (!d) return '—';
    const t = Date.parse(d);
    if (Number.isNaN(t)) return d;
    return new Date(t).toISOString().split('T')[0];
}

/** Dedupe news by normalized title, keeping first occurrence. */
function dedupeNews(items: NewsItem[]): NewsItem[] {
    const seen = new Set<string>();
    const out: NewsItem[] = [];
    for (const it of items) {
        const key = it.title.toLowerCase().replace(/\s+/g, ' ').trim();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(it);
    }
    return out;
}

/** Collect every flag across the bundle, most-material first. */
export function collectFlags(bundle: ResearchBundle, extraKeywords: string[]): Flag[] {
    const flags: Flag[] = [];
    for (const issuer of bundle.issuers) {
        for (const f of issuer.filings) {
            const flag = flagFiling(issuer.name, f);
            if (flag) flags.push(flag);
        }
        for (const n of issuer.news) {
            const flag = flagNews(n, extraKeywords);
            if (flag) flags.push(flag);
        }
    }
    for (const n of bundle.sectorNews) {
        const flag = flagNews(n, extraKeywords);
        if (flag) flags.push(flag);
    }
    return sortFlags(flags);
}

function momentumCue(stats: PriceStats | null): string {
    if (!stats) return '';
    const m = stats.mom3mPct;
    if (m === null) return '';
    if (m <= -15) return ' ⚠️ weak';
    if (m >= 15) return ' 🚀 strong';
    return '';
}

/**
 * Build the MindCache dashboard. Each section is one keyed entry so the
 * rendered markdown reads top-to-bottom in a sensible order (zIndex controls
 * ordering — higher renders later).
 */
export function buildDashboard(bundle: ResearchBundle, extraKeywords: string[]): MindCache {
    const mc = new MindCache();
    const date = bundle.fetchedAt.split('T')[0];
    const dateTag = date;
    const tag = (extra: string[] = []) => ['market-research', dateTag, ...extra];

    const flags = collectFlags(bundle, extraKeywords);
    const withTicker = bundle.issuers.filter((i) => i.ticker);

    // ---- 0. Overview ----
    const overview: string[] = [];
    overview.push(`# ${bundle.sector} — Sector Research`);
    overview.push(`*Generated ${bundle.fetchedAt} · for CloudBound fundraising / pitch-deck prep*`);
    overview.push('');
    overview.push(
        `**At a glance:** ${bundle.issuers.length} issuers tracked ` +
            `(${withTicker.length} public) · ${flags.length} items flagged for review · ` +
            `${bundle.research.length} broker/analyst notes ingested.`
    );
    overview.push('');
    const highs = flags.filter((f) => f.severity === 'high').length;
    if (highs > 0) overview.push(`> 🔴 **${highs} high-priority** item(s) need review — see the Flagged section.`);
    mc.set_value('00 Overview', overview.join('\n'), { contentTags: tag(['overview']), zIndex: 0 });

    // ---- 1. Flagged for review ----
    const flagLines: string[] = [];
    flagLines.push(`## 🚩 Flagged for Review (${flags.length})`);
    flagLines.push('');
    if (flags.length === 0) {
        flagLines.push('_No material events detected this run._');
    } else {
        flagLines.push('| ⚑ | Subject | Item | Categories | Date |');
        flagLines.push('|---|---------|------|------------|------|');
        for (const f of flags.slice(0, 40)) {
            const title = f.title.replace(/\|/g, '\\|');
            const linked = f.link ? `[${title}](${f.link})` : title;
            flagLines.push(
                `| ${SEVERITY_ICON[f.severity]} | ${f.subject} | ${linked} | ${f.categories.join(', ')} | ${shortDate(f.date)} |`
            );
        }
        if (flags.length > 40) flagLines.push(`\n_…and ${flags.length - 40} more._`);
    }
    mc.set_value('01 Flagged for Review', flagLines.join('\n'), { contentTags: tag(['flagged']), zIndex: 1 });

    // ---- 2. Valuation & price snapshot ----
    const valLines: string[] = [];
    valLines.push('## 📊 Public Valuation & Price Snapshot');
    valLines.push('');
    if (withTicker.length === 0) {
        valLines.push('_No public issuers configured._');
    } else {
        valLines.push('| Issuer | Ticker | Last | Day | 1M | 3M | 52w Low–High | % off High |');
        valLines.push('|--------|--------|------|-----|-----|-----|--------------|-----------|');
        for (const i of withTicker) {
            const s = i.stats;
            const range =
                s?.week52Low != null && s?.week52High != null
                    ? `${money(s.week52Low)}–${money(s.week52High)}`
                    : '—';
            valLines.push(
                `| ${i.name} | ${i.ticker} | ${money(s?.last ?? i.quote?.close ?? null)} | ` +
                    `${pct(s?.dayChangePct)} | ${pct(s?.mom1mPct)} | ${pct(s?.mom3mPct)}${momentumCue(s)} | ${range} | ${pct(s?.pctFrom52High)} |`
            );
        }
        valLines.push('');
        valLines.push(
            '_Prices are delayed market levels (Stooq). Momentum = trailing ~21/63 trading-day price change. ' +
                'EV/EBITDA and other multiples require fundamentals — drop broker notes into the research folder to enrich this._'
        );
    }
    mc.set_value('02 Valuation Snapshot', valLines.join('\n'), { contentTags: tag(['valuation']), zIndex: 2 });

    // ---- 3. Issuer developments (filings) ----
    const devLines: string[] = [];
    devLines.push('## 🏢 Issuer Developments — Recent SEC Filings');
    devLines.push('');
    let anyFilings = false;
    for (const i of bundle.issuers) {
        if (i.filings.length === 0) continue;
        anyFilings = true;
        devLines.push(`### ${i.name}${i.ticker ? ` (${i.ticker})` : ''}`);
        for (const f of i.filings.slice(0, 8)) {
            const desc = f.primaryDescription ? ` — ${f.primaryDescription}` : '';
            devLines.push(`- **${f.form}** · ${shortDate(f.filingDate)}${desc} · [filing](${f.url})`);
        }
        devLines.push('');
    }
    if (!anyFilings) devLines.push('_No filings retrieved (private issuers or EDGAR unavailable)._');
    mc.set_value('03 Issuer Developments', devLines.join('\n'), { contentTags: tag(['filings']), zIndex: 3 });

    // ---- 4. News digest ----
    const newsLines: string[] = [];
    newsLines.push('## 📰 News Digest');
    newsLines.push('');
    for (const i of bundle.issuers) {
        const items = dedupeNews(i.news);
        if (items.length === 0) continue;
        newsLines.push(`### ${i.name}${i.ticker ? ` (${i.ticker})` : ''}`);
        if (i.note) newsLines.push(`_${i.note}_`);
        for (const n of items.slice(0, 8)) {
            const src = n.source ? ` — ${n.source}` : '';
            newsLines.push(`- [${n.title}](${n.link})${src} · ${shortDate(n.pubDate)}`);
        }
        newsLines.push('');
    }
    const sector = dedupeNews(bundle.sectorNews);
    if (sector.length > 0) {
        newsLines.push('### 🌐 Sector / Industry');
        for (const n of sector.slice(0, 15)) {
            const src = n.source ? ` — ${n.source}` : '';
            newsLines.push(`- [${n.title}](${n.link})${src} · ${shortDate(n.pubDate)}`);
        }
        newsLines.push('');
    }
    mc.set_value('04 News Digest', newsLines.join('\n'), { contentTags: tag(['news']), zIndex: 4 });

    // ---- 5. Broker / analyst research ----
    const resLines: string[] = [];
    resLines.push('## 📑 Broker / Analyst Research');
    resLines.push('');
    if (bundle.research.length === 0) {
        resLines.push(
            '_No research notes ingested. Drop broker PDFs (exported as .txt/.md) into ' +
                '`raw-dumps/market-research/research/` and re-run to fold them into this section._'
        );
    } else {
        for (const r of bundle.research) {
            resLines.push(`### ${r.title}`);
            resLines.push(`*${r.file} · ${r.date}*`);
            resLines.push('');
            const excerpt = r.text.trim().split('\n').slice(0, 12).join('\n');
            resLines.push(excerpt);
            if (r.text.trim().split('\n').length > 12) resLines.push('\n_…(truncated)_');
            resLines.push('');
        }
    }
    mc.set_value('05 Broker Research', resLines.join('\n'), { contentTags: tag(['research']), zIndex: 5 });

    // ---- 6. Methodology ----
    const methodology = [
        '## ℹ️ Methodology & Sources',
        '',
        '- **Quotes / valuations:** Stooq (delayed). Momentum and 52-week range derived from daily history.',
        '- **Issuer developments:** SEC EDGAR submissions API (CIK auto-resolved from ticker).',
        '- **News:** Google News RSS, per-issuer and sector queries, deduped by headline.',
        '- **Broker research:** local drop-in files in the research folder.',
        '- **Flagging:** keyword rules across M&A, capital markets, distress, guidance, analyst actions,',
        '  unit growth and leadership; material SEC form types (8-K, 13D, S-1, 424B, merger proxies) auto-flag.',
        '',
        '_Informational only — not investment advice. Verify every flagged item against the primary source before use in the deck._',
    ].join('\n');
    mc.set_value('06 Methodology', methodology, { contentTags: tag(['methodology']), zIndex: 6 });

    return mc;
}
