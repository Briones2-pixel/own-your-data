/**
 * Free, no-API-key data sources for the Market Research plugin.
 *
 *  - Stooq      — delayed equity quotes + daily price history (CSV)
 *  - SEC EDGAR  — ticker→CIK map + issuer filing history (JSON)
 *  - Google News — sector / issuer headlines (RSS)
 *
 * Everything degrades gracefully: a failing source returns an empty result and
 * logs a warning rather than throwing, so one dead endpoint never aborts a run.
 */

import { Filing, NewsItem, PriceStats, Quote } from './types';

const DEFAULT_TIMEOUT_MS = 20000;

/** fetch() with a timeout and a desktop-ish User-Agent. */
async function fetchText(
    url: string,
    opts: { headers?: Record<string, string>; timeoutMs?: number } = {}
): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                Accept: '*/*',
                ...opts.headers,
            },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
    } finally {
        clearTimeout(timer);
    }
}

function num(v: string | undefined): number | null {
    if (v === undefined) return null;
    const t = v.trim();
    if (!t || t === 'N/A' || t === '-') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
}

// ============ STOOQ: QUOTES ============

/**
 * Last quote for a US ticker.
 * Endpoint: https://stooq.com/q/l/?s=play.us&f=sd2t2ohlcvn&h&e=csv
 * Header:   Symbol,Date,Time,Open,High,Low,Close,Volume,Name
 */
export async function fetchQuote(ticker: string): Promise<Quote | null> {
    const url = `https://stooq.com/q/l/?s=${encodeURIComponent(ticker.toLowerCase())}.us&f=sd2t2ohlcvn&h&e=csv`;
    try {
        const csv = await fetchText(url);
        const lines = csv.trim().split('\n');
        if (lines.length < 2) return null;
        const cols = lines[1].split(',');
        // Symbol,Date,Time,Open,High,Low,Close,Volume,Name
        const close = num(cols[6]);
        if (close === null && (cols[1] || '').toUpperCase().includes('N/D')) return null;
        return {
            ticker: ticker.toUpperCase(),
            date: cols[1] || null,
            time: cols[2] || null,
            open: num(cols[3]),
            high: num(cols[4]),
            low: num(cols[5]),
            close,
            volume: num(cols[7]),
            name: cols.slice(8).join(',').trim() || null,
        };
    } catch (e: any) {
        console.log(`   ⚠️ quote ${ticker}: ${e.message}`);
        return null;
    }
}

// ============ STOOQ: HISTORY → STATS ============

interface Bar {
    date: string;
    close: number;
}

/**
 * Daily history for a US ticker.
 * Endpoint: https://stooq.com/q/d/l/?s=play.us&i=d
 * Header:   Date,Open,High,Low,Close,Volume
 */
async function fetchHistory(ticker: string): Promise<Bar[]> {
    const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(ticker.toLowerCase())}.us&i=d`;
    const csv = await fetchText(url);
    const lines = csv.trim().split('\n');
    if (lines.length < 2 || !lines[0].toLowerCase().startsWith('date')) return [];
    const bars: Bar[] = [];
    for (let i = 1; i < lines.length; i++) {
        const c = lines[i].split(',');
        const close = num(c[4]);
        if (c[0] && close !== null) bars.push({ date: c[0], close });
    }
    return bars;
}

function pctChange(from: number | null | undefined, to: number | null | undefined): number | null {
    if (from === null || from === undefined || to === null || to === undefined || from === 0) return null;
    return ((to - from) / from) * 100;
}

/** Compute 52-week range and momentum from daily history. */
export async function fetchPriceStats(ticker: string, historyDays: number): Promise<PriceStats | null> {
    try {
        const all = await fetchHistory(ticker);
        if (all.length === 0) return null;
        const window = all.slice(-Math.max(historyDays, 63));
        const closes = window.map((b) => b.close);
        const last = closes[closes.length - 1] ?? null;
        const prev = closes.length >= 2 ? closes[closes.length - 2] : null;
        const yr = window.slice(-252);
        const yrCloses = yr.map((b) => b.close);
        const week52High = yrCloses.length ? Math.max(...yrCloses) : null;
        const week52Low = yrCloses.length ? Math.min(...yrCloses) : null;
        const close1m = closes.length > 21 ? closes[closes.length - 1 - 21] : null;
        const close3m = closes.length > 63 ? closes[closes.length - 1 - 63] : null;
        return {
            last,
            dayChangePct: pctChange(prev, last),
            week52High,
            week52Low,
            pctFrom52High: week52High ? pctChange(week52High, last) : null,
            mom1mPct: pctChange(close1m, last),
            mom3mPct: pctChange(close3m, last),
            bars: window.length,
        };
    } catch (e: any) {
        console.log(`   ⚠️ history ${ticker}: ${e.message}`);
        return null;
    }
}

// ============ SEC EDGAR ============

let tickerCikCache: Map<string, string> | null = null;

/** Build (and cache) the ticker→CIK map from SEC's public file. */
export async function loadTickerCikMap(userAgent: string): Promise<Map<string, string>> {
    if (tickerCikCache) return tickerCikCache;
    const map = new Map<string, string>();
    try {
        const json = await fetchText('https://www.sec.gov/files/company_tickers.json', {
            headers: { 'User-Agent': userAgent },
        });
        const data = JSON.parse(json) as Record<string, { ticker: string; cik_str: number }>;
        for (const row of Object.values(data)) {
            if (row?.ticker) map.set(row.ticker.toUpperCase(), String(row.cik_str).padStart(10, '0'));
        }
    } catch (e: any) {
        console.log(`   ⚠️ SEC ticker map: ${e.message}`);
    }
    tickerCikCache = map;
    return map;
}

/** Resolve a CIK from an explicit value or the ticker map. */
export async function resolveCik(
    ticker: string | undefined,
    explicitCik: string | undefined,
    userAgent: string
): Promise<string | null> {
    if (explicitCik) return explicitCik.replace(/\D/g, '').padStart(10, '0');
    if (!ticker) return null;
    const map = await loadTickerCikMap(userAgent);
    return map.get(ticker.toUpperCase()) ?? null;
}

/**
 * Recent filings for an issuer via the EDGAR submissions API.
 * Endpoint: https://data.sec.gov/submissions/CIK##########.json
 */
export async function fetchFilings(cik: string, limit: number, userAgent: string): Promise<Filing[]> {
    const padded = cik.replace(/\D/g, '').padStart(10, '0');
    const url = `https://data.sec.gov/submissions/CIK${padded}.json`;
    try {
        const json = await fetchText(url, { headers: { 'User-Agent': userAgent } });
        const data = JSON.parse(json);
        const recent = data?.filings?.recent;
        if (!recent?.accessionNumber) return [];
        const cikNum = String(Number(padded)); // unpadded, for the Archives path
        const out: Filing[] = [];
        const n = recent.accessionNumber.length;
        for (let i = 0; i < n && out.length < limit; i++) {
            const accession: string = recent.accessionNumber[i];
            const accNoDash = accession.replace(/-/g, '');
            const primaryDocument: string = recent.primaryDocument?.[i] || '';
            const docUrl = primaryDocument
                ? `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accNoDash}/${primaryDocument}`
                : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${padded}&type=&dateb=&owner=include&count=40`;
            out.push({
                form: recent.form?.[i] || '',
                filingDate: recent.filingDate?.[i] || '',
                reportDate: recent.reportDate?.[i] || undefined,
                accession,
                primaryDocument: primaryDocument || undefined,
                primaryDescription: recent.primaryDocDescription?.[i] || undefined,
                url: docUrl,
            });
        }
        return out;
    } catch (e: any) {
        console.log(`   ⚠️ filings CIK ${cik}: ${e.message}`);
        return [];
    }
}

// ============ GOOGLE NEWS RSS ============

function decodeEntities(s: string): string {
    return s
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/<[^>]+>/g, '')
        .trim();
}

function tag(block: string, name: string): string | null {
    const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
    return m ? decodeEntities(m[1]) : null;
}

/**
 * Search Google News RSS for a query.
 * Endpoint: https://news.google.com/rss/search?q=...&hl=en-US&gl=US&ceid=US:en
 */
export async function fetchNews(query: string, subject: string, limit: number): Promise<NewsItem[]> {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    try {
        const xml = await fetchText(url);
        const items: NewsItem[] = [];
        const blocks = xml.split('<item>').slice(1);
        for (const raw of blocks) {
            const block = raw.split('</item>')[0];
            const title = tag(block, 'title');
            const link = tag(block, 'link');
            if (!title || !link) continue;
            items.push({
                title,
                link,
                pubDate: tag(block, 'pubDate'),
                source: tag(block, 'source'),
                subject,
            });
            if (items.length >= limit) break;
        }
        return items;
    } catch (e: any) {
        console.log(`   ⚠️ news "${query}": ${e.message}`);
        return [];
    }
}

/** Small helper so callers can be polite to rate-limited endpoints. */
export function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}
