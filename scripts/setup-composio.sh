#!/usr/bin/env bash
#
# setup-composio.sh — install the Composio CLI and authenticate non-interactively.
#
# Why this script exists
# ----------------------
# The documented setup is two interactive commands:
#     curl -fsSL https://composio.dev/install | bash
#     composio login
# The second opens a browser OAuth flow, which cannot run in a headless
# environment (CI, Claude Code's remote container, a plain SSH box). This
# script replaces `composio login` with API-key auth, which the Composio CLI
# and SDK both honor via the COMPOSIO_API_KEY environment variable.
#
# Prerequisites
# -------------
#   1. Network egress to composio.dev must be allowed. In restricted
#      environments (e.g. Claude Code on the web) an admin must allowlist
#      `composio.dev` and `*.composio.dev` in the environment's network policy.
#   2. A Composio API key. Get one from https://app.composio.dev (Settings ->
#      API Keys) and put it in the repo's .env file (which is gitignored):
#          COMPOSIO_API_KEY=comp_xxxxxxxxxxxxxxxx
#      or export it in your shell before running this script.
#
# Usage
# -----
#     ./scripts/setup-composio.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log()  { printf '\033[0;34m[composio]\033[0m %s\n' "$*"; }
warn() { printf '\033[0;33m[composio]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[0;31m[composio] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# --- 1. Load the API key (env var wins; otherwise read from .env) ------------
if [[ -z "${COMPOSIO_API_KEY:-}" && -f "$REPO_ROOT/.env" ]]; then
  # Grab COMPOSIO_API_KEY from .env without sourcing the whole file.
  COMPOSIO_API_KEY="$(grep -E '^\s*COMPOSIO_API_KEY\s*=' "$REPO_ROOT/.env" \
    | tail -n1 | cut -d= -f2- | sed -e 's/^["'"'"' ]*//' -e 's/["'"'"' ]*$//')"
  export COMPOSIO_API_KEY
fi

if [[ -z "${COMPOSIO_API_KEY:-}" ]]; then
  die "COMPOSIO_API_KEY is not set. Add it to $REPO_ROOT/.env or export it, then re-run.
       Get a key at https://app.composio.dev (Settings -> API Keys)."
fi

# --- 2. Install the CLI if it isn't already on PATH --------------------------
if command -v composio >/dev/null 2>&1; then
  log "Composio CLI already installed: $(composio --version 2>/dev/null || echo present)"
else
  log "Installing Composio CLI from https://composio.dev/install ..."
  if ! curl -fsSL https://composio.dev/install | bash; then
    die "Install failed. If you saw a 403/407, composio.dev is blocked by your
         network policy — allowlist composio.dev and *.composio.dev, then re-run."
  fi
  # The installer typically drops the binary in ~/.composio/bin or ~/.local/bin.
  export PATH="$HOME/.composio/bin:$HOME/.local/bin:$PATH"
  command -v composio >/dev/null 2>&1 \
    || die "Composio installed but not on PATH. Add ~/.composio/bin (or the path
            printed above) to your PATH and re-run."
fi

# --- 3. Authenticate non-interactively --------------------------------------
# Preferred: persist the key via the CLI's non-interactive login flag.
# Fallback: the exported COMPOSIO_API_KEY alone is enough for the SDK/CLI.
log "Authenticating with the provided COMPOSIO_API_KEY ..."
if composio login --help 2>/dev/null | grep -q -- '--api-key'; then
  composio login --api-key "$COMPOSIO_API_KEY" \
    || warn "CLI login flag failed; falling back to COMPOSIO_API_KEY env auth."
else
  log "This CLI build has no --api-key flag; relying on COMPOSIO_API_KEY env auth."
fi

# --- 4. Verify ---------------------------------------------------------------
if composio whoami >/dev/null 2>&1; then
  log "Authenticated successfully:"
  composio whoami || true
else
  warn "Could not verify with 'composio whoami'. The key is exported and the SDK
        will pick it up, but double-check the key is valid if CLI calls fail."
fi

log "Done. COMPOSIO_API_KEY is active for this shell; keep it in .env for future sessions."
