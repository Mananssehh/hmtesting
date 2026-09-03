# Roadmap

## Backlog
- [ ] Replace hard-coded $100 tip limits ($50 single / $100 per 24h / $100 per event, currently constants inside `check_tip_cap` and `src/lib/purchaseCaps.ts`) with configurable, server-enforced limits (e.g. `app_config` row read by the cap function, admin-editable). Do not change current limit values as part of D3.
