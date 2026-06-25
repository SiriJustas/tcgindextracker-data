import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertCustomUniverses,
  assertIndicatorSummaryChanges,
  assertSetUniverse,
  assertSummaryMetricObjects,
  validateGeneratedData,
} from "./validate-generated-data.js";
import { SINGLES_METRICS, TREND_INDICATOR_METRICS } from "./index-engine.js";

describe("generated data validation", () => {
  it("accepts the current generated dataset", () => {
    expect(() => validateGeneratedData(process.cwd(), { logSizes: false })).not.toThrow();
  }, 30000);

  it("requires summary metric objects to match the item metrics", () => {
    const item = {
      id: "bad-index",
      metrics: SINGLES_METRICS,
      latest: { avg: 100, low: 90, trend: 95 },
      change1d: { avg: 1, low: 2 },
      change7d: { avg: null, low: null, trend: null },
      change30d: { avg: null, low: null, trend: null },
    };

    expect(() => assertSummaryMetricObjects(item, SINGLES_METRICS, "bad-index")).toThrow(/keys must match metrics/);
  });

  it("validates net trend breadth summary changes as point deltas", () => {
    const indicatorFile = {
      metrics: TREND_INDICATOR_METRICS,
      points: [
        ["2026-06-23", 1, 50, 100, 80, 20, 10, -5.41, 45, 99, 12],
        ["2026-06-24", 1, 50, 100, 80, 20, 10, -5.04, 45, 99, 12],
      ],
    };
    const validSummary = {
      id: "global-singles",
      change1d: Object.fromEntries(TREND_INDICATOR_METRICS.map((metric) => [metric, metric === "netTrendBreadth" ? 0.37 : 0])),
      change7d: Object.fromEntries(TREND_INDICATOR_METRICS.map((metric) => [metric, null])),
      change30d: Object.fromEntries(TREND_INDICATOR_METRICS.map((metric) => [metric, null])),
    };
    const invalidSummary = {
      ...validSummary,
      change1d: { ...validSummary.change1d, netTrendBreadth: 6.84 },
    };

    expect(() => assertIndicatorSummaryChanges(validSummary, indicatorFile)).not.toThrow();
    expect(() => assertIndicatorSummaryChanges(invalidSummary, indicatorFile)).toThrow(/netTrendBreadth/);
  });

  it("validates Top-N universes against singles catalog and price guide", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tcgindex-validate-"));
    const universeDir = path.join(root, "public", "data", "pokemon", "universes");
    fs.mkdirSync(universeDir, { recursive: true });
    const universeFile = {
      id: "top-100-singles-universe",
      kind: "custom-singles-universe",
      source: { universeSource: "pokemon-singles-price-guide" },
      metrics: SINGLES_METRICS,
      entries: { 1: "Alpha", 2: "Outside Curated But Valid" },
    };
    fs.writeFileSync(path.join(universeDir, "top-100-singles-universe.json"), JSON.stringify(universeFile));
    const manifest = {
      universes: [{ id: "top-100-singles", universeFile: "/data/pokemon/universes/top-100-singles-universe.json" }],
    };
    const productsPayload = {
      products: [
        { idProduct: 1, idCategory: 51, name: "Alpha" },
        { idProduct: 2, idCategory: 51, name: "Outside Curated But Valid" },
      ],
    };
    const priceGuidePayload = {
      priceGuides: [
        { idProduct: 1, avg: 10, low: 8, trend: 100 },
        { idProduct: 2, avg: 20, low: 9, trend: 90 },
      ],
    };

    expect(() => assertCustomUniverses(root, manifest, productsPayload, priceGuidePayload)).not.toThrow();
    expect(() =>
      assertCustomUniverses(root, manifest, { products: [productsPayload.products[0]] }, priceGuidePayload),
    ).toThrow(/outside Pokemon singles catalog/);
  });

  it("validates set universes against declared source expansion ids", () => {
    const universe = {
      id: "mega-brave-singles-universe",
      kind: "set-singles-universe",
      source: { idExpansion: 9001 },
      count: 1,
      entries: { 100: "Mega Brave Card" },
    };
    const productsPayload = {
      products: [{ idProduct: 100, idCategory: 51, idExpansion: 9001, name: "Mega Brave Card" }],
    };

    expect(() => assertSetUniverse(universe, productsPayload, "mega-brave-singles-universe.json")).not.toThrow();
    expect(() =>
      assertSetUniverse(universe, { products: [{ ...productsPayload.products[0], idExpansion: 9002 }] }, "bad.json"),
    ).toThrow(/outside declared idExpansion/);
    expect(() =>
      assertSetUniverse(universe, { products: [{ ...productsPayload.products[0], name: "Wrong Name" }] }, "bad.json"),
    ).toThrow(/name does not match/);
  });
});
