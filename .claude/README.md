# Claude Code Plugins — Financial Services

This repo enables Anthropic's official **Claude for Financial Services** plugins for
everyone working in it with Claude Code. The configuration lives in
[`.claude/settings.json`](./settings.json) (project scope).

Source marketplace: <https://github.com/anthropics/financial-services>
Announcement: <https://www.anthropic.com/news/finance-agents>

## How it works

`settings.json` declares the official marketplace under `extraKnownMarketplaces`
and turns on all of its plugins under `enabledPlugins`. When you open this repo in
Claude Code and trust the folder, Claude Code prompts you to install the
marketplace and its plugins automatically.

## Plugins enabled (20)

### Vertical plugins (skill bundles)
| Plugin | What it does |
|--------|--------------|
| `financial-analysis` | Core modeling: DCF, comps, LBO, 3-statement models, competitive analysis, deck QC |
| `investment-banking` | Client/market insights, deck creation, transaction management |
| `equity-research` | Earnings analysis, initiating-coverage reports, research workflows |
| `private-equity` | Deal sourcing, company discovery, CRM integration, founder outreach |
| `wealth-management` | Client reviews, financial planning, portfolio analysis, reporting |
| `fund-admin` | GL reconciliation, break tracing, accruals, roll-forwards, NAV tie-out |
| `operations` | KYC document parsing and rules-grid evaluation |

### Agent plugins (named workflows)
| Plugin | What it does |
|--------|--------------|
| `pitch-agent` | Comps, precedents, LBO → branded pitch deck |
| `market-researcher` | Sector/theme → industry overview, competitive landscape, peer comps |
| `earnings-reviewer` | Earnings call & filings → model update → note draft |
| `meeting-prep-agent` | Briefing pack before client meetings |
| `model-builder` | Builds DCF, LBO, and 3-statement models in Excel |
| `gl-reconciler` | Identifies discrepancies and traces root causes |
| `kyc-screener` | Evaluates onboarding docs against regulatory requirements |
| `valuation-reviewer` | GP packages and LP reporting processes |
| `month-end-closer` | Accruals and variance analysis |
| `statement-auditor` | Reviews LP statements before distribution |

### Partner & integrations
| Plugin | What it does |
|--------|--------------|
| `lseg` | Bond pricing, yield curves, FX carry, option valuation, macro dashboards |
| `sp-global` | Company tearsheets, earnings previews, transaction summaries |
| `claude-for-msft-365-install` | Enables the Claude Microsoft 365 add-in (Excel/PowerPoint/Word) |

## Manual install (if not auto-prompted)

```bash
claude plugin marketplace add anthropics/financial-services
claude plugin install financial-analysis@claude-for-financial-services
# ...repeat for each plugin, or just trust the repo folder to install all enabled ones
```
