# Indicator Files

Market indicators describe the internal condition of a universe. They are not equal-weight or market-weight price indexes, and they are not chain-linked.

Indicator files live under:

```text
/data/pokemon/indicators/{universeId}.json
```

## Indicator Families

Global Singles has:

- window indicators based on `avg1`, `avg7`, and `avg30`
- trend/floor indicators based on `avg`, `low`, and `trend`

Booster Boxes, Booster Packs, and curated set universes use the indicators supported by their available metrics.

## Window Indicators

- `advanceDecline` - products where `avg1 > avg7` divided by products where `avg1 < avg7`
- `percentAbove30d` - percentage of products where `avg1 > avg30`
- `heat` - average of `0.4 * (avg1 / avg7) + 0.6 * (avg7 / avg30)`, multiplied by `100`
- `dispersion` - standard deviation of `(avg1 / avg30) - 1`, multiplied by `100`

## Trend/Floor Indicators

- `advanceDeclineTrend` - products where `avg > trend` divided by products where `avg < trend`
- `percentAboveTrend` - percentage of products where `avg > trend`
- `trendHeat` - average of `avg / trend`, multiplied by `100`
- `floorStrength` - average of `low / trend`, multiplied by `100`
- `spread` - average of `(avg - low) / avg`, multiplied by `100`
- `trendDispersion` - standard deviation of `(avg / trend) - 1`, multiplied by `100`

## Point Order

Global Singles:

```text
[date, advanceDecline, percentAbove30d, heat, dispersion, advanceDeclineTrend, percentAboveTrend, trendHeat, floorStrength, spread, trendDispersion]
```

Booster Boxes and Booster Packs:

```text
[date, advanceDeclineTrend, percentAboveTrend, trendHeat, floorStrength, spread, trendDispersion]
```

Always read the file's `metrics` array instead of hardcoding point positions.

## Interpretation

Indicators answer different questions than price indexes. Price indexes track value movement over time. Indicators show participation, breadth, price-floor strength, and dispersion inside the active universe.
