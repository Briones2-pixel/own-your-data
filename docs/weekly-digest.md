# 📬 FEC Weekly Digest — automated delivery

A scheduled GitHub Action (`.github/workflows/fec-weekly-digest.yml`) runs the
market-research connector **every Monday morning (~09:07 ET)**, ranks the most
material developments, builds a **Cloudbound-branded one-page digest PDF**, and
delivers it to your **Google Drive**.

It always also:
- saves the digest as a workflow **artifact** (Actions → run → Artifacts), and
- you can trigger it any time from **Actions → FEC Weekly Digest → Run workflow**.

## What's in the digest
- 🚩 **Most relevant this week** — flags ranked by severity (M&A, refinancing,
  earnings, analyst actions, openings, leadership) from news + SEC filings.
- 📊 **Live valuation snapshot** — last price, day move, 1-month momentum, and
  distance from the 52-week high for each public comp.
- The standing **10.9x comps → 7.0x entry** valuation anchor for context.

## One-time setup for Google Drive delivery

The Action needs a Google **service account** so it can write to your Drive
without a human login.

1. **Create a service account** in Google Cloud Console → IAM → Service
   Accounts. Enable the **Google Drive API** for the project. Create a **JSON
   key** and download it.
2. **Create (or pick) a Drive folder** for the digests. Open it and copy the
   folder ID from the URL: `drive.google.com/drive/folders/<THIS_ID>`.
3. **Share that folder** (Editor) with the service account's email
   (`...@...iam.gserviceaccount.com`).
4. **Add two repo secrets** (Settings → Secrets and variables → Actions):
   - `GDRIVE_SERVICE_ACCOUNT` → paste the **entire JSON key**
   - `GDRIVE_FOLDER_ID` → the folder ID from step 2
5. *(Optional)* Add a repo **variable** `MR_SEC_UA` with your contact string for
   SEC EDGAR (e.g. `Your Name your@email.com`).

That's it. Until those secrets exist the workflow still runs and the digest is
available as an artifact — it just skips the Drive upload with a reminder.

## Change cadence
Edit the `cron` in the workflow. It's standard 5-field cron in **UTC**:
- Weekly Mon AM (default): `7 13 * * 1`
- Daily weekdays: `7 13 * * 1-5`
- Every two weeks: keep weekly and gate in-script, or use `7 13 1,15 * *`

## Run locally
```bash
npm run market:get && npm run market:process && npm run market:digest
# → connector_data/market-research/weekly-digest-<date>.pdf
```
