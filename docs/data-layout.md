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

Current curated set universe coverage includes these fixed Cardmarket product-ID universes:

- `base-set-unlimited-singles-universe.json` - 102 products
- `base-set-shadowless-singles-universe.json` - 103 products
- `jungle-singles-universe.json` - 66 products
- `fossil-singles-universe.json` - 63 products
- `base-set-2-singles-universe.json` - 130 cards
- `team-rocket-singles-universe.json` - 84 products
- Gym Challenge, Gym Heroes, Neo Genesis, Neo Discovery, Southern Islands, Neo Revelation, Neo Destiny
- Legendary Collection, Expedition, Aquapolis, Skyridge
- EX Ruby & Sapphire through EX Power Keepers
- POP Series 1 through POP Series 8
- Diamond & Pearl, Mysterious Treasures, Secret Wonders, Great Encounters, Majestic Dawn, Legends Awakened, Stormfront

Cardmarket expansion IDs can group several print variants together. Because the catalog does not expose a reliable variant field for every case, curated set universes are reviewed before publication.

For expansion-based universes, `curation.cardmarketProductCount` records the number of actual Cardmarket product rows published in the universe. We do not store external checklist counts in the data files because those counts can represent printed checklists, reverse-holo checklists, promos, or other variants differently from Cardmarket product rows.

Nintendo Black Star Promo is not published yet. The current catalog candidates behave like broad promo buckets rather than a reliable 98-product Nintendo Black Star universe, so it is deferred until the product-ID mapping can be verified.
