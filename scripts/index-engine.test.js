import { describe, expect, it } from "vitest";
import {
  INDEX_DEFINITIONS,
  PRODUCT_UNIVERSES,
  assertFreshPriceGuide,
  auditPokemonProducts,
  buildBaseProductsFromSnapshot,
  buildUniverseFile,
  buildPoint,
  buildRebalanceScale,
  buildScaledPoint,
  createSnapshot,
  ensureBaseState,
  isBoosterBoxDisplay,
  isBoosterPack,
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
    { idProduct: 1, avg1: 10, avg7: 12, avg30: 14 },
    { idProduct: 2, avg1: 20, avg7: null, avg30: 30 },
    { idProduct: 3, avg1: 100, avg7: 100, avg30: 100 },
    { idProduct: 4, avg1: 200, avg7: 200, avg30: 200 },
    { idProduct: 5, trend: 300 },
    { idProduct: 6, trend: 400 },
    { idProduct: 7, trend: 500 },
    { idProduct: 8, trend: 600 },
  ],
};

describe("index engine", () => {
  it("defines global singles, booster box, and booster pack indexes", () => {
    expect(INDEX_DEFINITIONS.map((definition) => definition.id)).toEqual([
      "global-singles-equal",
      "global-singles-market",
      "booster-boxes-equal",
      "booster-boxes-market",
      "booster-packs-equal",
      "booster-packs-market",
    ]);
    expect(INDEX_DEFINITIONS[0].name).toBe("Global Singles Equal Weight");
    expect(INDEX_DEFINITIONS[1].name).toBe("Global Singles Market Weight");
    expect(INDEX_DEFINITIONS[0].file).toBe("/data/pokemon/indexes/global-singles-equal.json");
    expect(universeFilePath(PRODUCT_UNIVERSES[0])).toBe("/data/pokemon/indexes/global-singles-universe.json");
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
    const { snapshot, quality } = createSnapshot(rows, {}, { 1: { avg1: 10, avg7: 12, avg30: 14 } });

    expect(Object.keys(snapshot)).toEqual(["1"]);
    expect(quality.avg1.matchedProducts).toBe(1);
  });

  it("can use a universe-level fallback price field for sealed products", () => {
    const rows = [
      {
        product: { idProduct: 10, idCategory: 53 },
        price: { avg1: null, avg7: null, avg30: null, trend: 120 },
      },
    ];
    const { snapshot, quality } = createSnapshot(rows, {}, null, "trend");

    expect(snapshot["10"]).toEqual({ avg1: 120, avg7: 120, avg30: 120 });
    expect(quality.avg1.pricedProducts).toBe(1);
  });

  it("freezes a complete existing base universe instead of adding newly priced products", () => {
    const base = ensureBaseState(
      { baseProducts: { 1: { avg1: 10, avg7: 11, avg30: 12 } } },
      { 1: { avg1: 11, avg7: 12, avg30: 13 }, 2: { avg1: 20, avg7: 21, avg30: 22 } },
    );

    expect(base).toEqual({
      1: { avg1: 10, avg7: 11, avg30: 12 },
    });
  });

  it("reinitializes a base universe that has no complete metric products", () => {
    const base = ensureBaseState({ baseProducts: { 1: { avg1: 11 } } }, { 1: { avg1: 11, avg7: 12 }, 2: { avg1: 20, avg7: 21, avg30: 22 } });

    expect(base).toEqual({
      2: { avg1: 20, avg7: 21, avg30: 22 },
    });
  });

  it("builds one universe file from products with all metrics", () => {
    const rows = joinPokemonSingles(productsPayload, priceGuidePayload);
    const baseProducts = {
      1: { avg1: 10, avg7: 12, avg30: 14 },
      2: { avg1: 20, avg30: 30 },
    };

    const universeFile = buildUniverseFile({
      universe: PRODUCT_UNIVERSES[0],
      updatedAt: "2026-06-23",
      baseDate: "2026-06-23",
      rows,
      baseProducts,
    });

    expect(universeFile.id).toBe("global-singles-universe");
    expect(universeFile.metrics).toEqual(["avg1", "avg7", "avg30"]);
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
      baseProducts: { 2: { avg1: 20, avg7: 21, avg30: 22 } },
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

    expect(buildPoint("equal", "2026-06-23", snapshot, base)).toEqual(["2026-06-23", 125, 100, 150]);
    expect(buildPoint("market", "2026-06-23", snapshot, base)).toEqual(["2026-06-23", 116.67, 100, 168.18]);
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
      }),
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
    const scale = buildRebalanceScale({ equal: { avg1: 100 }, market: { avg1: 100 } }, oldSnapshot, oldBase);

    expect(scale.equal.avg1).toBe(120);
    expect(scale.market.avg1).toBe(120);
    expect(buildScaledPoint("equal", "2026-07-01", newSnapshot, newBase, scale.equal)[1]).toBe(120);
    expect(buildScaledPoint("market", "2026-07-01", newSnapshot, newBase, scale.market)[1]).toBe(120);
  });

  it("summarizes added, removed, and missing products at rebalance", () => {
    expect(
      summarizeRebalance(
        { 1: { avg1: 10, avg7: 10, avg30: 10 }, 2: { avg1: 20, avg7: 20, avg30: 20 } },
        { 2: { avg1: 22, avg7: 22, avg30: 22 }, 3: { avg1: 30, avg7: 30, avg30: 30 } },
        4,
      ).avg1,
    ).toEqual({
      previous: 2,
      next: 2,
      added: 1,
      removed: 1,
      excludedMissingAtRebalance: 2,
    });
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
});
