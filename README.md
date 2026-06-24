# TCG Index Tracker Data

This repository publishes compact, static JSON data for **TCG Index Tracker**.

The goal is to make trading card market indexes easy to consume from a static frontend without running a backend, database, or API server. GitHub Actions downloads public Cardmarket catalog and price-guide files, calculates index values, writes compact JSON into `public/data`, and publishes those files through GitHub Pages.

This repository contains the data pipeline and generated data only. The React application can live in a separate repository and fetch these JSON files from GitHub Pages.

## Current Coverage

The current pipeline generates Pokemon indexes:

- `global-singles-equal`
- `global-singles-market`
- `global-booster-boxes-equal`
- `global-booster-boxes-market`
- `global-booster-packs-equal`
- `global-booster-packs-market`

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

Indexes use the real Cardmarket price fields available for each product type. The project does not invent missing metrics or rename one Cardmarket field into another field.

Global Singles tracks six metrics:

- `avg1` - AVG1, the average sale price over the last day.
- `avg7` - AVG7, the average sale price over the last 7 days.
- `avg30` - AVG30, the average sale price over the last 30 days.
- `avg` - Avg. Sell Price, the average sell price as shown in the Cardmarket website chart.
- `low` - Low Price, the lowest price on the market.
- `trend` - Trend Price, the trend price as shown on the Cardmarket website.

`avg` is treated as its own official Cardmarket field. It is not assumed to equal `avg1`, `avg7`, or `avg30`.

Booster Boxes and Booster Packs track three sealed-product metrics:

- `avg` - Avg. Sell Price, the average sell price as shown in the Cardmarket website chart.
- `low` - Low Price, the lowest price on the market.
- `trend` - Trend Price, the trend price as shown on the Cardmarket website.

Products enter a universe only when every configured metric for that universe is a valid positive number. Missing, zero, negative, or non-numeric prices exclude the product until a future rebalance. This prevents new or poorly priced products from distorting the index the moment they appear.

Each metric is calculated as its own index series. For example, `global-singles-equal` contains six series in one compact file: one for `avg1`, one for `avg7`, one for `avg30`, one for `avg`, one for `low`, and one for `trend`.

### Equal Weight

Equal weight answers:

> How is the typical product in this universe moving?

Each product has the same influence. In portfolio language, this is like investing the same money amount into every product in the universe.

For each product and metric:

```text
relative = currentPrice / basePrice
```

Then:

```text
equalWeightIndex = average(relative values) * 100
```

Why this exists:

- It shows broad product-level movement.
- A cheap product and an expensive product count equally.
- It is useful when you care about the typical card or product, not only the most expensive items.

### Market Weight

Market weight answers:

> How is the total value of the whole tracked basket moving?

More expensive products have more influence. In portfolio language, this is like owning one unit of every product in the universe, so high-value products dominate the basket more.

For each metric:

```text
marketWeightIndex = sum(currentPrices) / sum(basePrices) * 100
```

Why this exists:

- It shows how the total value of the tracked basket is moving.
- Expensive products naturally matter more.
- It is useful when you want the closest approximation of owning one unit of every eligible product.

## Rebalancing

Global indexes use monthly chain-linked rebalancing.

Daily runs do **not** add or remove products from an active universe. They only update prices for products already in the universe.

On the first successful fresh run of a new month:

1. The old universe is valued first.
2. A new universe is built from all eligible products with valid prices for that universe's configured metrics.
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
public/data/pokemon/indicators/{universeId}.json
```

Raw Cardmarket downloads are temporary and must not be committed.

### manifest.json

Lists available indexes and universe files.

Important fields:

- `updatedAt` - valuation date from the Cardmarket price guide
- `version` - numeric version derived from `updatedAt`
- `indexes[].metrics` - metric series for each price index
- `indexes` - generated index history files
- `universes` - active universe files for each product universe
- `indicators` - generated market indicator history files

### summary.json

Small file intended for initial app load.

Important fields:

- `updatedAt` - latest valuation date
- `indexes` - latest values and changes for each index
- `indexes[].metrics` - metric series for each price index
- `indicators` - latest market indicator values and changes
- `latest` - latest index values by metric
- `change1d`, `change7d`, `change30d` - percentage changes by metric
- `quality` - daily active-universe pricing diagnostics

### Index Files

Each index file contains historical points and diagnostics.

Example path:

```text
/data/pokemon/indexes/global-booster-boxes-equal.json
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

Point shape follows the file's own `metrics` order.

Singles example:

```json
["2026-06-23",100,100,100,100,100,100]
```

The order is:

```text
[date, avg1Index, avg7Index, avg30Index, avgIndex, lowIndex, trendIndex]
```

Sealed example:

```json
["2026-06-23",100,100,100]
```

The order is:

```text
[date, avgIndex, lowIndex, trendIndex]
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

### Indicator Files

Market indicators describe the internal condition of a universe. They are not equal-weight or market-weight price indexes, and they are not chain-linked. They are direct readings of the current active universe.

Global Singles has two indicator families:

- Window indicators based on `avg1`, `avg7`, and `avg30`.
- Trend/floor indicators based on `avg`, `low`, and `trend`.

Booster Boxes and Booster Packs have trend/floor indicators only, because sealed products do not publish `avg1`, `avg7`, and `avg30`.

Current indicator files:

```text
/data/pokemon/indicators/global-singles.json
/data/pokemon/indicators/global-booster-boxes.json
/data/pokemon/indicators/global-booster-packs.json
```

Global Singles window metrics:

- `advanceDecline` - products where `avg1 > avg7` divided by products where `avg1 < avg7`.
- `percentAbove30d` - percentage of products where `avg1 > avg30`.
- `heat` - average of `0.4 * (avg1 / avg7) + 0.6 * (avg7 / avg30)`, multiplied by `100`.
- `dispersion` - standard deviation of `(avg1 / avg30) - 1`, multiplied by `100`.

Trend/floor metrics:

- `advanceDeclineTrend` - products where `avg > trend` divided by products where `avg < trend`.
- `percentAboveTrend` - percentage of products where `avg > trend`.
- `trendHeat` - average of `avg / trend`, multiplied by `100`.
- `floorStrength` - average of `low / trend`, multiplied by `100`.
- `spread` - average of `(avg - low) / avg`, multiplied by `100`.
- `trendDispersion` - standard deviation of `(avg / trend) - 1`, multiplied by `100`.

Why these exist:

- `advanceDecline` shows whether more products are rising than falling.
- `percentAbove30d` shows how much of the universe is trading above its 30-day average.
- `heat` combines very short-term and medium-term momentum into one score, where `100` is roughly neutral.
- `dispersion` shows whether movement is broad and uniform or concentrated in a smaller group of products.
- `trendHeat` compares the chart average sell price against Cardmarket trend price.
- `floorStrength` shows how close the market floor is to trend price.
- `spread` shows the average gap between average sell price and market floor.
- `trendDispersion` shows whether the avg-vs-trend relationship is consistent across the universe.

Indicators are stored separately from price indexes because they answer a different question. Price indexes track value movement over time; indicators describe market condition and participation.

Point shape:

```json
["2026-06-23",1.24,58.42,103.16,7.81,1.12,52.9,101.4,63.2,36.8,12.5]
```

Global Singles order:

```text
[date, advanceDecline, percentAbove30d, heat, dispersion, advanceDeclineTrend, percentAboveTrend, trendHeat, floorStrength, spread, trendDispersion]
```

Booster Boxes and Booster Packs order:

```text
[date, advanceDeclineTrend, percentAboveTrend, trendHeat, floorStrength, spread, trendDispersion]
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
08:17, 12:17, 16:17, 20:17 UTC
```

That corresponds to 11:17, 15:17, 19:17, and 23:17 Lithuania summer time.

## Cardmarket Data Dependency

This project relies on Cardmarket-published product catalog and price guide files. If Cardmarket data is stale, incomplete, delayed, changed, or incorrect, generated indexes and indicators may also be stale, incomplete, or misleading.

The project does not independently verify trades, listings, liquidity, product metadata, or raw market activity. It calculates transparent derived values from the public data files that Cardmarket publishes.

## Research Only

This project is for research, education, transparency, and market observation only.

It is not financial advice and is not a recommendation to buy, sell, hold, grade, invest, speculate, trade, or make any money-related decision. Trading cards and sealed products can be illiquid, volatile, condition-sensitive, and hard to value accurately.

## Accessing Data

GitHub Pages project sites use this URL pattern:

```text
https://sirijustas.github.io/tcgindextracker-data/data/pokemon/summary.json
```

Example files:

```text
/data/pokemon/manifest.json
/data/pokemon/summary.json
/data/pokemon/indexes/global-singles-equal.json
/data/pokemon/indexes/global-singles-universe.json
/data/pokemon/indicators/global-singles.json
/data/pokemon/indicators/global-booster-boxes.json
/data/pokemon/indicators/global-booster-packs.json
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

Raw downloads and temporary files are ignored by `.gitignore`. Generated `public/data` files are the published dataset and may be committed by GitHub Actions or intentionally committed after a verified local generation.

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
