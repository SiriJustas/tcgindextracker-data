# Accessing Data

GitHub Pages project sites use this URL pattern:

```text
https://sirijustas.github.io/tcgindextracker-data/data/pokemon/summary.json
```

## Useful Files

```text
/data/pokemon/manifest.json
/data/pokemon/summary.json
/data/pokemon/indexes/global-singles-equal.json
/data/pokemon/indicators/global-singles.json
/data/pokemon/universes/global-singles-universe.json
/data/pokemon/universes/base-set-shadowless-singles-universe.json
```

## Frontend Fetch Flow

1. Fetch `/data/pokemon/summary.json` on initial load.
2. Use latest values and short-term changes from the summary.
3. Fetch `/data/pokemon/manifest.json` when discovery metadata is needed.
4. Lazy-load index history files from `manifest.indexes[].file`.
5. Lazy-load indicator files from `manifest.indicators[].file`.
6. Load universe files from `manifest.universes[].universeFile` only when membership/audit data is needed.

This keeps initial page load small while still making full history and universe membership available.
