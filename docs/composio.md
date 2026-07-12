# Composio setup

Composio is set up **non-interactively** here, because the standard
`composio login` opens a browser OAuth flow that can't run in headless
environments (CI, Claude Code's remote container, SSH boxes).

## One-time setup

1. **Allowlist network egress.** Composio's installer and API live on
   `composio.dev`. In restricted environments (e.g. Claude Code on the web),
   an admin must add `composio.dev` and `*.composio.dev` to the environment's
   network policy first. See
   https://code.claude.com/docs/en/claude-code-on-the-web.

2. **Get an API key.** https://app.composio.dev → Settings → API Keys.

3. **Store the key** in the gitignored `.env` at the repo root:

   ```
   COMPOSIO_API_KEY=comp_xxxxxxxxxxxxxxxx
   ```

4. **Run the setup script:**

   ```bash
   ./scripts/setup-composio.sh
   ```

   It installs the CLI (if missing) and authenticates using
   `COMPOSIO_API_KEY` — no browser required.

## Why not `composio login`?

`composio login` requires an interactive browser handshake. API-key auth via
`COMPOSIO_API_KEY` is the supported headless equivalent and is what both the
Composio CLI and SDK read. Run `composio login` yourself only on a local
machine with a browser if you specifically want the OAuth-session flow.

## Notes

- The API key is a secret. It belongs in `.env` (gitignored), never in
  committed config. `config/composio.example.json` is only a non-secret
  template.
- The CLI stores its own credentials under `~/.composio/`, outside this repo.
