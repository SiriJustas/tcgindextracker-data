import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const INDEX_DIR = path.join("public", "data", "pokemon", "indexes");

const EXPECTED_SET_UNIVERSES = {
  "base-set-2-singles-universe.json": 130,
  "base-set-shadowless-singles-universe.json": 102,
  "base-set-unlimited-singles-universe.json": 101,
  "fossil-singles-universe.json": 62,
  "jungle-singles-universe.json": 64,
  "team-rocket-singles-universe.json": 83,
};

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(INDEX_DIR, fileName), "utf8"));
}

function readIndicator(fileName) {
  return JSON.parse(fs.readFileSync(path.join("public", "data", "pokemon", "indicators", fileName), "utf8"));
}

describe("curated WOTC set universes", () => {
  it("publishes only the approved WOTC set universe files plus the global singles universe", () => {
    const files = fs
      .readdirSync(INDEX_DIR)
      .filter((fileName) => fileName.endsWith("singles-universe.json"))
      .sort();

    expect(files).toEqual(["global-singles-universe.json", ...Object.keys(EXPECTED_SET_UNIVERSES)].sort());
  });

  it("keeps curated universe counts and unique product ids stable", () => {
    for (const [fileName, expectedCount] of Object.entries(EXPECTED_SET_UNIVERSES)) {
      const universe = readJson(fileName);
      const entryIds = Object.keys(universe.entries);

      expect(universe.kind).toBe("set-singles-universe");
      expect(universe.count).toBe(expectedCount);
      expect(entryIds).toHaveLength(expectedCount);
      expect(new Set(entryIds).size).toBe(expectedCount);
    }
  });

  it("does not publish unsupported Base Set 1st Edition or Machamp in Base Set variants", () => {
    expect(fs.existsSync(path.join(INDEX_DIR, "base-set-1st-edition-singles-universe.json"))).toBe(false);

    for (const fileName of ["base-set-unlimited-singles-universe.json", "base-set-shadowless-singles-universe.json"]) {
      const universe = readJson(fileName);

      expect(Object.values(universe.entries).some((name) => name.includes("Machamp"))).toBe(false);
    }
  });

  it("lists the curated set universes in the discovery manifest", () => {
    const manifest = readJson("set-singles-universes-manifest.json");

    expect(manifest.curationPolicy).toBe("curated-wotc-only");
    expect(manifest.sets.map((set) => set.file).sort()).toEqual(
      Object.keys(EXPECTED_SET_UNIVERSES)
        .map((fileName) => `/data/pokemon/indexes/${fileName}`)
        .sort(),
    );
  });

  it("generates initial set price indexes and indicators from the fixed universes", () => {
    for (const fileName of Object.keys(EXPECTED_SET_UNIVERSES)) {
      const slug = fileName.replace("-singles-universe.json", "");
      const equal = readJson(`${slug}-singles-equal.json`);
      const market = readJson(`${slug}-singles-market.json`);
      const indicator = readIndicator(`${slug}-singles.json`);

      expect(equal.metrics).toEqual(["avg1", "avg7", "avg30", "avg", "low", "trend"]);
      expect(market.metrics).toEqual(["avg1", "avg7", "avg30", "avg", "low", "trend"]);
      expect(equal.points[0]).toEqual(["2026-06-23", 100, 100, 100, 100, 100, 100]);
      expect(market.points[0]).toEqual(["2026-06-23", 100, 100, 100, 100, 100, 100]);
      expect(indicator.points[0][0]).toBe("2026-06-23");
    }
  });

  it("keeps Base Set Shadowless fixed while excluding missing metric products only for that metric", () => {
    const equal = readJson("base-set-shadowless-singles-equal.json");

    expect(equal.composition.matchedProducts).toBe(102);
    expect(equal.composition.activeProductsByMetric).toEqual({
      avg1: 102,
      avg7: 102,
      avg30: 102,
      avg: 100,
      low: 102,
      trend: 102,
    });
    expect(equal.diagnostics["2026-06-23"].quality.avg.missing).toBe(2);
    expect(equal.diagnostics["2026-06-23"].quality.avg1.missing).toBe(0);
  });

  it("publishes set indexes and indicators through Pokemon manifest and summary", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join("public", "data", "pokemon", "manifest.json"), "utf8"));
    const summary = JSON.parse(fs.readFileSync(path.join("public", "data", "pokemon", "summary.json"), "utf8"));
    const expectedIndexIds = Object.keys(EXPECTED_SET_UNIVERSES).flatMap((fileName) => {
      const slug = fileName.replace("-singles-universe.json", "");
      return [`${slug}-singles-equal`, `${slug}-singles-market`];
    });
    const expectedIndicatorIds = Object.keys(EXPECTED_SET_UNIVERSES).map((fileName) => `${fileName.replace("-singles-universe.json", "")}-singles`);

    expect(manifest.indexes.map((index) => index.id)).toEqual(expect.arrayContaining(expectedIndexIds));
    expect(summary.indexes.map((index) => index.id)).toEqual(expect.arrayContaining(expectedIndexIds));
    expect(manifest.indicators.map((indicator) => indicator.id)).toEqual(expect.arrayContaining(expectedIndicatorIds));
    expect(summary.indicators.map((indicator) => indicator.id)).toEqual(expect.arrayContaining(expectedIndicatorIds));
  });
});
