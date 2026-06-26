# 📡 Cloudbound Intel — live feed + email

Makes the **Cloudbound Competitive Intelligence** board a *living* document and
emails you a digest on a schedule. Built around one data file the frontend
already uses: **`competitors_master.json`**.

## How it works
A scheduled GitHub Action (`.github/workflows/cloudbound-intel.yml`, weekdays
~08:12 ET) does, every run:
1. **Refreshes data** — runs the market-research connector (`get` + `process`).
2. **Rebuilds the feed** — `market:signals` regenerates the market-derived
   signals (ids `mkt-*`) from live prices/filings/news and **preserves your
   curated signals** (ids `cur-*`), writing `docs/intel/competitors_master.json`.
3. **Commits the feed** — so GitHub Pages / Vercel redeploy → the board updates.
4. **Emails the digest** — top signals by importance via Resend.

A live, self-contained board ships at **`docs/intel/index.html`** (renders the
feed, filters by type/time/keyword, auto-refreshes every 5 min).

## Connecting your existing Vercel app (`cloudbound-intel`)
Two ways:

- **Point it at this feed (no repo handoff):** in the app, change the
  `competitors_master.json` fetch to the published URL of this repo's copy
  (GitHub Pages: `https://<owner>.github.io/own-your-data/intel/competitors_master.json`,
  or the raw file URL). Done — it goes live on every scheduled commit.
- **Move the automation into that repo (cleanest):** add this workflow +
  `scripts/` + `signals.ts` to the `cloudbound-intel` repo so it commits the
  feed there directly and Vercel redeploys. (Requires that repo in scope.)

## Signal schema
```jsonc
{
  "generatedAt": "ISO", "week": "2026-W26", "sector": "...",
  "anchor": { "compsAvg": "10.9x", "entry": "7.0x" },
  "signals": [{
    "id": "cur-… or mkt-…",        // cur-* curated (kept); mkt-* auto-refreshed
    "type": "CAPITAL|EXPANSION|CONCEPT|DEMAND|TALENT|MARKETING",
    "company": "…", "headline": "…", "entities": "…", "geography": "US",
    "week": "2026-W26",
    "importance": 0-10, "confidence": 0-10, "impact": 0-10,
    "timeSensitivity": "high|medium|low",
    "cloudboundAction": "…", "sources": ["…"], "curated": true
  }]
}
```
Add or edit **curated** signals by hand in `competitors_master.json` (keep the
`cur-` id prefix) — the refresher never overwrites them.

## One-time setup for email
Add repo secrets (Settings → Secrets and variables → Actions):
- `RESEND_API_KEY` — free key from <https://resend.com>
- `EMAIL_TO` — your address (e.g. `brionesgerardo@gmail.com`)
- *(optional)* `EMAIL_FROM` — a verified sender on your own domain
- *(optional, repo **variable**)* `INTEL_URL` — the live board URL for the email button

Until those exist the workflow still runs and refreshes the board — it just
skips the email with a reminder.

## Run locally
```bash
npm run market:get && npm run market:process && npm run market:signals
# → docs/intel/competitors_master.json (+ connector_data/market-research/email.html)
```
