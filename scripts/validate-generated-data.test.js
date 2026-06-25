import { describe, expect, it } from "vitest";
import {
  assertIndicatorSummaryChanges,
  assertSummaryMetricObjects,
  validateGeneratedData,
} from "./validate-generated-data.js";
import { SINGLES_METRICS, TREND_INDICATOR_METRICS } from "./index-engine.js";

describe("generated data validation", () => {
  it("accepts the current generated dataset", () => {
    expect(() => validateGeneratedData(process.cwd(), { logSizes: false })).not.toThrow();
  });

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
});
