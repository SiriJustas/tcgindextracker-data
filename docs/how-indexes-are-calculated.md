# How Indexes Are Calculated

TCG Index Tracker uses the real Cardmarket price fields that provide useful movement in the public files. It does not invent missing metrics, copy one metric into another, or fall back between metrics.

## Price Metrics

All current universes track:

- `avg`
- `low`
- `trend`

`avg` is Avg. Sell Price, the average sell price shown in the Cardmarket website chart. `low` is the lowest price on the market. `trend` is the Cardmarket trend price.

`avg1`, `avg7`, and `avg30` are intentionally not published by this project because the available public feed does not provide useful changing values for them.

## Product Inclusion

For dynamic global universes, a product enters only when every configured metric for that universe is a valid positive number. Missing, zero, negative, or non-numeric values exclude the product until a future rebalance.

For curated fixed set universes, each metric has its own active product set. A product missing `avg` can be excluded from the `avg` series while still participating in `low` and `trend`.

## Equal Weight

Equal weight answers: how is the typical product in this universe moving?

Each product has the same influence. In portfolio language, this is like investing the same money amount into every product in the universe.

```text
relative = currentPrice / basePrice
equalWeightIndex = average(relative values) * 100
```

This is useful when broad product-level movement matters more than the largest or most expensive items.

## Market Weight

Market weight answers: how is the total value of the tracked basket moving?

More expensive products have more influence. In portfolio language, this is like owning one unit of every product in the universe.

```text
marketWeightIndex = sum(currentPrices) / sum(basePrices) * 100
```

This is useful when the goal is to approximate the value movement of owning one unit of every eligible product.
