/**
 * Market Research WEEKLY DIGEST — build a Cloudbound-branded one-page PDF
 * from the latest connector run, ranking the most material items.
 * Run: npm run market:digest  (after get + process)
 *
 * Data-driven: reads raw-dumps/market-research/bundle.json, ranks flags by
 * severity (the "most relevant" surface), builds a live valuation snapshot,
 * and renders a branded PDF via Playwright/Chromium. Fonts are base64-embedded
 * from @fontsource when present (CI installs them); otherwise it degrades to
 * system fonts so the job never hard-fails.
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
import { loadConfig, loadPluginConfig, getResolvedPaths } from '../../config/config';
import { mergeWithDefaults, MarketResearchPluginConfig } from './config';
import { collectFlags } from './dashboard';
import { ResearchBundle } from './types';
import { SEVERITY_ICON } from './flags';

const FS_DIR = path.join(process.cwd(), 'node_modules', '@fontsource');

function fontFace(fam: string, wt: number, style: string, file: string): string {
    const p = path.join(FS_DIR, file);
    if (!fs.existsSync(p)) return '';
    const b64 = fs.readFileSync(p).toString('base64');
    return `@font-face{font-family:'${fam}';font-weight:${wt};font-style:${style};font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
}

function buildFonts(): string {
    return [
        fontFace('DM Sans', 300, 'normal', 'dm-sans/files/dm-sans-latin-300-normal.woff2'),
        fontFace('DM Sans', 400, 'normal', 'dm-sans/files/dm-sans-latin-400-normal.woff2'),
        fontFace('DM Sans', 600, 'normal', 'dm-sans/files/dm-sans-latin-600-normal.woff2'),
        fontFace('DM Sans', 700, 'normal', 'dm-sans/files/dm-sans-latin-700-normal.woff2'),
        fontFace('Playfair Display', 700, 'normal', 'playfair-display/files/playfair-display-latin-700-normal.woff2'),
        fontFace('Playfair Display', 900, 'normal', 'playfair-display/files/playfair-display-latin-900-normal.woff2'),
        fontFace('Playfair Display', 700, 'italic', 'playfair-display/files/playfair-display-latin-700-italic.woff2'),
    ].filter(Boolean).join('\n');
}

function pct(n: number | null | undefined): string {
    if (n === null || n === undefined || !Number.isFinite(n)) return '—';
    return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}
function money(n: number | null | undefined): string {
    if (n === null || n === undefined || !Number.isFinite(n)) return '—';
    return `$${n.toFixed(2)}`;
}
function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildHtml(bundle: ResearchBundle, cfg: MarketResearchPluginConfig): string {
    const date = bundle.fetchedAt.split('T')[0];
    const flags = collectFlags(bundle, cfg.flagKeywords).slice(0, 12);
    const highs = flags.filter((f) => f.severity === 'high').length;

    const valRows = bundle.issuers
        .filter((i) => i.ticker)
        .map((i) => {
            const s = i.stats;
            return `<tr><td class="l">${esc(i.name)}</td><td>${i.ticker}</td><td>${money(s?.last ?? i.quote?.close ?? null)}</td><td>${pct(s?.dayChangePct)}</td><td>${pct(s?.mom1mPct)}</td><td class="mult">${pct(s?.pctFrom52High)}</td></tr>`;
        })
        .join('');

    const flagRows = flags.length
        ? flags
              .map((f) => {
                  const sevClass = f.severity === 'high' ? 'hi' : f.severity === 'medium' ? 'med' : '';
                  const t = esc(f.title).slice(0, 120);
                  const link = f.link ? `<a href="${esc(f.link)}" style="color:inherit;text-decoration:none;">${t}</a>` : t;
                  return `<div class="sig ${sevClass}"><div class="tag">${f.severity}</div><div class="sb"><b>${esc(f.subject)}</b> — ${link} <span style="color:#8c929b;">· ${f.categories.join(', ')}</span></div></div>`;
              })
              .join('')
        : '<p class="lead">No material events flagged this week — the comp set was quiet.</p>';

    return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildFonts()}
:root{--teal:#6ECAB8;--teal-dark:#3aaa8a;--lime:#C8F06A;--lime-dark:#7ab500;--peach:#F5C4A0;--sky:#A8D4F0;--black:#0F1218;--gray:#6B7280;--white:#FFF;--cream:#F2EFE8;}
*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
@page{size:210mm 297mm;margin:0;}
html,body{background:var(--cream);font-family:'DM Sans',Calibri,sans-serif;color:var(--black);-webkit-font-smoothing:antialiased;}
.page{width:210mm;min-height:297mm;padding:16mm 19mm 14mm;position:relative;}
.kick{font-weight:600;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:var(--teal-dark);}
h1{font-family:'Playfair Display';font-weight:900;font-size:38px;line-height:1.05;margin:8px 0 4px;}
em{font-style:italic;color:var(--teal-dark);}
.brand{position:absolute;top:13mm;right:19mm;font-family:'Playfair Display';font-weight:700;font-size:15px;}
.brand .o{color:var(--teal-dark);}
.lead{font-weight:300;font-size:13px;line-height:1.6;color:#23262d;max-width:640px;margin:6px 0 14px;}
.lead b{font-weight:600;}
.pill{display:inline-block;background:rgba(110,202,184,.18);border:1px solid rgba(110,202,184,.5);border-radius:100px;padding:5px 13px;font-weight:600;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--teal-dark);margin-bottom:6px;}
h2{font-family:'Playfair Display';font-weight:700;font-size:19px;margin:16px 0 8px;}
table{width:100%;border-collapse:collapse;}
th{font-weight:600;font-size:8.5px;letter-spacing:1.2px;text-transform:uppercase;color:var(--teal-dark);text-align:right;padding:5px 8px;border-bottom:1.5px solid rgba(15,18,24,.25);}
th.l{text-align:left;}
td{font-size:11.5px;padding:5px 8px;text-align:right;border-bottom:1px solid rgba(15,18,24,.08);}
td.l{text-align:left;font-weight:600;}
td.mult{font-family:'Playfair Display';font-weight:700;font-size:13px;color:var(--teal-dark);}
.sig{display:flex;gap:12px;align-items:flex-start;background:var(--white);border:1px solid rgba(15,18,24,.1);border-radius:12px;border-left:5px solid var(--teal);padding:9px 14px;margin-bottom:8px;}
.sig.hi{border-left-color:var(--peach);}.sig.med{border-left-color:var(--sky);}
.tag{flex:0 0 auto;font-weight:600;font-size:8px;letter-spacing:1.2px;text-transform:uppercase;color:var(--teal-dark);background:var(--cream);border-radius:100px;padding:3px 9px;margin-top:1px;}
.sig.hi .tag{color:#c2724a;}.sig.med .tag{color:#3f7fb0;}
.sb{font-size:11.5px;line-height:1.5;color:#23262d;}.sb b{font-weight:600;}
.anchor{background:var(--black);color:#fff;border-radius:14px;padding:14px 20px;margin:14px 0;display:flex;justify-content:space-between;align-items:center;}
.anchor .a-num{font-family:'Playfair Display';font-weight:700;font-size:22px;}
.anchor .a-num .lime{color:var(--lime);}.anchor .a-lab{font-size:11px;color:#aeb4bd;}
.foot{position:absolute;bottom:9mm;left:19mm;right:19mm;display:flex;justify-content:space-between;font-size:8.5px;letter-spacing:1px;color:var(--gray);text-transform:uppercase;}
.note{font-size:9px;font-style:italic;color:var(--gray);margin-top:8px;}
</style></head><body><div class="page">
<div class="brand"><span class="b">Cloud</span><span class="o">bound</span></div>
<div class="pill">Weekly FEC Digest · ${date}</div>
<h1>What <em>moved</em> in family entertainment</h1>
<p class="lead">${bundle.issuers.length} issuers tracked · <b>${flags.length} items flagged</b>${highs ? ` (<b>${highs} high-priority</b>)` : ''} · auto-generated by the Cloudbound market-research connector.</p>

<div class="anchor"><div><div class="a-num">10.9x <span style="font-size:13px;color:#aeb4bd;">comps</span> → <span class="lime">7.0x</span> <span style="font-size:13px;color:#aeb4bd;">entry</span></div></div><div class="a-lab">Valuation anchor ·<br>reference, unchanged</div></div>

<h2>🚩 Most relevant this week</h2>
${flagRows}

<h2>📊 Valuation snapshot — live</h2>
<table><thead><tr><th class="l">Issuer</th><th>Tkr</th><th>Last</th><th>Day</th><th>1M</th><th>% off 52w high</th></tr></thead><tbody>${valRows || '<tr><td class="l">No live quotes (source unavailable this run)</td></tr>'}</tbody></table>
<p class="note">Prices delayed (Stooq). Flags ranked by severity from news + SEC form types. Informational only — not investment advice; verify against primary filings.</p>

<div class="foot"><span>Cloudbound · Lava Island</span><span>Generated ${bundle.fetchedAt}</span></div>
</div></body></html>`;
}

async function main() {
    const config = await loadConfig();
    const paths = getResolvedPaths(config);
    const cfg = mergeWithDefaults((await loadPluginConfig<MarketResearchPluginConfig>('market-research')) || undefined);

    const rawDir = path.join(paths.rawDumps, 'market-research');
    const outDir = path.join(paths.connectorData, 'market-research');
    fs.mkdirSync(outDir, { recursive: true });

    const bundlePath = path.join(rawDir, 'bundle.json');
    if (!fs.existsSync(bundlePath)) {
        console.log('⚠️ No bundle.json — run `npm run market:get` first.');
        process.exit(0);
    }
    const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf-8')) as ResearchBundle;
    const date = bundle.fetchedAt.split('T')[0];

    const html = buildHtml(bundle, cfg);
    const htmlPath = path.join(outDir, `weekly-digest-${date}.html`);
    fs.writeFileSync(htmlPath, html);
    console.log(`📝 ${htmlPath}`);

    const pdfPath = path.join(outDir, `weekly-digest-${date}.pdf`);
    try {
        const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle' });
        await page.evaluate('document.fonts && document.fonts.ready');
        await page.pdf({ path: pdfPath, width: '210mm', height: '297mm', printBackground: true, preferCSSPageSize: true });
        await browser.close();
        console.log(`✅ Weekly digest PDF: ${pdfPath}`);
        // Expose path for the workflow to upload
        if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `pdf=${pdfPath}\n`);
    } catch (e: any) {
        console.log(`⚠️ PDF render skipped (${e.message}). HTML digest still written.`);
        if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `pdf=${htmlPath}\n`);
    }
}

main().catch((e) => {
    console.error('❌ digest failed:', e);
    process.exit(1);
});
