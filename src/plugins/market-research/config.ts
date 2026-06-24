/**
 * Market Research plugin configuration types and defaults.
 *
 * Defaults are seeded for the Family Entertainment Center (FEC) sector so the
 * plugin is useful out of the box. Everything is editable from the config UI.
 */

import { BasePluginConfig } from '../types';
import { Issuer } from './types';

export interface MarketResearchPluginConfig extends BasePluginConfig {
    /** Sector label used in headings and sector-news queries. */
    sector: string;

    /** Issuers to track (public comps + private/debt watchlist). */
    issuers: Issuer[];

    /** Sector-level news search queries (not tied to a single issuer). */
    sectorQueries: string[];

    /** Extra keywords merged into the built-in flag rules. */
    flagKeywords: string[];

    /** Max news items to keep per query. */
    newsPerQuery: number;

    /** Trading days of daily history to pull for momentum / 52-week stats. */
    historyDays: number;

    /** Contact string sent as User-Agent to SEC EDGAR (they require one). */
    secUserAgent: string;

    /** GitHub path for this plugin's data. */
    githubPath: string;
}

/**
 * Default FEC universe.
 * Public comps carry a ticker; private operators / debt issuers are news-only.
 */
const DEFAULT_ISSUERS: Issuer[] = [
    {
        name: "Dave & Buster's Entertainment",
        ticker: 'PLAY',
        aliases: ['Dave & Buster', 'Dave and Buster', 'Main Event Entertainment'],
        note: 'Eatertainment leader; owns Main Event',
    },
    {
        name: 'Lucky Strike Entertainment',
        ticker: 'LUCK',
        aliases: ['Bowlero', 'Lucky Strike', 'Bowlero Corp'],
        note: 'Formerly Bowlero; bowling + location-based entertainment',
    },
    {
        name: 'Topgolf Callaway Brands',
        ticker: 'MODG',
        aliases: ['Topgolf', 'Callaway'],
        note: 'Topgolf venues (golf-entertainment); strategic separation in progress',
    },
    {
        name: 'Six Flags Entertainment',
        ticker: 'FUN',
        aliases: ['Six Flags', 'Cedar Fair'],
        note: 'Regional amusement parks (Cedar Fair + Six Flags merger)',
    },
    {
        name: 'United Parks & Resorts',
        ticker: 'PRKS',
        aliases: ['SeaWorld', 'United Parks'],
        note: 'Theme parks; adjacent location-based entertainment comp',
    },
    // ---- Private operators / debt issuers (news-only watchlist) ----
    {
        name: 'CEC Entertainment (Chuck E. Cheese)',
        aliases: ['Chuck E. Cheese', 'CEC Entertainment', 'Peter Piper Pizza'],
        note: 'Private (Apollo-backed); has traded high-yield debt',
    },
    {
        name: 'Round One Entertainment',
        aliases: ['Round1', 'Round One'],
        note: 'Japanese-listed arcade/bowling operator expanding in the US',
    },
    {
        name: 'Scene75 / Urban Air / Sky Zone',
        aliases: ['Scene75', 'Urban Air Adventure Park', 'Sky Zone', 'CircusTrix', 'Unleashed Brands'],
        note: 'Private FEC / adventure-park franchises (sector reads)',
    },
];

export const DEFAULT_CONFIG: MarketResearchPluginConfig = {
    enabled: true,
    sector: 'Family Entertainment Centers',
    issuers: DEFAULT_ISSUERS,
    sectorQueries: [
        'family entertainment center industry',
        'location based entertainment market',
        'eatertainment trends consumer spending',
        'arcade bowling industry revenue',
    ],
    flagKeywords: [],
    newsPerQuery: 12,
    historyDays: 300,
    secUserAgent: 'own-your-data market-research (configure contact in plugin settings)',
    githubPath: 'market-research',
};

/**
 * Merge user config with defaults (shallow, but arrays fall back to defaults
 * only when absent so an explicit empty list is respected).
 */
export function mergeWithDefaults(config?: Partial<MarketResearchPluginConfig>): MarketResearchPluginConfig {
    return {
        ...DEFAULT_CONFIG,
        ...config,
        issuers: config?.issuers ?? DEFAULT_CONFIG.issuers,
        sectorQueries: config?.sectorQueries ?? DEFAULT_CONFIG.sectorQueries,
        flagKeywords: config?.flagKeywords ?? DEFAULT_CONFIG.flagKeywords,
    };
}
