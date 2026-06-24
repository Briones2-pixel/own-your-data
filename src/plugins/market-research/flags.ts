/**
 * Flag-rules engine.
 *
 * Scans news headlines and SEC filings for the kinds of events an analyst would
 * want surfaced for review: M&A, financing/capital-markets activity, distress,
 * guidance/earnings moves, broker/analyst actions, unit growth, and leadership
 * changes. Each match becomes a {@link Flag} tagged with one or more categories
 * and a severity, so the dashboard can sort the most material items to the top.
 */

import { Filing, Flag, NewsItem } from './types';

interface Rule {
    category: string;
    severity: 'high' | 'medium' | 'low';
    /** Lower-cased keyword/phrases. Word-boundary matched. */
    keywords: string[];
}

const RULES: Rule[] = [
    {
        category: 'M&A / Strategic',
        severity: 'high',
        keywords: [
            'acquire', 'acquisition', 'acquires', 'merger', 'merge', 'buyout',
            'takeover', 'take private', 'go private', 'going private', 'divest',
            'divestiture', 'sale of', 'strategic review', 'strategic alternatives',
            'spin-off', 'spinoff', 'separation', 'stake in', 'majority stake',
        ],
    },
    {
        category: 'Distress / Credit',
        severity: 'high',
        keywords: [
            'bankruptcy', 'chapter 11', 'chapter 7', 'default', 'restructuring',
            'covenant', 'going concern', 'liquidity crisis', 'distressed',
            'delist', 'delisting', 'forbearance', 'missed payment',
        ],
    },
    {
        category: 'Capital Markets',
        severity: 'medium',
        keywords: [
            'refinance', 'refinancing', 'senior notes', 'notes offering',
            'term loan', 'credit facility', 'bond offering', 'convertible',
            'secondary offering', 'public offering', 'private placement',
            'dividend', 'buyback', 'repurchase', 'recapitalization', 'ipo',
        ],
    },
    {
        category: 'Guidance / Earnings',
        severity: 'medium',
        keywords: [
            'guidance', 'outlook', 'cuts forecast', 'raises forecast',
            'profit warning', 'preliminary results', 'same-store', 'same store',
            'comparable sales', 'comp sales', 'foot traffic', 'misses estimates',
            'beats estimates', 'earnings', 'quarterly results', 'revenue decline',
        ],
    },
    {
        category: 'Broker / Analyst',
        severity: 'medium',
        keywords: [
            'price target', 'upgrade', 'downgrade', 'initiates coverage',
            'initiated coverage', 'reiterates', 'overweight', 'underweight',
            'outperform', 'underperform', 'buy rating', 'sell rating',
            'neutral rating', 'analyst', 'raised to', 'lowered to',
        ],
    },
    {
        category: 'Unit Growth',
        severity: 'low',
        keywords: [
            'new location', 'new venue', 'grand opening', 'opening', 'openings',
            'expansion', 'expand', 'new store', 'remodel', 'flagship',
            'square feet', 'pipeline of',
        ],
    },
    {
        category: 'Leadership',
        severity: 'low',
        keywords: [
            'chief executive', 'ceo', 'cfo', 'resign', 'resigns', 'steps down',
            'appoints', 'names new', 'board of directors', 'activist investor',
        ],
    },
];

/** SEC form types that are inherently material and always worth a look. */
const FILING_FLAGS: Record<string, { category: string; severity: 'high' | 'medium' | 'low'; reason: string }> = {
    '8-K': { category: 'Issuer Development', severity: 'medium', reason: 'Material event (8-K)' },
    '8-K/A': { category: 'Issuer Development', severity: 'medium', reason: 'Amended material event (8-K/A)' },
    'SC 13D': { category: 'M&A / Strategic', severity: 'high', reason: 'Activist / >5% stake (SC 13D)' },
    'SC 13D/A': { category: 'M&A / Strategic', severity: 'high', reason: 'Amended activist stake (SC 13D/A)' },
    'SC 13G': { category: 'Ownership', severity: 'low', reason: 'Passive >5% stake (SC 13G)' },
    'S-1': { category: 'Capital Markets', severity: 'high', reason: 'IPO / registration (S-1)' },
    'S-3': { category: 'Capital Markets', severity: 'medium', reason: 'Shelf registration (S-3)' },
    '424B5': { category: 'Capital Markets', severity: 'high', reason: 'Securities offering (424B5)' },
    '424B3': { category: 'Capital Markets', severity: 'medium', reason: 'Prospectus (424B3)' },
    'DEFM14A': { category: 'M&A / Strategic', severity: 'high', reason: 'Merger proxy (DEFM14A)' },
    'PREM14A': { category: 'M&A / Strategic', severity: 'high', reason: 'Preliminary merger proxy (PREM14A)' },
    '15-12B': { category: 'Distress / Credit', severity: 'high', reason: 'Deregistration / delisting (Form 15)' },
    'NT 10-Q': { category: 'Distress / Credit', severity: 'high', reason: 'Late filing notice (NT 10-Q)' },
    'NT 10-K': { category: 'Distress / Credit', severity: 'high', reason: 'Late filing notice (NT 10-K)' },
};

const SEVERITY_RANK: Record<Flag['severity'], number> = { high: 3, medium: 2, low: 1 };

function matchKeywords(haystack: string, extraKeywords: string[]): { categories: string[]; severity: Flag['severity'] } {
    const text = ` ${haystack.toLowerCase()} `;
    const categories = new Set<string>();
    let severity: Flag['severity'] = 'low';

    for (const rule of RULES) {
        for (const kw of rule.keywords) {
            // Substring match is good enough for short headlines. Multi-word
            // phrases are inherently specific; single words are padded with a
            // leading space to avoid matching inside larger words.
            const needle = kw.includes(' ') ? kw : ` ${kw}`;
            if (text.includes(needle)) {
                categories.add(rule.category);
                if (SEVERITY_RANK[rule.severity] > SEVERITY_RANK[severity]) severity = rule.severity;
                break;
            }
        }
    }

    // User-supplied custom keywords → medium severity "Watchlist" category.
    for (const kw of extraKeywords) {
        const k = kw.trim().toLowerCase();
        if (k.length >= 2 && text.includes(k)) {
            categories.add('Watchlist');
            if (SEVERITY_RANK['medium'] > SEVERITY_RANK[severity]) severity = 'medium';
        }
    }

    return { categories: [...categories], severity };
}

/** Flag a news item if its headline matches any rule. Returns null if clean. */
export function flagNews(item: NewsItem, extraKeywords: string[]): Flag | null {
    const { categories, severity } = matchKeywords(item.title, extraKeywords);
    if (categories.length === 0) return null;
    return {
        subject: item.subject,
        kind: 'news',
        severity,
        categories,
        title: item.title,
        link: item.link,
        date: item.pubDate,
        reason: categories.join(', '),
    };
}

/** Flag a filing if its form type is material. Returns null otherwise. */
export function flagFiling(subject: string, filing: Filing): Flag | null {
    const rule = FILING_FLAGS[filing.form.toUpperCase()];
    if (!rule) return null;
    return {
        subject,
        kind: 'filing',
        severity: rule.severity,
        categories: [rule.category],
        title: `${filing.form}${filing.primaryDescription ? ` — ${filing.primaryDescription}` : ''}`,
        link: filing.url,
        date: filing.filingDate,
        reason: rule.reason,
    };
}

/** Sort flags most-material-first: severity desc, then date desc. */
export function sortFlags(flags: Flag[]): Flag[] {
    return [...flags].sort((a, b) => {
        const s = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
        if (s !== 0) return s;
        const da = a.date ? Date.parse(a.date) : 0;
        const db = b.date ? Date.parse(b.date) : 0;
        return (db || 0) - (da || 0);
    });
}

export const SEVERITY_ICON: Record<Flag['severity'], string> = {
    high: '🔴',
    medium: '🟠',
    low: '🟡',
};
