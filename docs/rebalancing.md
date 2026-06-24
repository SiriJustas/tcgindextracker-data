# Rebalancing

Rebalancing controls when product membership can change. Daily price updates should not randomly reshape the universe.

## Global Universes

Global indexes use monthly chain-linked rebalancing.

Daily runs do not add or remove products from an active global universe. They update prices for products already in the universe.

On the first successful fresh run of a new month:

1. The old universe is valued first.
2. A new universe is built from eligible products with valid prices for that universe's configured metrics.
3. The new universe becomes active.
4. A scale factor is stored so the index continues from the old value instead of resetting to `100`.

If an active product has no valid price today, the pipeline carries forward its last valid value when possible. If an active product is missing from the catalog, it is marked unavailable and carried forward when possible.

Index diagnostics include:

```json
"rebalance": true
```

when a rebalance happens. Details are stored in `rebalanceDetails`.

## Curated Set Universes

Set universe files are fixed reviewed card lists. They do not change during daily generation.

Each metric has its own active product ID set. If a card has no valid positive value for one metric, it is excluded from that metric only.

When a previously missing metric becomes available, or when active product IDs for a metric otherwise change, only that metric is chain-linked. The pipeline compares sorted product ID sets, not only counts, so a count-stable component swap still triggers a metric rebalance.

No metric falls back to another metric, and `*-holo` fields are not used.
