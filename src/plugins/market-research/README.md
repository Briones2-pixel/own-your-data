# 📈 Market Research (FEC) Plugin

A self-contained sector-research connector. It tracks the **Family Entertainment
Center (FEC)** universe by default — sector dynamics, public valuations, issuer
developments — and synthesizes **news, SEC filings, and broker research** into a
single dashboard with a **🚩 Flagged for Review** queue. Built for ongoing
*CloudBound* fundraising / pitch-deck preparation, but the universe is fully
configurable for any sector.

> Informational only — not investment advice. Always verify flagged items
> against the primary source before using them in a deck.

## What it tracks

| Stream | Source | No key? |
|--------|--------|---------|
| Quotes, 52-week range, 1M/3M momentum | [Stooq](https://stooq.com) CSV | ✅ |
| Issuer developments (8-K, 10-Q, 13D, S-1, offerings, merger proxies) | [SEC EDGAR](https://www.sec.gov/edgar) submissions API | ✅ |
| Issuer + sector news | Google News RSS | ✅ |
| Broker / analyst research | Local drop-in `.txt`/`.md` files | ✅ |

## Default universe

**Public comps:** Dave & Buster's (PLAY), Lucky Strike / ex-Bowlero (LUCK),
Topgolf Callaway (MODG), Six Flags / ex-Cedar Fair (FUN), United Parks (PRKS).
**News-only watchlist:** Chuck E. Cheese (CEC), Round One, and private
adventure-park / FEC franchises.

Edit the list any time from the config UI (`http://localhost:3777`).

## Commands

```bash
npm run market:get       # Collect quotes, filings, news, research notes
npm run market:process   # Synthesize the sector dashboard (markdown)
npm run market:push      # Sync to your GitHub repo
```

The scheduler runs `get → process → push` every ~12h by default.

## Flagging

Headlines and filings are scanned against keyword rules across **M&A /
strategic, capital markets, distress / credit, guidance / earnings, broker /
analyst actions, unit growth, and leadership**. Material SEC form types
(8-K, SC 13D, S-1, 424B5, merger proxies, late-filing notices) auto-flag.
Each flag carries a severity (🔴 high / 🟠 medium / 🟡 low) and the dashboard
sorts the most material items to the top. Add your own triggers via
**Extra flag keywords** in the config.

## Adding broker research

Export broker PDFs to text and drop them into
`raw-dumps/market-research/research/`. Each file's first line becomes its title
and an excerpt is folded into the **Broker / Analyst Research** section.

## Output

```
connector_data/market-research/
  market-research-YYYY-MM-DD.md   # dated history
  market-research-latest.md       # rolling latest
```

Sections: Overview · 🚩 Flagged for Review · 📊 Valuation Snapshot ·
🏢 Issuer Developments · 📰 News Digest · 📑 Broker Research · ℹ️ Methodology.
