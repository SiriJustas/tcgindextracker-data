# Data Layout

Generated files are published under `public/data`, which becomes `/data` on GitHub Pages.

```text
public/data/pokemon/manifest.json
public/data/pokemon/summary.json
public/data/pokemon/indexes/{indexId}.json
public/data/pokemon/indicators/{universeId}.json
public/data/pokemon/universes/{universeId}.json
```

Raw Cardmarket downloads are temporary and must not be committed.

## manifest.json

`/data/pokemon/manifest.json` is the discovery file for Pokemon data.

Important fields:

- `updatedAt` - valuation date from the Cardmarket price guide
- `version` - numeric version derived from `updatedAt`
- `indexes` - generated index history files
- `indexes[].metrics` - metric series for each price index
- `universes` - universe files
- `universes[].universeFile` - path under `/data/pokemon/universes/`
- `indicators` - generated market indicator history files

## summary.json

`/data/pokemon/summary.json` is small and intended for initial app load.

Important fields:

- `updatedAt` - latest valuation date
- `indexes` - latest values and changes for each index
- `indicators` - latest market indicator values and changes
- `latest` - latest values by metric
- `change1d`, `change7d`, `change30d` - percentage changes by metric
- `quality` - daily active-universe pricing diagnostics

## Index Files

Example:

```text
/data/pokemon/indexes/global-booster-boxes-equal.json
```

Important fields:

- `id`
- `name`
- `currency`
- `baseDate`
- `baseValue`
- `updatedAt`
- `metrics`
- `composition`
- `diagnostics`
- `points`

Point shape follows each file's own `metrics` order.

Singles:

```json
["2026-06-23",100,100,100,100,100,100]
```

```text
[date, avg1Index, avg7Index, avg30Index, avgIndex, lowIndex, trendIndex]
```

Sealed:

```json
["2026-06-23",100,100,100]
```

```text
[date, avgIndex, lowIndex, trendIndex]
```

## Universe Files

Example:

```text
/data/pokemon/universes/global-singles-universe.json
```

Universe files define product membership.

Important fields:

- `id`
- `tcg`
- `universe`
- `metrics`
- `updatedAt`
- `baseDate`
- `count`
- `entries`

Entry shape:

```json
{
  "12345": "Product Name"
}
```

## Curated Set Universes

Set universe files are fixed reviewed membership files, not automatic `idExpansion` exports.

Current curated set universe coverage:

- `base-set-unlimited-singles-universe.json` - 101 products, excluding Machamp
- `base-set-shadowless-singles-universe.json` - 102 products, excluding Machamp
- `jungle-singles-universe.json` - 64 cards
- `fossil-singles-universe.json` - 62 cards
- `base-set-2-singles-universe.json` - 130 cards
- `team-rocket-singles-universe.json` - 83 cards

Cardmarket expansion IDs can group several print variants together. Because the catalog does not expose a reliable variant field for every case, curated set universes are reviewed before publication.
