import { describe, expect, it } from "vitest";
import {
  INDEX_DEFINITIONS,
  PRODUCT_UNIVERSES,
  SEALED_METRICS,
  SINGLES_METRICS,
  TREND_INDICATOR_METRICS,
  assertFreshPriceGuide,
  auditPokemonProducts,
  buildBaseProductsFromSnapshot,
  buildFixedMetricRebalanceState,
  buildIndicatorFile,
  buildIndicatorPoint,
  buildMetricBaseProductsFromSnapshot,
  buildRebalanceScale,
  buildScaledPoint,
  buildUniverseFile,
  buildTop100SinglesUniverseFile,
  buildTopSinglesUniverseFile,
  calculateTrendIndicators,
  createFixedUniverseSnapshot,
  createSnapshot,
  ensureBaseState,
  indicatorChange,
  indicatorMetricsForUniverse,
  isBoosterBoxDisplay,
  isBoosterPack,
  joinPokemonProducts,
  joinPokemonSingles,
  normalizePriceHistory,
  parseValuationDate,
  percentChange,
  pointChange,
  shouldRebalanceUniverse,
  summarizeRebalance,
  universeFilePath,
  upsertPoint,
} from "./index-engine.js";

const PRICE_METRICS = ["avg", "low", "trend"];

const productsPayload = {
  createdAt: "2026-06-22T12:09:07+0200",
  products: [
    { idProduct: 1, idCategory: 51, name: "Alpha" },
    { idProduct: 2, idCategory: 51, name: "Beta" },
    { idProduct: 3, idCategory: 52, categoryName: "Pokemon Booster", name: "Base Set Booster" },
    { idProduct: 4, idCategory: 52, categoryName: "Pokemon Booster", name: "Base Set Booster Box" },
    { idProduct: 5, idCategory: 53, categoryName: "Pokemon Display", name: "Base Set Booster Box" },
    { idProduct: 6, idCategory: 53, categoryName: "Pokemon Display", name: "Scarlet & Violet Booster Bundle" },
    { idProduct: 7, idCategory: 53, categoryName: "Pokemon Display", name: "Lost Origin 24 Sleeved Booster Case" },
    { idProduct: 8, idCategory: 53, categoryName: "Pokemon Display", name: "Unrelated Collection" },
    { idProduct: 4, idCategory: 51, name: "Missing price" },
  ],
};

const priceGuidePayload = {
  createdAt: "2026-06-23T02:46:08+0200",
  priceGuides: [
    { idProduct: 1, avg: 13, low: 8, trend: 11 },
    { idProduct: 2, avg: 25, low: 18, trend: 22 },
    { idProduct: 3, avg: 98, low: 90, trend: 95 },
    { idProduct: 4, avg: 198, low: 190, trend: 195 },
    { idProduct: 5, avg: 300, low: 250, trend: 280 },
    { idProduct: 6, avg: 400, low: 350, trend: 380 },
    { idProduct: 7, avg: 500, low: 450, trend: 480 },
    { idProduct: 8, avg: 600, low: 550, trend: 580 },
  ],
};

describe("index engine", () => {
  it("defines every product universe with the supported price metrics only", () => {
    expect(SINGLES_METRICS).toEqual(PRICE_METRICS);
    expect(SEALED_METRICS).toEqual(PRICE_METRICS);
    expect(PRODUCT_UNIVERSES.every((universe) => JSON.stringify(universe.metrics) === JSON.stringify(PRICE_METRICS))).toBe(true);
    expect(INDEX_DEFINITIONS.every((definition) => JSON.stringify(definition.metrics) === JSON.stringify(PRICE_METRICS))).toBe(true);
    expect(INDEX_DEFINITIONS.map((definition) => definition.id)).toEqual([
      "global-singles-equal",
      "global-singles-market",
      "global-booster-boxes-equal",
      "global-booster-boxes-market",
      "global-booster-packs-equal",
      "global-booster-packs-market",
    ]);
    expect(universeFilePath(PRODUCT_UNIVERSES[0])).toBe("/data/pokemon/universes/global-singles-universe.json");
  });

  it("parses and validates price guide dates", () => {
    expect(parseValuationDate(priceGuidePayload.createdAt)).toBe("2026-06-23");
    expect(assertFreshPriceGuide(priceGuidePayload, { now: new Date("2026-06-23T12:00:00Z") })).toBe("2026-06-23");
    expect(() => assertFreshPriceGuide(priceGuidePayload, { now: new Date("2026-06-24T12:00:00Z") })).toThrow(/does not match/);
    expect(assertFreshPriceGuide(priceGuidePayload, { now: new Date("2026-06-24T12:00:00Z"), allowStale: true })).toBe("2026-06-23");
  });

  it("joins and audits configured Pokemon product universes", () => {
    expect(joinPokemonSingles(productsPayload, priceGuidePayload).map((row) => row.product.idProduct)).toEqual([1, 2, 4]);
    expect(joinPokemonProducts(productsPayload, priceGuidePayload, PRODUCT_UNIVERSES[2]).map((row) => row.product.idProduct)).toEqual([3]);
    expect(auditPokemonProducts(productsPayload, PRODUCT_UNIVERSES[1]).includedProducts).toBe(3);
    expect(auditPokemonProducts(productsPayload, PRODUCT_UNIVERSES[1]).rejectedSample[0]).toMatchObject({ idProduct: 8 });
  });

  it("validates booster product names", () => {
    expect(isBoosterPack({ idCategory: 52, categoryName: "Pokemon Booster", name: "Base Set Booster" })).toBe(true);
    expect(isBoosterPack({ idCategory: 52, categoryName: "Pokemon Booster", name: "Base Set Booster Box" })).toBe(false);
    expect(isBoosterBoxDisplay({ idCategory: 53, categoryName: "Pokemon Display", name: "Base Set Booster Box" })).toBe(true);
    expect(isBoosterBoxDisplay({ idCategory: 53, categoryName: "Pokemon Display", name: "Scarlet & Violet Booster Bundle" })).toBe(true);
    expect(isBoosterBoxDisplay({ idCategory: 53, categoryName: "Pokemon Display", name: "Unrelated Collection" })).toBe(false);
  });

  it("creates global snapshots and carries active-universe prices using supported metrics only", () => {
    const rows = joinPokemonSingles(productsPayload, priceGuidePayload);
    const { snapshot, state, quality } = createSnapshot(
      rows,
      { products: { 2: { avg: 24, low: 17, trend: 21 } }, productMeta: { 2: { idProduct: 2, name: "Beta" } } },
      { 1: { avg: 13, low: 8, trend: 11 }, 2: { avg: 24, low: 17, trend: 21 } },
      PRICE_METRICS,
    );

    expect(snapshot["2"]).toEqual({ avg: 25, low: 18, trend: 22 });
    expect(state.products["2"]).toEqual({ avg: 25, low: 18, trend: 22 });
    expect(Object.keys(quality)).toEqual(PRICE_METRICS);
  });

  it("keeps absent active products and carries prior values", () => {
    const rows = [{ product: { idProduct: 1, idCategory: 51, name: "Alpha" }, price: { avg: 14, low: 9, trend: 12 } }];
    const { snapshot, quality } = createSnapshot(
      rows,
      { products: { 2: { avg: 25, low: 18, trend: 22 } }, productMeta: { 2: { idProduct: 2, name: "Beta" } } },
      { 1: { avg: 13, low: 8, trend: 11 }, 2: { avg: 25, low: 18, trend: 22 } },
      PRICE_METRICS,
    );

    expect(snapshot["2"]).toEqual({ avg: 25, low: 18, trend: 22 });
    expect(quality.avg.unavailable).toBe(1);
    expect(quality.avg.carried).toBe(1);
  });

  it("builds bases and universe files from products with avg, low, and trend", () => {
    const baseProducts = buildBaseProductsFromSnapshot(
      {
        1: { avg: 13, low: 8, trend: 11 },
        2: { avg: 25, trend: 22 },
      },
      PRICE_METRICS,
    );
    const universeFile = buildUniverseFile({
      universe: PRODUCT_UNIVERSES[0],
      updatedAt: "2026-06-23",
      baseDate: "2026-06-23",
      rows: joinPokemonSingles(productsPayload, priceGuidePayload),
      baseProducts,
    });

    expect(baseProducts).toEqual({ 1: { avg: 13, low: 8, trend: 11 } });
    expect(universeFile.metrics).toEqual(PRICE_METRICS);
    expect(universeFile.entries).toEqual({ 1: "Alpha" });
  });

  it("builds top singles universes from the full singles price guide", () => {
    const topProductsPayload = {
      createdAt: "2026-06-22T12:09:07+0200",
      products: [
        { idProduct: 1, idCategory: 51, name: "Alpha" },
        { idProduct: 2, idCategory: 51, name: "Beta" },
        { idProduct: 3, idCategory: 51, name: "Gamma" },
        { idProduct: 4, idCategory: 51, name: "Delta" },
        { idProduct: 5, idCategory: 52, name: "Booster Pack" },
      ],
    };
    const customPriceGuide = {
      createdAt: "2026-06-23T02:46:08+0200",
      priceGuides: [
        { idProduct: 1, avg: 10, low: 8, trend: 100 },
        { idProduct: 2, avg: 30, low: 8, trend: 200 },
        { idProduct: 3, avg: 20, low: 8, trend: 200 },
        { idProduct: 4, avg: null, low: 8, trend: 500 },
        { idProduct: 5, avg: 900, low: 8, trend: 900 },
      ],
    };

    const top100 = buildTop100SinglesUniverseFile({ productsPayload: topProductsPayload, priceGuidePayload: customPriceGuide, updatedAt: "2026-06-23" });
    const top2 = buildTopSinglesUniverseFile({ limit: 2, productsPayload: topProductsPayload, priceGuidePayload: customPriceGuide, updatedAt: "2026-06-23" });

    expect(top100.id).toBe("top-100-singles-universe");
    expect(top100.source).toMatchObject({
      universeSource: "pokemon-singles-price-guide",
      rankMetric: "trend",
      productsCreatedAt: topProductsPayload.createdAt,
      pricesCreatedAt: customPriceGuide.createdAt,
    });
    expect(top100.curation.status).toBe("generated-from-price-guide");
    expect(top100.entries).toEqual({ 1: "Alpha", 2: "Beta", 3: "Gamma" });
    expect(top2.id).toBe("top-2-singles-universe");
    expect(top2.name).toBe("Top 2 Singles");
    expect(top2.entries).toEqual({ 2: "Beta", 3: "Gamma" });
  });

  it("preserves top-100 membership when a rebuild is not requested", () => {
    const previousUniverseFile = {
      id: "top-100-singles-universe",
      entries: { 9: "Existing" },
      metrics: ["avg", "low", "trend"],
    };
    const top100 = buildTop100SinglesUniverseFile({
      productsPayload: { products: [{ idProduct: 1, idCategory: 51, name: "Alpha" }] },
      priceGuidePayload: { priceGuides: [{ idProduct: 1, avg: 10, low: 8, trend: 100 }] },
      updatedAt: "2026-06-24",
      previousUniverseFile,
      shouldRebuild: false,
    });

    expect(top100.entries).toEqual({ 9: "Existing" });
    expect(top100.updatedAt).toBe("2026-06-24");
    expect(top100.count).toBe(1);
  });

  it("uses stored product names for universe files when active products are absent today", () => {
    const universeFile = buildUniverseFile({
      universe: PRODUCT_UNIVERSES[0],
      updatedAt: "2026-06-23",
      baseDate: "2026-06-01",
      rows: [],
      baseProducts: { 2: { avg: 25, low: 18, trend: 22 } },
      productMeta: { 2: { idProduct: 2, name: "Beta" } },
    });

    expect(universeFile.entries).toEqual({ 2: "Beta" });
  });

  it("calculates equal, market, and chain-linked rebalance values with supported metrics", () => {
    const snapshot = { 1: { avg: 15, low: 8, trend: 14 }, 2: { avg: 20, low: 18, trend: 60 } };
    const base = { 1: { avg: 10, low: 8, trend: 14 }, 2: { avg: 20, low: 18, trend: 30 } };

    expect(buildScaledPoint("equal", "2026-06-23", snapshot, base, { avg: 100, low: 100, trend: 100 }, PRICE_METRICS)).toEqual([
      "2026-06-23",
      125,
      100,
      150,
    ]);
    expect(buildScaledPoint("market", "2026-06-23", snapshot, base, { avg: 100, low: 100, trend: 100 }, PRICE_METRICS)).toEqual([
      "2026-06-23",
      116.67,
      100,
      168.18,
    ]);

    const scale = buildRebalanceScale({ equal: { avg: 100 }, market: { avg: 100 } }, snapshot, base, PRICE_METRICS);
    expect(scale.equal.avg).toBe(125);
    expect(scale.market.avg).toBe(116.67);
  });

  it("decides and summarizes monthly global rebalances using avg, low, and trend", () => {
    expect(shouldRebalanceUniverse(PRODUCT_UNIVERSES[0], { baseDate: "2026-06-23", baseProducts: { 1: { avg: 10 } } }, "2026-07-01")).toBe(true);
    expect(
      shouldRebalanceUniverse(
        PRODUCT_UNIVERSES[0],
        { baseDate: "2026-06-23", lastRebalancedAt: "2026-07-01", lastRebalanceMonth: "2026-07", baseProducts: { 1: { avg: 10 } } },
        "2026-07-01",
      ),
    ).toBe(false);
    expect(summarizeRebalance({ 1: { avg: 10 }, 2: { avg: 20 } }, { 2: { avg: 22 }, 3: { avg: 30 } }, 4, ["avg"]).avg).toEqual({
      previous: 2,
      next: 2,
      added: 1,
      removed: 1,
      excludedMissingAtRebalance: 2,
    });
  });

  it("builds fixed universe metric bases independently and rebalances by exact id set", () => {
    const { snapshot, quality } = createFixedUniverseSnapshot(
      [
        { product: { idProduct: 1, name: "One" }, price: { avg: 13, low: 8, trend: 9 } },
        { product: { idProduct: 2, name: "Two" }, price: { avg: null, low: 18, trend: 19 } },
      ],
      {},
      {},
      PRICE_METRICS,
    );

    expect(buildMetricBaseProductsFromSnapshot(snapshot, PRICE_METRICS)).toEqual({
      1: { avg: 13, low: 8, trend: 9 },
      2: { low: 18, trend: 19 },
    });
    expect(quality.avg.missing).toBe(1);

    const state = buildFixedMetricRebalanceState({
      snapshot: { 1: { avg: 11 }, 2: {}, 3: { avg: 30 } },
      previousBaseProducts: { 1: { avg: 10 }, 2: { avg: 20 } },
      previousScaleByMethodMetric: { equal: { avg: 100 }, market: { avg: 100 } },
      metrics: ["avg"],
      valuationDate: "2026-06-24",
      productMeta: { 1: { name: "One" }, 2: { name: "Two" }, 3: { name: "Three" } },
    });

    expect(state.metricRebalances.avg.previous).toBe(2);
    expect(state.metricRebalances.avg.next).toBe(2);
    expect(state.metricRebalances.avg.added).toEqual([{ idProduct: 3, name: "Three" }]);
    expect(state.metricRebalances.avg.removed).toEqual([{ idProduct: 2, name: "Two" }]);
    expect(state.baseProducts).toEqual({ 1: { avg: 11 }, 3: { avg: 30 } });
  });

  it("normalizes old six-metric history to avg, low, and trend points", () => {
    const history = normalizePriceHistory(
      {
        baseDate: "2026-06-23",
        metrics: ["avg1", "avg7", "avg30", "avg", "low", "trend"],
        diagnostics: { "2026-06-23": { quality: { avg1: {} } } },
        points: [["2026-06-23", 1, 2, 3, 100, 90, 95]],
      },
      PRICE_METRICS,
    );

    expect(history.baseDate).toBe("2026-06-23");
    expect(history.points).toEqual([["2026-06-23", 100, 90, 95]]);
    expect(history.diagnostics).toEqual({});
  });

  it("upserts points and calculates percent changes", () => {
    const points = upsertPoint(
      [
        ["2026-06-22", 100, 100, 100],
        ["2026-06-23", 101, 101, 101],
      ],
      ["2026-06-23", 102, 104, 106],
    );

    expect(points).toEqual([
      ["2026-06-22", 100, 100, 100],
      ["2026-06-23", 102, 104, 106],
    ]);
    expect(percentChange(points, 1, 1)).toBe(2);
  });

  it("calculates point changes for negative indicator metrics", () => {
    const points = [
      ["2026-06-23", -5.41, 40],
      ["2026-06-24", -5.04, 42],
    ];

    expect(pointChange(points, 1, 1)).toBe(0.37);
    expect(indicatorChange(points, "netTrendBreadth", 1, 1)).toBe(0.37);
    expect(indicatorChange(points, "percentAboveTrend", 2, 1)).toBe(5);
  });

  it("builds indicators only from avg, low, and trend", () => {
    const snapshot = {
      1: { avg: 12, low: 8, trend: 10 },
      2: { avg: 8, low: 4, trend: 10 },
      3: { avg: 10, low: 9, trend: 10 },
    };
    const baseProducts = {
      1: { avg: 10, low: 8, trend: 9 },
      2: { avg: 10, low: 8, trend: 9 },
      3: { avg: 10, low: 8, trend: 9 },
    };

    expect(indicatorMetricsForUniverse(PRODUCT_UNIVERSES[0])).toEqual(TREND_INDICATOR_METRICS);
    expect(buildIndicatorPoint("2026-06-23", snapshot, baseProducts, PRODUCT_UNIVERSES[0])).toEqual([
      "2026-06-23",
      1,
      33.33,
      100,
      70,
      31.11,
      16.33,
      0,
      33.33,
      100,
      33.33,
    ]);

    const file = buildIndicatorFile({
      universe: PRODUCT_UNIVERSES[0],
      updatedAt: "2026-06-23",
      baseDate: "2026-06-23",
      snapshot,
      baseProducts,
      rebalanceEvent: { date: "2026-06-23" },
      rebalances: [{ date: "2026-06-23" }],
    });

    expect(file.metrics).toEqual(TREND_INDICATOR_METRICS);
    expect(file.diagnostics["2026-06-23"].rebalance).toBe(true);
    expect(file.diagnostics["2026-06-23"].advanceDecline).toBeUndefined();
    expect(file.diagnostics["2026-06-23"].trendBreadth).toEqual({ aboveTrend: 1, belowTrend: 1, equalTrend: 1 });
  });

  it("calculates median trend heat for even valid product counts", () => {
    const indicators = calculateTrendIndicators(
      {
        1: { avg: 20, low: 8, trend: 10 },
        2: { avg: 10, low: 8, trend: 10 },
        3: { avg: 5, low: 2, trend: 10 },
        4: { avg: 15, low: 8, trend: 10 },
      },
      {
        1: { avg: 1, low: 1, trend: 1 },
        2: { avg: 1, low: 1, trend: 1 },
        3: { avg: 1, low: 1, trend: 1 },
        4: { avg: 1, low: 1, trend: 1 },
      },
    );

    expect(indicators.medianTrendHeat).toBe(125);
  });

  it("returns null trend indicators when there are no valid products", () => {
    expect(calculateTrendIndicators({}, { 1: { avg: 1, low: 1, trend: 1 } })).toEqual({
      advanceDeclineTrend: null,
      percentAboveTrend: null,
      trendHeat: null,
      floorStrength: null,
      spread: null,
      trendDispersion: null,
      netTrendBreadth: null,
      marketWeightedPercentAboveTrend: null,
      medianTrendHeat: null,
      weakFloorPercent: null,
    });
  });

  it("preserves old indicator history and fills newly added trend metrics with null", () => {
    const file = buildIndicatorFile({
      universe: PRODUCT_UNIVERSES[0],
      updatedAt: "2026-06-24",
      baseDate: "2026-06-23",
      snapshot: { 1: { avg: 12, low: 8, trend: 10 }, 2: { avg: 8, low: 4, trend: 10 } },
      baseProducts: { 1: { avg: 10, low: 8, trend: 9 }, 2: { avg: 10, low: 8, trend: 9 } },
      existing: {
        metrics: ["advanceDecline", "percentAbove30d", "heat", "dispersion", ...TREND_INDICATOR_METRICS.slice(0, 6)],
        diagnostics: { "2026-06-23": { advanceDecline: {} } },
        points: [["2026-06-23", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
      },
    });

    expect(file.metrics).toEqual(TREND_INDICATOR_METRICS);
    expect(file.points[0]).toEqual(["2026-06-23", 5, 6, 7, 8, 9, 10, null, null, null, null]);
    expect(file.diagnostics["2026-06-23"]).toBeUndefined();
  });
});
