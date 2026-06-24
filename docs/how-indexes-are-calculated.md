# How Indexes Are Calculated

TCG Index Tracker uses the real Cardmarket price fields available for each product type. It does not invent missing metrics, copy one metric into another, or fall back between metrics.

## Price Metrics

Global Singles tracks:

- `avg1` - AVG1, the average sale price over the last day.
- `avg7` - AVG7, the average sale price over the last 7 days.
- `avg30` - AVG30, the average sale price over the last 30 days.
- `avg` - Avg. Sell Price, the average sell price shown in the Cardmarket website chart.
- `low` - Low Price, the lowest price on the market.
- `trend` - Trend Price, the trend price shown on the Cardmarket website.

Booster Boxes and Booster Packs track:

- `avg`
- `low`
- `trend`

`avg` is its own Cardmarket field. It is not assumed to equal `avg1`, `avg7`, or `avg30`.

## Product Inclusion

For dynamic global universes, a product enters only when every configured metric for that universe is a valid positive number. Missing, zero, negative, or non-numeric values exclude the product until a future rebalance.

For curated fixed set universes, each metric has its own active product set. A product missing `avg` can be excluded from the `avg` series while still participating in `avg1`, `avg7`, `avg30`, `low`, and `trend`.

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
