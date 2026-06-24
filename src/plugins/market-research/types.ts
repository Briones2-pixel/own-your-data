/**
 * Market Research plugin — shared data types
 *
 * The plugin tracks a sector (default: Family Entertainment Centers) across
 * three signal streams — market quotes/valuations, SEC filings (issuer
 * developments), and news/broker research — then synthesizes them into a
 * single sector dashboard with a "flagged for review" queue.
 */

/** A tracked issuer. `ticker` is optional: news-only watchlist names (private
 *  operators, debt issuers) have no listed equity. */
export interface Issuer {
    /** Display name, e.g. "Dave & Buster's Entertainment" */
    name: string;
    /** Listed equity ticker (US), e.g. "PLAY". Omit for private / debt-only names. */
    ticker?: string;
    /** SEC Central Index Key. Auto-resolved from ticker if omitted. */
    cik?: string;
    /** Extra search terms used for news matching (brands, subsidiaries). */
    aliases?: string[];
    /** Free-form note shown in the dashboard (e.g. "owns Main Event"). */
    note?: string;
}

/** A point-in-time market quote (Stooq). */
export interface Quote {
    ticker: string;
    name: string | null;
    date: string | null;
    time: string | null;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    volume: number | null;
}

/** Price-derived metrics computed from daily history. */
export interface PriceStats {
    last: number | null;
    /** Day-over-day change %, from the two most recent closes. */
    dayChangePct: number | null;
    week52High: number | null;
    week52Low: number | null;
    /** Percent below the trailing 52-week high (0 = at the high). */
    pctFrom52High: number | null;
    /** ~1 month (21 trading days) momentum %. */
    mom1mPct: number | null;
    /** ~3 month (63 trading days) momentum %. */
    mom3mPct: number | null;
    /** Number of daily bars used. */
    bars: number;
}

/** A single SEC filing (from the EDGAR submissions API). */
export interface Filing {
    form: string;
    filingDate: string;
    /** Filing period / report date when present. */
    reportDate?: string;
    accession: string;
    primaryDocument?: string;
    primaryDescription?: string;
    url: string;
}

/** A news item parsed from a Google News RSS feed. */
export interface NewsItem {
    title: string;
    link: string;
    pubDate: string | null;
    /** Publisher / source name when available. */
    source: string | null;
    /** Issuer name this item was matched to, or "Sector" for sector queries. */
    subject: string;
}

/** A manually-supplied broker / analyst research note (dropped as a text file). */
export interface ResearchNote {
    /** Source filename. */
    file: string;
    /** First non-empty line, used as a title. */
    title: string;
    /** Full text. */
    text: string;
    /** ISO date the file was last modified. */
    date: string;
}

/** Everything collected for one issuer in a single `get` run. */
export interface IssuerSnapshot {
    name: string;
    ticker: string | null;
    cik: string | null;
    note?: string;
    fetchedAt: string;
    quote: Quote | null;
    stats: PriceStats | null;
    filings: Filing[];
    news: NewsItem[];
}

/** The full raw payload written by `get` and read by `process` / `push`. */
export interface ResearchBundle {
    fetchedAt: string;
    sector: string;
    issuers: IssuerSnapshot[];
    sectorNews: NewsItem[];
    research: ResearchNote[];
}

/** A flag raised by the rules engine against a news item or filing. */
export interface Flag {
    subject: string;
    /** "news" | "filing" */
    kind: 'news' | 'filing';
    severity: 'high' | 'medium' | 'low';
    /** Matched flag categories, e.g. ["M&A", "Capital markets"]. */
    categories: string[];
    title: string;
    link: string;
    date: string | null;
    /** Short human-readable reason. */
    reason: string;
}
