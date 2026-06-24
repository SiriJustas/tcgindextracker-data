# TCG Index Tracker Data

This repository publishes compact static JSON data for **TCG Index Tracker**.

It is the data pipeline and public dataset for a static frontend. GitHub Actions downloads public Cardmarket product catalog and price-guide files, calculates indexes and indicators, writes compact JSON into `public/data`, and publishes those files through GitHub Pages.

There is no backend, database, runtime API, or serverless function layer.

## Current Coverage

Current data is published under:

```text
/data/pokemon/
```

The Pokemon dataset currently includes:

- global singles indexes
- global booster box indexes
- global booster pack indexes
- curated WOTC-era set singles indexes
- market indicators
- universe files for membership/audit data

Future TCGs can use the same layout:

```text
/data/mtg/
/data/yugioh/
```

## Start Here

Primary public files:

- [`/data/pokemon/manifest.json`](https://sirijustas.github.io/tcgindextracker-data/data/pokemon/manifest.json)
- [`/data/pokemon/summary.json`](https://sirijustas.github.io/tcgindextracker-data/data/pokemon/summary.json)

Typical frontend flow:

1. Load `summary.json` first for latest values.
2. Use `manifest.json` to discover index, indicator, and universe files.
3. Lazy-load history and universe files only when needed.

## Documentation

| Topic | Link |
| --- | --- |
| How indexes are calculated | [docs/how-indexes-are-calculated.md](docs/how-indexes-are-calculated.md) |
| Rebalancing | [docs/rebalancing.md](docs/rebalancing.md) |
| Data layout | [docs/data-layout.md](docs/data-layout.md) |
| Indicator files | [docs/indicator-files.md](docs/indicator-files.md) |
| Data updates | [docs/data-updates.md](docs/data-updates.md) |
| Accessing data | [docs/accessing-data.md](docs/accessing-data.md) |
| Cardmarket data dependency | [docs/cardmarket-data-dependency.md](docs/cardmarket-data-dependency.md) |
| Research-only disclaimer | [docs/research-only.md](docs/research-only.md) |

## Local Commands

```bash
npm install
npm test
npm run download:data
npm run generate:data
```

Raw downloads and temporary files are ignored. Generated `public/data` files are the published dataset and may be committed by GitHub Actions or after a verified local generation.

## License And Usage

This repository is source-available for non-commercial use. Commercial use, resale, paid redistribution, or use inside a paid product, paid API, paid dataset, commercial dashboard, commercial website, or business workflow is prohibited without written permission.

License split:

- Code, scripts, workflows, tests, and configuration: PolyForm Noncommercial License 1.0.0.
- Generated JSON data, universe files, index history files, and documentation: Creative Commons Attribution-NonCommercial 4.0 International.

Personal, private, educational, research, and other non-commercial use is allowed. If you share or publish a copy of the data or documentation, keep attribution to TCG Index Tracker, link back to the license, and indicate if you changed the material.

See [LICENSE](LICENSE) for the repository license notice and links to the full license texts.

## Important Disclaimers

This project is for research, education, transparency, and market observation only. It is not financial advice and is not a recommendation to buy, sell, hold, grade, invest, speculate, trade, or make any money-related decision.

This project relies on Cardmarket-published source files. If Cardmarket data is stale, incomplete, delayed, changed, or incorrect, generated indexes and indicators may also be stale, incomplete, or misleading.

This project is not affiliated with or endorsed by Cardmarket, Pokemon, Nintendo, Creatures, GAME FREAK, Wizards of the Coast, Konami, or any other rights holder.
