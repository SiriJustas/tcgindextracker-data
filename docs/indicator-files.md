# Indicator Files

Market indicators describe the internal condition of a universe. They are not equal-weight or market-weight price indexes, and they are not chain-linked.

Indicator files live under:

```text
/data/pokemon/indicators/{universeId}.json
```

## Indicator Families

All current universes publish 10 trend/floor/breadth indicators based on `avg`, `low`, and `trend`.

## Trend/Floor Indicators

- `advanceDeclineTrend` - products where `avg > trend` divided by products where `avg < trend`
- `percentAboveTrend` - percentage of products where `avg > trend`
- `trendHeat` - average of `avg / trend`, multiplied by `100`
- `floorStrength` - average of `low / trend`, multiplied by `100`
- `spread` - average of `(avg - low) / avg`, multiplied by `100`
- `trendDispersion` - standard deviation of `(avg / trend) - 1`, multiplied by `100`
- `netTrendBreadth` - products above trend minus products below trend, divided by valid products and multiplied by `100`
- `marketWeightedPercentAboveTrend` - percentage of total trend value represented by products where `avg > trend`
- `medianTrendHeat` - median of `avg / trend`, multiplied by `100`
- `weakFloorPercent` - percentage of products where `low / trend < 50%`

Units are published in each file's `units` object. Ratio indicators are unitless ratios, score indicators use `100` as a neutral reference, and percent indicators are percentages.

## Point Order

```text
[date, advanceDeclineTrend, percentAboveTrend, trendHeat, floorStrength, spread, trendDispersion, netTrendBreadth, marketWeightedPercentAboveTrend, medianTrendHeat, weakFloorPercent]
```

Always read the file's `metrics` array instead of hardcoding point positions.

## Interpretation

Indicators answer different questions than price indexes. Price indexes track value movement over time. Indicators show participation, breadth, price-floor strength, and dispersion inside the active universe. They are research diagnostics, not buy/sell signals.
