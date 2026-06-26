# Cloudbound Competitive Intelligence — System

Stood up 2026-06-24. The system is organized around **signals**, not companies (per the brief's enhancement note — companies are one source of signals).

## Layout

```
07 — Competitors/
├── Competition Tracker.xlsx          # master input (205 rows, "All Targets" sheet)
└── intel/
    ├── data/
    │   ├── competitors_master.csv    # parsed from xlsx
    │   ├── competitors_master.json   # same, structured
    │   └── signals/
    │       └── 2026-W26-signals.json # per-week signal log w/ scoring
    ├── reports/
    │   └── weekly.html               # this week's executive report
    └── dashboard/
        └── index.html                # signal-organized dashboard w/ filters
```

## Signal taxonomy (organize work around these, not companies)

1. **Concept** — new attractions, layouts, pricing, memberships, formats
2. **Demand** — what parents are engaging with and asking for
3. **Capital** — funding, acquisitions, PE activity, franchising
4. **Expansion** — leases, openings, closures, geographic moves
5. **Talent** — who competitors are hiring and why
6. **Marketing** — campaigns, influencers, viral content, partnerships
7. **Industry** — trade events, market sizing, regulatory

## Scoring

Each signal scored 1–10 on:
- **Importance** (strategic weight)
- **Confidence** (source quality)
- **Cloudbound Impact** (relevance to AHRA / concept / operations)
- **Time-sensitivity** (high/medium/low — decay rate of action window)

Composite = (Importance + Impact) × Confidence / 10.

## Run a new weekly cycle

1. Append the prior week's signals to a new `data/signals/YYYY-WNN-signals.json` (copy schema from 2026-W26).
2. Re-fan-out research across the 14-signal template (one row per signal category × top targets).
3. Regenerate `reports/weekly.html` from the JSON.
4. Dashboard auto-loads the latest signals JSON via fetch.

## Tracker corrections queued (apply on next Excel edit)

- **Kids Empire**: locations 68 → 100+ (verified at kidsempire.com/locations)

## New entities to add to master tracker

| Name | Category | Locations | Owner / PE | Priority |
|---|---|---|---|---|
| Launch Family Entertainment | FEC / Trampoline | 30 | Silver Oak Services Partners | Tier 1 |
| Five Star Parks & Attractions | FEC roll-up | 25 (12 states) | Court Square Capital Partners | Tier 1 |
| Scene75 Entertainment | FEC (Five Star sub) | 5 | Court Square | Tier 2 |
| Malibu Jack's Indoor Theme Parks | FEC (Five Star sub) | 3 | Court Square | Tier 2 |
| CAMP | Experiential retail / FEC | ~10 | VC-backed | Tier 1 |
| Tiny's Corner | Play café (mall-anchored) | 1 (fall 2026) | private | Tier 3 — emerging format |
| Think Lounge | Play café + parent coworking | 1 | private | Tier 3 — emerging format |
| Primrose Schools | Preschool (adjacent) | 500+ | Taurus Capital Partners | Tier 2 — adjacency |
| PlayPower / BCI Burke | Equipment supplier (adjacent) | n/a | Platinum Equity | Tier 2 — supply chain |

## Open category gaps (per brief — to add in next 2 weeks)

The current tracker is narrowly scoped to "1. Indoor Kid/Toddler Play Zone." The brief calls for coverage of:

- Membership clubs · Children's museums · Play cafés
- Edutainment · Kids gyms · Preschools · Montessori chains
- Soft play operators · Birthday party operators · Gymnastics chains
- Music schools · STEM education · Maker spaces · Discovery centers
- Museum concepts · Indoor water play
- European concepts · Asian concepts · Australian concepts
- Luxury concepts · Franchise concepts · PE portfolio companies
- Recently funded startups · IAAPA / licensing expo new concepts

Track each as its own industry tag in `competitors_master.csv` so the dashboard can filter on it.
