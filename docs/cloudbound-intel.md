# 📡 Cloudbound Intel — live dashboard + email

Makes the **Cloudbound Competitive Intelligence** dashboard a *living* document
and emails you a digest on a schedule. Aligned to the real system schema
(signals scored on Importance / Confidence / Impact / Time-sensitivity;
Composite = (Imp+Impact)×Conf/10).

## Layout (mirrors `07 — Competitors/intel`)
```
docs/intel/
├── README.md                         # system notes
├── dashboard/index.html              # live board (reads data/signals/latest.json)
└── data/
    ├── competitors_master.csv/.json  # 205-company master tracker
    └── signals/
        ├── 2026-W26-signals.json     # weekly archive
        └── latest.json               # what the dashboard reads (refreshed each run)
```

## How "live" works
A scheduled GitHub Action (`.github/workflows/cloudbound-intel.yml`, weekdays
~08:12 ET) each run:
1. **Refreshes data** — runs the market connector (`get` + `process`).
2. **Rebuilds signals** — `market:signals` regenerates the market-derived signals
   (ids `S-MKT-*`) from live prices/filings/news and **preserves the hand-
   researched signals** (`S-2026-*`), writing `<week>-signals.json` + `latest.json`.
3. **Commits the feed** — Pages/Vercel redeploy → the dashboard updates.
4. **Emails the digest** — top signals by composite score via Resend.

The dashboard re-pulls `latest.json` every 10 min and recomputes the KPI bar.

## Connect your existing Vercel app
- **Point it at this feed (one line):** change the dashboard's fetch to this
  repo's published `…/intel/data/signals/latest.json` (GitHub Pages or raw URL).
- **Or move the automation into the `cloudbound-intel` repo** so it commits the
  feed there and Vercel redeploys (needs that repo in scope).

## Adding / editing curated signals
Hand-written signals live in the weekly JSON with non-`S-MKT-` ids (e.g.
`S-2026-0001`). The refresher **never overwrites them** — it only replaces the
`S-MKT-*` block. Edit them in `data/signals/latest.json` (or the weekly file).

## One-time setup for email
Repo secrets (Settings → Secrets and variables → Actions):
- `RESEND_API_KEY` — free key from <https://resend.com>
- `EMAIL_TO` — your address (e.g. `brionesgerardo@gmail.com`)
- *(optional)* `EMAIL_FROM` — a verified sender on your domain
- *(optional, repo **variable**)* `INTEL_URL` — live dashboard URL for the email button

Until set, the workflow still refreshes the board; it just skips the email.

## Run locally
```bash
npm run market:get && npm run market:process && npm run market:signals
# → docs/intel/data/signals/latest.json (+ connector_data/market-research/email.html)
# preview: (cd docs/intel && python3 -m http.server) → open /dashboard/index.html
```
