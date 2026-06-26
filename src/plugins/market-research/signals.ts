/**
 * Market Research SIGNALS — refresh the live competitive-intelligence feed.
 * Run: npm run market:signals   (after get + process)
 *
 * Reads the curated feed at docs/intel/competitors_master.json, regenerates the
 * market-derived signals (ids prefixed "mkt-") from the latest connector run,
 * preserves curated signals (ids prefixed "cur-"), writes the feed back, and
 * emits an inline-styled email digest. The live dashboard (docs/intel) and the
 * Cloudbound Intel app both consume competitors_master.json, so committing the
 * refreshed file on each scheduled run is what makes the document "live".
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, loadPluginConfig, getResolvedPaths } from '../../config/config';
import { mergeWithDefaults, MarketResearchPluginConfig } from './config';
import { collectFlags } from './dashboard';
import { ResearchBundle, Flag } from './types';

type SignalType = 'CAPITAL' | 'EXPANSION' | 'CONCEPT' | 'DEMAND' | 'TALENT' | 'MARKETING';

interface Signal {
    id: string;
    type: SignalType;
    company: string;
    headline: string;
    entities?: string;
    geography?: string;
    week: string;
    importance: number;
    confidence: number;
    impact: number;
    timeSensitivity: 'high' | 'medium' | 'low';
    cloudboundAction?: string;
    sources?: string[];
    curated?: boolean;
}

function isoWeek(iso: string): string {
    const d = new Date(iso);
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - day + 3);
    const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((t.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
    return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const CAT_TYPE: Record<string, SignalType> = {
    'M&A / Strategic': 'CAPITAL',
    'Capital Markets': 'CAPITAL',
    'Distress / Credit': 'CAPITAL',
    'Issuer Development': 'CAPITAL',
    'Broker / Analyst': 'CAPITAL',
    'Guidance / Earnings': 'DEMAND',
    'Unit Growth': 'EXPANSION',
    'Leadership': 'TALENT',
    Ownership: 'CAPITAL',
    Watchlist: 'CONCEPT',
};

function sevScore(sev: Flag['severity']): { imp: number; impact: number } {
    if (sev === 'high') return { imp: 9, impact: 9 };
    if (sev === 'medium') return { imp: 6, impact: 6 };
    return { imp: 4, impact: 4 };
}

function hash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36).slice(0, 8);
}

function pct(n: number | null | undefined): string {
    return n === null || n === undefined || !Number.isFinite(n) ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}
function esc(s: string): string {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildMarketSignals(bundle: ResearchBundle, week: string, extraKw: string[]): Signal[] {
    const out: Signal[] = [];

    // Per-issuer price/valuation pulse
    for (const i of bundle.issuers) {
        if (!i.ticker || !i.stats) continue;
        const s = i.stats;
        const headline =
            `${s.last != null ? '$' + s.last.toFixed(2) : 'n/a'} · day ${pct(s.dayChangePct)} · 1M ${pct(s.mom1mPct)} · 3M ${pct(s.mom3mPct)} · ${pct(s.pctFrom52High)} off 52-wk high.`;
        out.push({
            id: `mkt-quote-${i.ticker.toLowerCase()}`,
            type: 'CONCEPT',
            company: `${i.name} (${i.ticker})`,
            headline,
            entities: `${i.name} · public comp${i.note ? ' · ' + i.note : ''}`,
            geography: 'US',
            week,
            importance: Math.abs(s.mom3mPct ?? 0) >= 15 ? 7 : 5,
            confidence: 9,
            impact: Math.abs(s.mom3mPct ?? 0) >= 15 ? 7 : 4,
            timeSensitivity: Math.abs(s.dayChangePct ?? 0) >= 5 ? 'high' : 'low',
            cloudboundAction: 'Public read-through on FEC demand & valuation; anchor vs. 10.9x comps / 7.0x entry.',
            sources: i.cik ? [`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${i.cik}&type=&dateb=&owner=include&count=40`] : [],
        });
    }

    // Flagged news + filings → typed signals
    const flags = collectFlags(bundle, extraKw).slice(0, 40);
    for (const f of flags) {
        const type = CAT_TYPE[f.categories[0]] || 'CONCEPT';
        const sc = sevScore(f.severity);
        out.push({
            id: `mkt-${f.kind}-${hash(f.subject + f.title)}`,
            type,
            company: f.subject,
            headline: f.title,
            entities: f.categories.join(' · ') + (f.date ? ' · ' + f.date : ''),
            geography: 'US',
            week,
            importance: sc.imp,
            confidence: f.kind === 'filing' ? 9 : 7,
            impact: sc.impact,
            timeSensitivity: f.severity,
            cloudboundAction: 'Flagged for review — verify against the primary source.',
            sources: f.link ? [f.link] : [],
        });
    }
    return out;
}

function emailHtml(signals: Signal[], week: string, generatedAt: string): string {
    const date = generatedAt.split('T')[0];
    const top = [...signals]
        .sort((a, b) => b.importance - a.importance || b.impact - a.impact)
        .slice(0, 10);
    const liveUrl = process.env.INTEL_URL || '#';
    const rows = top
        .map((s) => {
            const color = s.timeSensitivity === 'high' ? '#c2724a' : s.timeSensitivity === 'medium' ? '#3f7fb0' : '#3aaa8a';
            return `<tr><td style="padding:9px 0;border-bottom:1px solid #eee;font-family:Arial,sans-serif;font-size:14px;color:#23262d;">
<span style="display:inline-block;font-size:10px;font-weight:bold;letter-spacing:.6px;color:#fff;background:#0F1218;padding:2px 7px;border-radius:4px;">${esc(s.type)}</span>
&nbsp;<b>${esc(s.company)}</b> — ${esc(s.headline)}
<span style="color:${color};font-size:11px;font-weight:bold;text-transform:uppercase;">· ${esc(s.timeSensitivity)}</span>
<span style="color:#6B7280;font-size:11px;"> Imp ${s.importance}/Impact ${s.impact}</span></td></tr>`;
        })
        .join('');
    return `<!doctype html><html><body style="margin:0;background:#F2EFE8;padding:24px;">
<div style="max-width:620px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e6e2da;">
<div style="background:#0F1218;padding:20px 26px;">
  <div style="font-family:Georgia,serif;font-weight:bold;font-size:20px;color:#fff;">Cloud<span style="color:#6ECAB8;">bound</span> <span style="font-size:12px;color:#9DB2CE;font-family:Arial;">· Competitive Intelligence</span></div>
</div>
<div style="padding:24px 26px;">
  <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#3aaa8a;font-weight:bold;">Digest · ${date} · ${week}</div>
  <h1 style="font-family:Georgia,serif;font-size:25px;margin:8px 0 4px;color:#0F1218;">Top FEC signals this run</h1>
  <p style="font-family:Arial,sans-serif;font-size:13px;color:#3a3f48;margin:0 0 12px;">${signals.length} tracked signals · top ${top.length} by importance below · anchor 10.9x comps → <b style="color:#7ab500;">7.0x</b> entry.</p>
  <table style="width:100%;border-collapse:collapse;">${rows}</table>
  <div style="margin:22px 0 6px;"><a href="${esc(liveUrl)}" style="display:inline-block;background:#6ECAB8;color:#0F1218;font-family:Arial,sans-serif;font-weight:bold;font-size:14px;text-decoration:none;padding:12px 22px;border-radius:100px;">Open the live board →</a></div>
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#6B7280;margin-top:16px;">Informational only — not investment advice.</p>
</div></div></body></html>`;
}

async function main() {
    const config = await loadConfig();
    const paths = getResolvedPaths(config);
    const cfg = mergeWithDefaults((await loadPluginConfig<MarketResearchPluginConfig>('market-research')) || undefined);

    const feedPath = path.join(process.cwd(), 'docs', 'intel', 'competitors_master.json');
    let feed: { generatedAt?: string; week?: string; sector?: string; anchor?: unknown; signals: Signal[] } = { signals: [] };
    if (fs.existsSync(feedPath)) {
        try {
            feed = JSON.parse(fs.readFileSync(feedPath, 'utf-8'));
        } catch {
            /* start fresh on parse error */
        }
    }

    const bundlePath = path.join(paths.rawDumps, 'market-research', 'bundle.json');
    const now = new Date().toISOString();
    const week = isoWeek(now);

    let market: Signal[] = [];
    if (fs.existsSync(bundlePath)) {
        const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf-8')) as ResearchBundle;
        market = buildMarketSignals(bundle, week, cfg.flagKeywords);
    } else {
        console.log('ℹ️ No bundle.json — refreshing curated feed only.');
    }

    // Keep curated + any non-market signals; replace all mkt-* with the fresh set.
    const kept = (feed.signals || []).filter((s) => !s.id.startsWith('mkt-'));
    const signals = [...kept, ...market];

    const next = {
        generatedAt: now,
        week,
        sector: feed.sector || cfg.sector,
        anchor: feed.anchor || { compsAvg: '10.9x', entry: '7.0x' },
        signals,
    };
    fs.mkdirSync(path.dirname(feedPath), { recursive: true });
    fs.writeFileSync(feedPath, JSON.stringify(next, null, 2));
    console.log(`📡 competitors_master.json — ${signals.length} signals (${kept.length} curated/kept + ${market.length} market) · ${week}`);

    const emailPath = path.join(paths.connectorData, 'market-research', 'email.html');
    fs.mkdirSync(path.dirname(emailPath), { recursive: true });
    fs.writeFileSync(emailPath, emailHtml(signals, week, now));
    console.log(`✉️  ${emailPath}`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `email=${emailPath}\nsignals=${signals.length}\n`);
}

main().catch((e) => {
    console.error('❌ signals failed:', e);
    process.exit(1);
});
