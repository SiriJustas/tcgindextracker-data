# TCG Index Tracker Data

This repository publishes compact, static JSON data for **TCG Index Tracker**.

The goal is to make trading card market indexes easy to consume from a static frontend without running a backend, database, or API server. GitHub Actions downloads public Cardmarket catalog and price-guide files, calculates index values, writes compact JSON into `public/data`, and publishes those files through GitHub Pages.

This repository contains the data pipeline and generated data only. The React application can live in a separate repository and fetch these JSON files from GitHub Pages.

## Current Coverage

The current pipeline generates Pokemon indexes:

- `global-singles-equal`
- `global-singles-market`
- `booster-boxes-equal`
- `booster-boxes-market`
- `booster-packs-equal`
- `booster-packs-market`

Pokemon data is stored under:

```text
/data/pokemon/
```

Future TCGs can use the same structure:

```text
/data/mtg/
/data/yugioh/
```

## How Indexes Are Calculated

Each index tracks three price metrics:

- `avg1` - short-term Cardmarket average price
- `avg7` - 7-day Cardmarket average price
- `avg30` - 30-day Cardmarket average price

Products enter a universe only when **all three metrics are valid positive numbers**. If any of `avg1`, `avg7`, or `avg30` is missing, zero, negative, or non-numeric, the product is excluded from that universe.

### Equal Weight

Equal weight answers:

> How is the typical product in this universe moving?

Each product has the same influence. In portfolio language, this is like investing the same money amount into every product in the universe.

For each product:

```text
relative = currentPrice / basePrice
```

Then:

```text
equalWeightIndex = average(relative values) * 100
```

### Market Weight

Market weight answers:

> How is the total value of the whole tracked basket moving?

More expensive products have more influence. In portfolio language, this is like owning one unit of every product in the universe, so high-value products dominate the basket more.

For each metric:

```text
marketWeightIndex = sum(currentPrices) / sum(basePrices) * 100
```

## Rebalancing

Global indexes use monthly chain-linked rebalancing.

Daily runs do **not** add or remove products from an active universe. They only update prices for products already in the universe.

On the first successful fresh run of a new month:

1. The old universe is valued first.
2. A new universe is built from all eligible products with valid `avg1`, `avg7`, and `avg30` values.
3. The new universe becomes active.
4. A scale factor is stored so the index continues from the old value instead of resetting to `100`.

This keeps the chart continuous while still allowing new active products to enter over time.

If a product is already in the active universe but has no valid price today, the pipeline carries forward its last valid value. If an active product is missing from the current catalog file, it is marked as unavailable and also uses carry-forward when possible.

Each index diagnostic date includes:

```json
"rebalance": true
```

when a rebalance happened. Details are stored in `rebalanceDetails`.

## Data Layout

Generated files are published under `public/data`, which becomes `/data` on GitHub Pages.

```text
public/data/pokemon/manifest.json
public/data/pokemon/summary.json
public/data/pokemon/indexes/{indexId}.json
public/data/pokemon/indexes/{universeId}-universe.json
```

Raw Cardmarket downloads are temporary and must not be committed.

### manifest.json

Lists available indexes and universe files.

Important fields:

- `updatedAt` - valuation date from the Cardmarket price guide
- `version` - numeric version derived from `updatedAt`
- `metrics` - available metric series
- `indexes` - generated index history files
- `universes` - active universe files for each product universe

### summary.json

Small file intended for initial app load.

Important fields:

- `updatedAt` - latest valuation date
- `metrics` - available metric series
- `indexes` - latest values and changes for each index
- `latest` - latest index values by metric
- `change1d`, `change7d`, `change30d` - percentage changes by metric
- `quality` - daily active-universe pricing diagnostics

### Index Files

Each index file contains historical points and diagnostics.

Example path:

```text
/data/pokemon/indexes/booster-boxes-equal.json
```

Important fields:

- `id` - index id
- `name` - display name
- `currency` - index currency
- `baseDate` - original index start date
- `baseValue` - initial index value, normally `100`
- `updatedAt` - latest valuation date
- `metrics` - metric order for each point
- `composition` - current index universe and methodology metadata
- `diagnostics` - date-keyed source, quality, and rebalance information
- `points` - historical index values

Point shape:

```json
["2026-06-23",100,100,100]
```

The order is:

```text
[date, avg1Index, avg7Index, avg30Index]
```

### Universe Files

Universe files define which products are included in a product universe.

Example path:

```text
/data/pokemon/indexes/global-singles-universe.json
```

Important fields:

- `id` - universe file id
- `tcg` - TCG namespace
- `universe` - universe id
- `metrics` - metrics required for inclusion
- `updatedAt` - latest generated date
- `baseDate` - active universe base/rebalance date
- `count` - number of products in the universe
- `entries` - compact product map

Entry shape:

```json
{
  "12345": "Product Name"
}
```

## Data Updates

GitHub Actions updates the data.

Scheduled workflow behavior:

1. Check whether today's Pokemon summary is already published.
2. If already updated, skip the run.
3. Download Cardmarket source files.
4. Check whether the price guide date is fresh.
5. If stale, skip cleanly.
6. Generate compact JSON.
7. Validate generated JSON.
8. Commit generated `public/data`, `.index-state/state.json`, and optional audit outputs.
9. Deploy `public` to GitHub Pages.

The workflow is scheduled at:

```text
08:00, 12:00, 16:00, 20:00 UTC
```

That corresponds to 11:00, 15:00, 19:00, and 23:00 Lithuania summer time.

## Accessing Data

GitHub Pages project sites use this URL pattern:

```text
https://<owner>.github.io/<repository>/data/pokemon/summary.json
```

Example files:

```text
/data/pokemon/manifest.json
/data/pokemon/summary.json
/data/pokemon/indexes/global-singles-equal.json
/data/pokemon/indexes/global-singles-universe.json
```

A static frontend can fetch `summary.json` first, then lazy-load individual index files and universe files as needed.

## Local Commands

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Download Cardmarket data:

```bash
npm run download:data
```

Generate data from downloaded files:

```bash
npm run generate:data
```

Generated data is ignored locally by `.gitignore` and should normally be committed only by GitHub Actions.

## License And Usage

This repository is source-available for non-commercial use. It is not licensed under Apache, MIT, or another permissive open-source license because commercial use is intentionally restricted.

License split:

- Code, scripts, workflows, tests, and configuration: PolyForm Noncommercial License 1.0.0.
- Generated JSON data, universe files, index history files, and documentation: Creative Commons Attribution-NonCommercial 4.0 International.

Personal, private, educational, research, and other non-commercial use is allowed. Commercial use, resale, paid redistribution, or use inside a paid product, paid API, paid dataset, commercial dashboard, commercial website, or business workflow is prohibited without written permission.

If you share or publish a copy of the data or documentation, keep attribution to TCG Index Tracker, link back to the license, and indicate if you changed the material.

The license only covers rights this project can license. It does not grant rights in Cardmarket source files, third-party trademarks, card names, game names, logos, artwork, images, or other third-party material.

See `LICENSE` for the repository license notice and links to the full license texts.

This project is not affiliated with or endorsed by Cardmarket, Pokemon, Nintendo, Creatures, GAME FREAK, Wizards of the Coast, Konami, or any other rights holder.
