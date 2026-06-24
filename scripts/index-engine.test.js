import { describe, expect, it } from "vitest";
import {
  INDEX_DEFINITIONS,
  PRODUCT_UNIVERSES,
  SEALED_METRICS,
  SINGLES_METRICS,
  TREND_INDICATOR_METRICS,
  WINDOW_INDICATOR_METRICS,
  assertFreshPriceGuide,
  auditPokemonProducts,
  buildIndicatorFile,
  buildIndicatorPoint,
  buildBaseProductsFromSnapshot,
  buildFixedMetricRebalanceState,
  buildMetricBaseProductsFromSnapshot,
  buildUniverseFile,
  buildPoint,
  buildRebalanceScale,
  buildScaledPoint,
  createFixedUniverseSnapshot,
  createSnapshot,
  ensureBaseState,
  isBoosterBoxDisplay,
  isBoosterPack,
  indicatorMetricsForUniverse,
  joinPokemonProducts,
  joinPokemonSingles,
  shouldRebalanceUniverse,
  summarizeRebalance,
  parseValuationDate,
  percentChange,
  universeFilePath,
  upsertPoint,
} from "./index-engine.js";

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
    { idProduct: 1, avg1: 10, avg7: 12, avg30: 14, avg: 13, low: 8, trend: 11 },
    { idProduct: 2, avg1: 20, avg7: null, avg30: 30, avg: 25, low: 18, trend: 22 },
    { idProduct: 3, avg1: 100, avg7: 100, avg30: 100, avg: 98, low: 90, trend: 95 },
    { idProduct: 4, avg1: 200, avg7: 200, avg30: 200, avg: 198, low: 190, trend: 195 },
    { idProduct: 5, avg: 300, low: 250, trend: 280 },
    { idProduct: 6, avg: 400, low: 350, trend: 380 },
    { idProduct: 7, avg: 500, low: 450, trend: 480 },
    { idProduct: 8, avg: 600, low: 550, trend: 580 },
  ],
};

const WINDOW_METRICS = ["avg1", "avg7", "avg30"];

describe("index engine", () => {
  it("defines global singles, booster box, and booster pack indexes", () => {
    expect(INDEX_DEFINITIONS.map((definition) => definition.id)).toEqual([
      "global-singles-equal",
      "global-singles-market",
      "global-booster-boxes-equal",
      "global-booster-boxes-market",
      "global-booster-packs-equal",
      "global-booster-packs-market",
    ]);
    expect(INDEX_DEFINITIONS[0].name).toBe("Global Singles Equal Weight");
    expect(INDEX_DEFINITIONS[1].name).toBe("Global Singles Market Weight");
    expect(INDEX_DEFINITIONS[2].name).toBe("Global Booster Boxes Equal Weight");
    expect(INDEX_DEFINITIONS[4].name).toBe("Global Booster Packs Equal Weight");
    expect(INDEX_DEFINITIONS[0].metrics).toEqual(SINGLES_METRICS);
    expect(INDEX_DEFINITIONS[2].metrics).toEqual(SEALED_METRICS);
    expect(INDEX_DEFINITIONS[0].file).toBe("/data/pokemon/indexes/global-singles-equal.json");
    expect(universeFilePath(PRODUCT_UNIVERSES[0])).toBe("/data/pokemon/universes/global-singles-universe.json");
  });

  it("parses the valuation date from the price guide timestamp", () => {
    expect(parseValuationDate(priceGuidePayload.createdAt)).toBe("2026-06-23");
  });

  it("validates price guide freshness against the effective current date", () => {
    expect(assertFreshPriceGuide(priceGuidePayload, { now: new Date("2026-06-23T12:00:00Z") })).toBe("2026-06-23");
    expect(() => assertFreshPriceGuide(priceGuidePayload, { now: new Date("2026-06-24T12:00:00Z") })).toThrow(/does not match/);
    expect(assertFreshPriceGuide(priceGuidePayload, { now: new Date("2026-06-24T12:00:00Z"), allowStale: true })).toBe("2026-06-23");
  });

  it("joins only Pokemon singles that have price guide rows", () => {
    const rows = joinPokemonSingles(productsPayload, priceGuidePayload);
    expect(rows.map((row) => row.product.idProduct)).toEqual([1, 2, 4]);
  });

  it("joins Pokemon products by configured universe validator", () => {
    const rows = joinPokemonProducts(productsPayload, priceGuidePayload, PRODUCT_UNIVERSES[2]);
    expect(rows.map((row) => row.product.idProduct)).toEqual([3]);
  });

  it("validates booster pack names", () => {
    expect(isBoosterPack({ idCategory: 52, categoryName: "Pokemon Booster", name: "Base Set Booster" })).toBe(true);
    expect(isBoosterPack({ idCategory: 52, categoryName: "Pokemon Booster", name: "Base Set Booster Box" })).toBe(false);
    expect(isBoosterPack({ idCategory: 52, categoryName: "Pokemon Booster", name: "Scarlet & Violet Booster Bundle" })).toBe(false);
    expect(isBoosterPack({ idCategory: 52, categoryName: "Pokemon Booster", name: "Lost Origin 24 Sleeved Booster Case" })).toBe(false);
  });

  it("validates booster box display names", () => {
    expect(isBoosterBoxDisplay({ idCategory: 53, categoryName: "Pokemon Display", name: "Base Set Booster Box" })).toBe(true);
    expect(isBoosterBoxDisplay({ idCategory: 53, categoryName: "Pokemon Display", name: "Scarlet & Violet Booster Bundle" })).toBe(true);
    expect(isBoosterBoxDisplay({ idCategory: 53, categoryName: "Pokemon Display", name: "Lost Origin 24 Sleeved Booster Case" })).toBe(true);
    expect(isBoosterBoxDisplay({ idCategory: 53, categoryName: "Pokemon Display", name: "Unrelated Collection" })).toBe(false);
  });

  it("audits included and rejected products for a universe", () => {
    const audit = auditPokemonProducts(productsPayload, PRODUCT_UNIVERSES[1]);

    expect(audit.includedProducts).toBe(3);
    expect(audit.rejectedProducts).toBe(1);
    expect(audit.rejectedSample[0]).toMatchObject({ idProduct: 8, name: "Unrelated Collection" });
  });

  it("creates snapshots and carries previous product metric values inside the frozen base", () => {
    const rows = joinPokemonSingles(productsPayload, priceGuidePayload);
    const { snapshot, quality } = createSnapshot(
      rows,
      { products: { 2: { avg7: 18 } } },
      { 1: { avg1: 10, avg7: 12, avg30: 14 }, 2: { avg1: 20, avg7: 18, avg30: 30 } },
      WINDOW_METRICS,
    );

    expect(snapshot["2"].avg7).toBe(18);
    expect(quality.avg7.carried).toBe(1);
    expect(quality.avg7.activeProducts).toBe(2);
  });

  it("keeps active base products when they are absent from today's catalog", () => {
    const rows = [{ product: { idProduct: 1, idCategory: 51, name: "Alpha" }, price: { avg1: 11, avg7: 12, avg30: 13 } }];
    const { snapshot, state, quality } = createSnapshot(
      rows,
      {
        products: { 2: { avg1: 20, avg7: 21, avg30: 22 } },
        productMeta: { 2: { idProduct: 2, name: "Beta" } },
      },
      {
        1: { avg1: 10, avg7: 12, avg30: 14 },
        2: { avg1: 20, avg7: 21, avg30: 22 },
      },
      WINDOW_METRICS,
    );

    expect(snapshot["2"]).toEqual({ avg1: 20, avg7: 21, avg30: 22 });
    expect(state.products["2"]).toEqual({ avg1: 20, avg7: 21, avg30: 22 });
    expect(state.productMeta["2"].name).toBe("Beta");
    expect(quality.avg1.unavailable).toBe(1);
    expect(quality.avg1.carried).toBe(1);
  });

  it("does not let newly matched products enter normal daily snapshots", () => {
    const rows = [
      { product: { idProduct: 1, idCategory: 51, name: "Alpha" }, price: { avg1: 11, avg7: 12, avg30: 13 } },
      { product: { idProduct: 2, idCategory: 51, name: "New" }, price: { avg1: 20, avg7: 20, avg30: 20 } },
    ];
    const { snapshot, quality } = createSnapshot(rows, {}, { 1: { avg1: 10, avg7: 12, avg30: 14 } }, WINDOW_METRICS);

    expect(Object.keys(snapshot)).toEqual(["1"]);
    expect(quality.avg1.matchedProducts).toBe(1);
  });

  it("uses real avg, low, and trend fields for sealed products without metric copying", () => {
    const rows = [
      {
        product: { idProduct: 10, idCategory: 53 },
        price: { avg1: null, avg7: null, avg30: null, avg: 130, low: 100, trend: 120 },
      },
    ];
    const { snapshot, quality } = createSnapshot(rows, {}, null, SEALED_METRICS);

    expect(snapshot["10"]).toEqual({ avg: 130, low: 100, trend: 120 });
    expect(quality.avg.pricedProducts).toBe(1);
    expect(snapshot["10"].avg1).toBeUndefined();
  });

  it("excludes products missing any configured universe metric", () => {
    expect(
      buildBaseProductsFromSnapshot(
        {
          1: { avg1: 10, avg7: 11, avg30: 12, avg: 13, low: 9, trend: 10 },
          2: { avg1: 10, avg7: 11, avg30: 12, avg: 13, trend: 10 },
        },
        SINGLES_METRICS,
      ),
    ).toEqual({
      1: { avg1: 10, avg7: 11, avg30: 12, avg: 13, low: 9, trend: 10 },
    });

    expect(
      buildBaseProductsFromSnapshot(
        {
          5: { avg: 300, low: 250, trend: 280 },
          6: { avg: 400, trend: 380 },
        },
        SEALED_METRICS,
      ),
    ).toEqual({
      5: { avg: 300, low: 250, trend: 280 },
    });
  });

  it("freezes a complete existing base universe instead of adding newly priced products", () => {
    const base = ensureBaseState(
      { baseProducts: { 1: { avg1: 10, avg7: 11, avg30: 12 } } },
      { 1: { avg1: 11, avg7: 12, avg30: 13 }, 2: { avg1: 20, avg7: 21, avg30: 22 } },
      WINDOW_METRICS,
    );

    expect(base).toEqual({
      1: { avg1: 10, avg7: 11, avg30: 12 },
    });
  });

  it("reinitializes a base universe that has no complete metric products", () => {
    const base = ensureBaseState({ baseProducts: { 1: { avg1: 11 } } }, { 1: { avg1: 11, avg7: 12 }, 2: { avg1: 20, avg7: 21, avg30: 22 } }, WINDOW_METRICS);

    expect(base).toEqual({
      2: { avg1: 20, avg7: 21, avg30: 22 },
    });
  });

  it("builds one universe file from products with all metrics", () => {
    const rows = joinPokemonSingles(productsPayload, priceGuidePayload);
    const baseProducts = {
      1: { avg1: 10, avg7: 12, avg30: 14, avg: 13, low: 8, trend: 11 },
      2: { avg1: 20, avg30: 30, avg: 25, low: 18, trend: 22 },
    };

    const universeFile = buildUniverseFile({
      universe: PRODUCT_UNIVERSES[0],
      updatedAt: "2026-06-23",
      baseDate: "2026-06-23",
      rows,
      baseProducts,
    });

    expect(universeFile.id).toBe("global-singles-universe");
    expect(universeFile.metrics).toEqual(SINGLES_METRICS);
    expect(Array.isArray(universeFile.entries)).toBe(false);
    expect(universeFile.entries).toEqual({ 1: "Alpha" });
    expect(universeFile.count).toBe(Object.keys(universeFile.entries).length);
  });

  it("uses stored product names for universe files when active products are absent today", () => {
    const universeFile = buildUniverseFile({
      universe: PRODUCT_UNIVERSES[0],
      updatedAt: "2026-06-23",
      baseDate: "2026-06-01",
      rows: [],
      baseProducts: { 2: { avg1: 20, avg7: 21, avg30: 22, avg: 25, low: 18, trend: 22 } },
      productMeta: { 2: { idProduct: 2, name: "Beta" } },
    });

    expect(universeFile.entries).toEqual({ 2: "Beta" });
  });

  it("calculates equal-weight and market-weight points", () => {
    const snapshot = {
      1: { avg1: 15, avg7: 12, avg30: 14 },
      2: { avg1: 20, avg7: 18, avg30: 60 },
    };
    const base = {
      1: { avg1: 10, avg7: 12, avg30: 14 },
      2: { avg1: 20, avg7: 18, avg30: 30 },
    };

    expect(buildPoint("equal", "2026-06-23", snapshot, base, WINDOW_METRICS)).toEqual(["2026-06-23", 125, 100, 150]);
    expect(buildPoint("market", "2026-06-23", snapshot, base, WINDOW_METRICS)).toEqual(["2026-06-23", 116.67, 100, 168.18]);
  });

  it("decides monthly rebalance only once per month", () => {
    expect(
      shouldRebalanceUniverse(PRODUCT_UNIVERSES[0], { baseDate: "2026-06-23", baseProducts: { 1: { avg1: 10 } } }, "2026-07-01"),
    ).toBe(true);
    expect(
      shouldRebalanceUniverse(
        PRODUCT_UNIVERSES[0],
        { baseDate: "2026-06-23", lastRebalancedAt: "2026-07-01", lastRebalanceMonth: "2026-07", baseProducts: { 1: { avg1: 10 } } },
        "2026-07-01",
      ),
    ).toBe(false);
    expect(
      shouldRebalanceUniverse({ ...PRODUCT_UNIVERSES[0], rebalancePolicy: "frozen" }, { baseDate: "2026-06-23", baseProducts: { 1: { avg1: 10 } } }, "2026-07-01"),
    ).toBe(false);
  });

  it("builds rebalance bases only from products with all metric prices", () => {
    expect(
      buildBaseProductsFromSnapshot({
        1: { avg1: 10, avg7: null, avg30: 30 },
        2: {},
        3: { avg1: 0, avg7: 12 },
        4: { avg1: 30, avg7: 31, avg30: 32 },
      }, WINDOW_METRICS),
    ).toEqual({
      4: { avg1: 30, avg7: 31, avg30: 32 },
    });
  });

  it("chain-links rebalance scale so the published value stays continuous", () => {
    const oldBase = { 1: { avg1: 100, avg7: 100, avg30: 100 }, 2: { avg1: 100, avg7: 100, avg30: 100 } };
    const oldSnapshot = { 1: { avg1: 110, avg7: 100, avg30: 100 }, 2: { avg1: 130, avg7: 100, avg30: 100 } };
    const newBase = {
      1: { avg1: 110, avg7: 100, avg30: 100 },
      2: { avg1: 130, avg7: 100, avg30: 100 },
      3: { avg1: 60, avg7: 100, avg30: 100 },
    };
    const newSnapshot = {
      1: { avg1: 110, avg7: 100, avg30: 100 },
      2: { avg1: 130, avg7: 100, avg30: 100 },
      3: { avg1: 60, avg7: 100, avg30: 100 },
    };
    const scale = buildRebalanceScale({ equal: { avg1: 100 }, market: { avg1: 100 } }, oldSnapshot, oldBase, WINDOW_METRICS);

    expect(scale.equal.avg1).toBe(120);
    expect(scale.market.avg1).toBe(120);
    expect(buildScaledPoint("equal", "2026-07-01", newSnapshot, newBase, scale.equal, WINDOW_METRICS)[1]).toBe(120);
    expect(buildScaledPoint("market", "2026-07-01", newSnapshot, newBase, scale.market, WINDOW_METRICS)[1]).toBe(120);
  });

  it("summarizes added, removed, and missing products at rebalance", () => {
    expect(
      summarizeRebalance(
        { 1: { avg1: 10, avg7: 10, avg30: 10 }, 2: { avg1: 20, avg7: 20, avg30: 20 } },
        { 2: { avg1: 22, avg7: 22, avg30: 22 }, 3: { avg1: 30, avg7: 30, avg30: 30 } },
        4,
        WINDOW_METRICS,
      ).avg1,
    ).toEqual({
      previous: 2,
      next: 2,
      added: 1,
      removed: 1,
      excludedMissingAtRebalance: 2,
    });
  });

  it("builds fixed universe metric bases independently per metric", () => {
    const { snapshot, quality } = createFixedUniverseSnapshot(
      [
        { product: { idProduct: 1, name: "One" }, price: { avg1: 10, avg7: 11, avg30: 12, avg: 13, low: 8, trend: 9 } },
        { product: { idProduct: 2, name: "Two" }, price: { avg1: 20, avg7: 21, avg30: 22, avg: null, low: 18, trend: 19 } },
      ],
      {},
      {},
      SINGLES_METRICS,
    );

    expect(buildMetricBaseProductsFromSnapshot(snapshot, SINGLES_METRICS)).toEqual({
      1: { avg1: 10, avg7: 11, avg30: 12, avg: 13, low: 8, trend: 9 },
      2: { avg1: 20, avg7: 21, avg30: 22, low: 18, trend: 19 },
    });
    expect(quality.avg.pricedProducts).toBe(1);
    expect(quality.avg.missing).toBe(1);
    expect(quality.avg1.pricedProducts).toBe(2);
  });

  it("rebalances fixed set metrics when the active product id set changes, even if the count is unchanged", () => {
    const previousBaseProducts = {
      1: { avg: 10 },
      2: { avg: 20 },
    };
    const snapshot = {
      1: { avg: 11 },
      2: {},
      3: { avg: 30 },
    };

    const state = buildFixedMetricRebalanceState({
      snapshot,
      previousBaseProducts,
      previousScaleByMethodMetric: { equal: { avg: 100 }, market: { avg: 100 } },
      metrics: ["avg"],
      valuationDate: "2026-06-24",
      productMeta: {
        1: { name: "One" },
        2: { name: "Two" },
        3: { name: "Three" },
      },
    });

    expect(state.metricRebalances.avg.previous).toBe(2);
    expect(state.metricRebalances.avg.next).toBe(2);
    expect(state.metricRebalances.avg.added).toEqual([{ idProduct: 3, name: "Three" }]);
    expect(state.metricRebalances.avg.removed).toEqual([{ idProduct: 2, name: "Two" }]);
    expect(state.baseProducts).toEqual({ 1: { avg: 11 }, 3: { avg: 30 } });
    expect(buildScaledPoint("equal", "2026-06-24", snapshot, state.baseProducts, state.scaleByMethodMetric.equal, ["avg"])[1]).toBe(110);
  });

  it("does not rebalance fixed set metrics when only prices change", () => {
    const previousBaseProducts = {
      1: { avg: 10 },
      2: { avg: 20 },
    };
    const snapshot = {
      1: { avg: 11 },
      2: { avg: 22 },
    };

    const state = buildFixedMetricRebalanceState({
      snapshot,
      previousBaseProducts,
      previousScaleByMethodMetric: { equal: { avg: 100 }, market: { avg: 100 } },
      metrics: ["avg"],
      valuationDate: "2026-06-24",
    });

    expect(state.metricRebalances).toEqual({});
    expect(state.baseProducts).toEqual(previousBaseProducts);
    expect(buildScaledPoint("equal", "2026-06-24", snapshot, state.baseProducts, state.scaleByMethodMetric.equal, ["avg"])[1]).toBe(110);
  });

  it("upserts same-day points and calculates percent changes", () => {
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

  it("allows zero as the latest value when calculating indicator changes", () => {
    const points = [
      ["2026-06-22", 10],
      ["2026-06-23", 0],
    ];

    expect(percentChange(points, 1, 1)).toBe(-100);
  });

  it("builds global singles indicator points from window and trend metrics", () => {
    const snapshot = {
      1: { avg1: 12, avg7: 10, avg30: 8, avg: 12, low: 8, trend: 10 },
      2: { avg1: 9, avg7: 10, avg30: 12, avg: 8, low: 4, trend: 10 },
      3: { avg1: 10, avg7: 10, avg30: 10, avg: 10, low: 9, trend: 10 },
    };
    const baseProducts = {
      1: { avg1: 10, avg7: 10, avg30: 10, avg: 10, low: 8, trend: 9 },
      2: { avg1: 10, avg7: 10, avg30: 10, avg: 10, low: 8, trend: 9 },
      3: { avg1: 10, avg7: 10, avg30: 10, avg: 10, low: 8, trend: 9 },
    };

    expect(indicatorMetricsForUniverse(PRODUCT_UNIVERSES[0])).toEqual([...WINDOW_INDICATOR_METRICS, ...TREND_INDICATOR_METRICS]);
    expect(buildIndicatorPoint("2026-06-23", snapshot, baseProducts, PRODUCT_UNIVERSES[0])).toEqual([
      "2026-06-23",
      1,
      33.33,
      103,
      31.18,
      1,
      33.33,
      100,
      70,
      31.11,
      16.33,
    ]);
  });

  it("builds sealed universe indicator points from avg, low, and trend only", () => {
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

    expect(indicatorMetricsForUniverse(PRODUCT_UNIVERSES[1])).toEqual(TREND_INDICATOR_METRICS);
    expect(buildIndicatorPoint("2026-06-23", snapshot, baseProducts, PRODUCT_UNIVERSES[1])).toEqual(["2026-06-23", 1, 33.33, 100, 70, 31.11, 16.33]);
  });

  it("builds a per-universe indicator file with compact points and diagnostics", () => {
    const snapshot = {
      1: { avg1: 12, avg7: 10, avg30: 8, avg: 12, low: 8, trend: 10 },
      2: { avg1: 9, avg7: 10, avg30: 12, avg: 8, low: 4, trend: 10 },
    };
    const baseProducts = {
      1: { avg1: 10, avg7: 10, avg30: 10, avg: 10, low: 8, trend: 9 },
      2: { avg1: 10, avg7: 10, avg30: 10, avg: 10, low: 8, trend: 9 },
    };
    const file = buildIndicatorFile({
      universe: PRODUCT_UNIVERSES[0],
      updatedAt: "2026-06-23",
      baseDate: "2026-06-23",
      snapshot,
      baseProducts,
      rebalanceEvent: { date: "2026-06-23" },
      rebalances: [{ date: "2026-06-23" }],
    });

    expect(file.metrics).toEqual([...WINDOW_INDICATOR_METRICS, ...TREND_INDICATOR_METRICS]);
    expect(file.points[0][0]).toBe("2026-06-23");
    expect(file.diagnostics["2026-06-23"].rebalance).toBe(true);
    expect(file.diagnostics["2026-06-23"].advanceDecline).toEqual({ advancers: 1, decliners: 1, unchanged: 0 });
    expect(file.diagnostics["2026-06-23"].trendBreadth).toEqual({ aboveTrend: 1, belowTrend: 1, equalTrend: 0 });
  });

  it("preserves old global singles indicator history when adding trend metrics", () => {
    const snapshot = {
      1: { avg1: 12, avg7: 10, avg30: 8, avg: 12, low: 8, trend: 10 },
      2: { avg1: 9, avg7: 10, avg30: 12, avg: 8, low: 4, trend: 10 },
    };
    const baseProducts = {
      1: { avg1: 10, avg7: 10, avg30: 10, avg: 10, low: 8, trend: 9 },
      2: { avg1: 10, avg7: 10, avg30: 10, avg: 10, low: 8, trend: 9 },
    };

    const file = buildIndicatorFile({
      universe: PRODUCT_UNIVERSES[0],
      updatedAt: "2026-06-24",
      baseDate: "2026-06-23",
      snapshot,
      baseProducts,
      existing: {
        metrics: WINDOW_INDICATOR_METRICS,
        diagnostics: { "2026-06-23": { rebalance: false } },
        points: [["2026-06-23", 1, 33.33, 103, 31.18]],
      },
    });

    expect(file.points[0]).toEqual(["2026-06-23", 1, 33.33, 103, 31.18, null, null, null, null, null, null]);
    expect(file.points[1][0]).toBe("2026-06-24");
    expect(file.diagnostics["2026-06-23"]).toEqual({ rebalance: false });
  });
});
