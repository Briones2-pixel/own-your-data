/**
 * Cloudbound Intel SIGNALS refresh.
 * Run: npm run market:signals   (after get + process)
 *
 * Speaks the real Cloudbound Intel schema (signals scored on Importance /
 * Confidence / Impact / Time-sensitivity; Composite = (Imp+Impact)×Conf/10).
 *
 * It loads the latest weekly signal log, regenerates the market-derived signals
 * (ids "S-MKT-*") from the connector's live prices/filings/news, preserves the
 * hand-researched signals (any other id), and writes:
 *   docs/intel/data/signals/<ISO-week>-signals.json  (weekly archive)
 *   docs/intel/data/signals/latest.json              (what the dashboard reads)
 * plus an inline-styled email digest. Committing latest.json each run is what
 * makes the dashboard a living document.
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, loadPluginConfig, getResolvedPaths } from '../../config/config';
import { mergeWithDefaults, MarketResearchPluginConfig } from './config';
import { collectFlags } from './dashboard';
import { ResearchBundle, Flag } from './types';

type Category = 'Capital' | 'Expansion' | 'Concept' | 'Demand' | 'Marketing' | 'Industry' | 'Talent';

interface Signal {
    id: string;
    category: Category;
    subcategory: string;
    headline: string;
    companies: string[];
    geo: string;
    importance: number;
    confidence: number;
    impact: number;
    time_sensitivity: string;
    cloudbound_action: string;
    sources: string[];
}

interface WeeklyLog {
    report_window: string;
    methodology: string;
    signals: Signal[];
    tracker_corrections?: unknown[];
    new_competitors_to_add?: unknown[];
}

const METHODOLOGY =
    'Signals scored 1–10 on Importance (strategic weight), Confidence (source quality), Cloudbound Impact (relevance to AHRA/concept/operation), and Time Sensitivity (decay rate of action window). Composite = (Importance + Impact) × Confidence / 10.';

function isoWeek(d: Date): string {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - day + 3);
    const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((t.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
    return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const CAT: Record<string, Category> = {
    'M&A / Strategic': 'Capital',
    'Capital Markets': 'Capital',
    'Distress / Credit': 'Capital',
    'Issuer Development': 'Capital',
    'Broker / Analyst': 'Capital',
    'Guidance / Earnings': 'Demand',
    'Unit Growth': 'Expansion',
    Leadership: 'Talent',
    Ownership: 'Capital',
    Watchlist: 'Concept',
};

function sev(s: Flag['severity']): { imp: number; impact: number; time: string } {
    if (s === 'high') return { imp: 9, impact: 8, time: 'high' };
    if (s === 'medium') return { imp: 6, impact: 6, time: 'medium' };
    return { imp: 4, impact: 4, time: 'low' };
}
function hash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36).slice(0, 6);
}
function composite(s: Signal): number {
    return Math.round((((s.importance + s.impact) * s.confidence) / 10) * 10) / 10;
}
function esc(x: string): string {
    return String(x || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fmtPct(n: number | null | undefined): string {
    return n === null || n === undefined || !Number.isFinite(n) ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function buildMarketSignals(bundle: ResearchBundle, extraKw: string[]): Signal[] {
    const out: Signal[] = [];
    for (const i of bundle.issuers) {
        if (!i.ticker || !i.stats) continue;
        const s = i.stats;
        const hot = Math.abs(s.mom3mPct ?? 0) >= 15 || Math.abs(s.dayChangePct ?? 0) >= 5;
        out.push({
            id: `S-MKT-q-${i.ticker.toLowerCase()}`,
            category: 'Capital',
            subcategory: 'Public comp — market read',
            headline: `${i.name} (${i.ticker}): ${s.last != null ? '$' + s.last.toFixed(2) : 'n/a'} · day ${fmtPct(s.dayChangePct)} · 1M ${fmtPct(s.mom1mPct)} · 3M ${fmtPct(s.mom3mPct)} · ${fmtPct(s.pctFrom52High)} off 52-wk high.`,
            companies: [i.name],
            geo: 'US',
            importance: hot ? 7 : 5,
            confidence: 9,
            impact: hot ? 7 : 4,
            time_sensitivity: Math.abs(s.dayChangePct ?? 0) >= 5 ? 'high' : 'low',
            cloudbound_action: 'Public read-through on FEC demand & valuation; anchor vs. ~10.9x comps / 7.0x entry.',
            sources: i.cik ? [`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${i.cik}&type=&dateb=&owner=include&count=40`] : [],
        });
    }
    for (const f of collectFlags(bundle, extraKw).slice(0, 30)) {
        const sc = sev(f.severity);
        out.push({
            id: `S-MKT-${f.kind}-${hash(f.subject + f.title)}`,
            category: CAT[f.categories[0]] || 'Concept',
            subcategory: f.categories.join(' / '),
            headline: `${f.subject}: ${f.title}`,
            companies: [f.subject],
            geo: 'US',
            importance: sc.imp,
            confidence: f.kind === 'filing' ? 9 : 7,
            impact: sc.impact,
            time_sensitivity: sc.time,
            cloudbound_action: 'Flagged for review — verify against the primary source before acting.',
            sources: f.link ? [f.link] : [],
        });
    }
    return out;
}

function loadBase(signalsDir: string): WeeklyLog {
    const latest = path.join(signalsDir, 'latest.json');
    let file = '';
    if (fs.existsSync(latest)) file = latest;
    else {
        try {
            const weekly = fs
                .readdirSync(signalsDir)
                .filter((f) => /-signals\.json$/.test(f))
                .sort();
            if (weekly.length) file = path.join(signalsDir, weekly[weekly.length - 1]);
        } catch {
            /* none yet */
        }
    }
    if (file) {
        try {
            return JSON.parse(fs.readFileSync(file, 'utf-8')) as WeeklyLog;
        } catch {
            /* fall through */
        }
    }
    return { report_window: '', methodology: METHODOLOGY, signals: [] };
}

function emailHtml(log: WeeklyLog, generatedAt: string): string {
    const date = generatedAt.split('T')[0];
    const top = [...log.signals].sort((a, b) => composite(b) - composite(a)).slice(0, 10);
    const url = process.env.INTEL_URL || '#';
    const rows = top
        .map((s) => {
            const c = s.time_sensitivity.startsWith('high') ? '#c2361b' : s.time_sensitivity.startsWith('medium') ? '#b97a2b' : '#2f6b3a';
            return `<tr><td style="padding:9px 0;border-bottom:1px solid #eee;font-family:Arial,sans-serif;font-size:14px;color:#0b0d10;">
<span style="display:inline-block;font-size:10px;font-weight:bold;color:#fff;background:#1b3a5b;padding:2px 7px;border-radius:3px;">${esc(s.category)}</span>
&nbsp;${esc(s.headline)}
<span style="color:${c};font-size:11px;font-weight:bold;"> · ${esc(s.time_sensitivity.split('—')[0].trim())}</span>
<span style="color:#5a5e66;font-size:11px;"> · composite ${composite(s)}</span></td></tr>`;
        })
        .join('');
    return `<!doctype html><html><body style="margin:0;background:#fbfaf7;padding:24px;">
<div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e3e0d8;border-radius:6px;overflow:hidden;">
<div style="padding:18px 26px;border-bottom:1px solid #e3e0d8;">
  <div style="font-family:Georgia,serif;font-weight:600;font-size:20px;color:#0b0d10;">Cloudbound · Competitive Intelligence</div>
  <div style="font-family:Arial,sans-serif;font-size:12px;color:#5a5e66;margin-top:2px;">${esc(log.report_window || date)} · top signals by composite score</div>
</div>
<div style="padding:20px 26px;">
  <p style="font-family:Arial,sans-serif;font-size:13px;color:#3a3f48;margin:0 0 12px;">${log.signals.length} tracked signals this cycle. Composite = (Importance + Impact) × Confidence / 10.</p>
  <table style="width:100%;border-collapse:collapse;">${rows}</table>
  <div style="margin:22px 0 4px;"><a href="${esc(url)}" style="display:inline-block;background:#c4361b;color:#fff;font-family:Arial,sans-serif;font-weight:bold;font-size:14px;text-decoration:none;padding:11px 20px;border-radius:3px;">Open the dashboard →</a></div>
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#5a5e66;margin-top:16px;">Informational only — not investment advice.</p>
</div></div></body></html>`;
}

async function main() {
    const config = await loadConfig();
    const paths = getResolvedPaths(config);
    const cfg = mergeWithDefaults((await loadPluginConfig<MarketResearchPluginConfig>('market-research')) || undefined);

    const signalsDir = path.join(process.cwd(), 'docs', 'intel', 'data', 'signals');
    fs.mkdirSync(signalsDir, { recursive: true });

    const base = loadBase(signalsDir);
    const now = new Date();
    const week = isoWeek(now);

    let market: Signal[] = [];
    const bundlePath = path.join(paths.rawDumps, 'market-research', 'bundle.json');
    if (fs.existsSync(bundlePath)) {
        const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf-8')) as ResearchBundle;
        market = buildMarketSignals(bundle, cfg.flagKeywords);
    } else {
        console.log('ℹ️ No bundle.json — carrying curated signals, no market refresh.');
    }

    const curated = base.signals.filter((s) => !s.id.startsWith('S-MKT-'));
    const next: WeeklyLog = {
        report_window: `${week} (refreshed ${now.toISOString().split('T')[0]})`,
        methodology: base.methodology || METHODOLOGY,
        signals: [...curated, ...market],
        tracker_corrections: base.tracker_corrections,
        new_competitors_to_add: base.new_competitors_to_add,
    };

    const weeklyPath = path.join(signalsDir, `${week}-signals.json`);
    const latestPath = path.join(signalsDir, 'latest.json');
    fs.writeFileSync(weeklyPath, JSON.stringify(next, null, 2));
    fs.writeFileSync(latestPath, JSON.stringify(next, null, 2));
    console.log(`📡 ${week}: ${next.signals.length} signals (${curated.length} curated + ${market.length} market) → latest.json`);

    const emailPath = path.join(paths.connectorData, 'market-research', 'email.html');
    fs.mkdirSync(path.dirname(emailPath), { recursive: true });
    fs.writeFileSync(emailPath, emailHtml(next, now.toISOString()));
    console.log(`✉️  ${emailPath}`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `email=${emailPath}\nsignals=${next.signals.length}\n`);
}

main().catch((e) => {
    console.error('❌ signals failed:', e);
    process.exit(1);
});
