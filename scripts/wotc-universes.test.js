import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const INDEX_DIR = path.join("public", "data", "pokemon", "indexes");
const UNIVERSE_DIR = path.join("public", "data", "pokemon", "universes");
const INDICATOR_DIR = path.join("public", "data", "pokemon", "indicators");
const SET_METRICS = ["avg1", "avg7", "avg30", "avg", "low", "trend"];
const GLOBAL_UNIVERSE_FILES = ["global-singles-universe.json", "global-booster-boxes-universe.json", "global-booster-packs-universe.json"];

const REQUIRED_NEW_UNIVERSES = [
  "ancient-origins-singles-universe.json",
  "arceus-singles-universe.json",
  "ascended-heroes-singles-universe.json",
  "astral-radiance-singles-universe.json",
  "battle-styles-singles-universe.json",
  "black-and-white-singles-universe.json",
  "black-bolt-singles-universe.json",
  "boundaries-crossed-singles-universe.json",
  "breakpoint-singles-universe.json",
  "breakthrough-singles-universe.json",
  "brilliant-stars-singles-universe.json",
  "burning-shadows-singles-universe.json",
  "call-of-legends-singles-universe.json",
  "celebrations-singles-universe.json",
  "celestial-storm-singles-universe.json",
  "champions-path-singles-universe.json",
  "chaos-rising-singles-universe.json",
  "chilling-reign-singles-universe.json",
  "cosmic-eclipse-singles-universe.json",
  "crown-zenith-singles-universe.json",
  "crimson-invasion-singles-universe.json",
  "dark-explorers-singles-universe.json",
  "darkness-ablaze-singles-universe.json",
  "destined-rivals-singles-universe.json",
  "detective-pikachu-singles-universe.json",
  "double-crisis-singles-universe.json",
  "dragon-majesty-singles-universe.json",
  "dragon-vault-singles-universe.json",
  "dragons-exalted-singles-universe.json",
  "emerging-powers-singles-universe.json",
  "evolving-skies-singles-universe.json",
  "evolutions-singles-universe.json",
  "fates-collide-singles-universe.json",
  "flashfire-singles-universe.json",
  "forbidden-light-singles-universe.json",
  "furious-fists-singles-universe.json",
  "fusion-strike-singles-universe.json",
  "generations-singles-universe.json",
  "guardians-rising-singles-universe.json",
  "heartgold-and-soulsilver-singles-universe.json",
  "hidden-fates-singles-universe.json",
  "journey-together-singles-universe.json",
  "legendary-treasures-singles-universe.json",
  "lost-origin-singles-universe.json",
  "lost-thunder-singles-universe.json",
  "mcdonalds-25th-anniversary-singles-universe.json",
  "mcdonalds-dragon-discovery-singles-universe.json",
  "mcdonalds-promos-2011-singles-universe.json",
  "mcdonalds-promos-2012-singles-universe.json",
  "mcdonalds-promos-2014-singles-universe.json",
  "mcdonalds-promos-2015-singles-universe.json",
  "mcdonalds-promos-2016-singles-universe.json",
  "mcdonalds-promos-2017-singles-universe.json",
  "mcdonalds-promos-2018-singles-universe.json",
  "mcdonalds-promos-2022-singles-universe.json",
  "mcdonalds-promos-2023-singles-universe.json",
  "mega-evolution-singles-universe.json",
  "next-destinies-singles-universe.json",
  "noble-victories-singles-universe.json",
  "obsidian-flames-singles-universe.json",
  "paldea-evolved-singles-universe.json",
  "paldean-fates-singles-universe.json",
  "paradox-rift-singles-universe.json",
  "perfect-order-singles-universe.json",
  "phantasmal-flames-singles-universe.json",
  "phantom-forces-singles-universe.json",
  "plasma-blast-singles-universe.json",
  "plasma-freeze-singles-universe.json",
  "plasma-storm-singles-universe.json",
  "platinum-singles-universe.json",
  "pokemon-card-151-singles-universe.json",
  "pokemon-go-singles-universe.json",
  "pokemon-rumble-singles-universe.json",
  "pop-series-9-singles-universe.json",
  "primal-clash-singles-universe.json",
  "prismatic-evolutions-singles-universe.json",
  "rebel-clash-singles-universe.json",
  "rising-rivals-singles-universe.json",
  "roaring-skies-singles-universe.json",
  "scarlet-and-violet-base-singles-universe.json",
  "scarlet-and-violet-promos-singles-universe.json",
  "shining-fates-singles-universe.json",
  "shining-legends-singles-universe.json",
  "shrouded-fable-singles-universe.json",
  "silver-tempest-singles-universe.json",
  "stellar-crown-singles-universe.json",
  "steam-siege-singles-universe.json",
  "sun-and-moon-black-star-promo-singles-universe.json",
  "sun-and-moon-singles-universe.json",
  "supreme-victors-singles-universe.json",
  "surging-sparks-singles-universe.json",
  "sword-and-shield-promo-singles-universe.json",
  "sword-and-shield-singles-universe.json",
  "team-up-singles-universe.json",
  "temporal-forces-singles-universe.json",
  "trading-card-game-classic-singles-universe.json",
  "trick-or-trade-2022-singles-universe.json",
  "trick-or-trade-2023-singles-universe.json",
  "trick-or-trade-2024-singles-universe.json",
  "triumphant-singles-universe.json",
  "twilight-masquerade-singles-universe.json",
  "ultra-prism-singles-universe.json",
  "unbroken-bonds-singles-universe.json",
  "undaunted-singles-universe.json",
  "unified-minds-singles-universe.json",
  "unleashed-singles-universe.json",
  "vivid-voltage-singles-universe.json",
  "white-flare-singles-universe.json",
  "xy-base-singles-universe.json",
];

function setUniverseFiles() {
  return fs
    .readdirSync(UNIVERSE_DIR)
    .filter((fileName) => fileName.endsWith("singles-universe.json") && fileName !== "global-singles-universe.json")
    .sort();
}

function readUniverse(fileName) {
  return JSON.parse(fs.readFileSync(path.join(UNIVERSE_DIR, fileName), "utf8"));
}

function readIndex(fileName) {
  return JSON.parse(fs.readFileSync(path.join(INDEX_DIR, fileName), "utf8"));
}

function readIndicator(fileName) {
  return JSON.parse(fs.readFileSync(path.join(INDICATOR_DIR, fileName), "utf8"));
}

describe("curated Pokemon set universes", () => {
  it("publishes approved set universe files in the universes folder", () => {
    const files = setUniverseFiles();

    expect(files).toEqual(expect.arrayContaining(REQUIRED_NEW_UNIVERSES));
    expect(fs.readdirSync(INDEX_DIR).filter((fileName) => fileName.endsWith("-universe.json"))).toEqual([]);
    expect(fs.existsSync(path.join(INDEX_DIR, "set-singles-universes-manifest.json"))).toBe(false);
  });

  it("keeps curated universe shape, counts, and product ids stable", () => {
    for (const fileName of setUniverseFiles()) {
      const universe = readUniverse(fileName);
      const entryIds = Object.keys(universe.entries);

      expect(universe.kind).toBe("set-singles-universe");
      expect(universe.tcg).toBe("pokemon");
      expect(universe.metrics).toEqual(SET_METRICS);
      expect(universe.count).toBe(entryIds.length);
      expect(universe.curation.requestedChecklistCount).toBeUndefined();
      expect(new Set(entryIds).size).toBe(entryIds.length);
    }
  });

  it("uses actual Cardmarket products from the declared source expansion ids", () => {
    const products = JSON.parse(fs.readFileSync(path.join("testdata", "products_singles_6 (8).json"), "utf8")).products;
    const productsById = new Map(products.map((product) => [String(product.idProduct), product]));

    for (const fileName of setUniverseFiles()) {
      const universe = readUniverse(fileName);
      const expectedExpansions = universe.source.idExpansions ?? [universe.source.idExpansion];

      expect(expectedExpansions.every((idExpansion) => Number.isInteger(idExpansion))).toBe(true);
      expect(universe.curation.cardmarketProductCount).toBe(universe.count);
      for (const [idProduct, name] of Object.entries(universe.entries)) {
        const sourceProduct = productsById.get(idProduct);

        expect(sourceProduct).toBeTruthy();
        expect(expectedExpansions).toContain(sourceProduct.idExpansion);
        expect(sourceProduct.name).toBe(name);
      }
    }
  });

  it("does not publish unsupported Base Set 1st Edition and excludes known incorrect rows", () => {
    expect(fs.existsSync(path.join(UNIVERSE_DIR, "base-set-1st-edition-singles-universe.json"))).toBe(false);

    expect(readUniverse("base-set-unlimited-singles-universe.json").entries["273703"]).toBe("Machamp [Strikes Back | Seismic Toss]");
    expect(readUniverse("base-set-shadowless-singles-universe.json").entries["660220"]).toBe("Machamp [Strikes Back | Seismic Toss]");
    expect(readUniverse("ex-hidden-legends-singles-universe.json").entries["881786"]).toBeUndefined();
  });

  it("lists all universes in the Pokemon discovery manifest", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join("public", "data", "pokemon", "manifest.json"), "utf8"));
    const expectedUniverseFiles = [...GLOBAL_UNIVERSE_FILES, ...setUniverseFiles()].map((fileName) => "/data/pokemon/universes/" + fileName);

    expect(manifest.universes).toHaveLength(expectedUniverseFiles.length);
    expect(manifest.universes.map((universe) => universe.universeFile).sort()).toEqual(expectedUniverseFiles.sort());
    expect(manifest.universes.every((universe) => universe.universeFile.startsWith("/data/pokemon/universes/"))).toBe(true);
  });

  it("generates set price indexes and indicators from the fixed universes", () => {
    for (const fileName of setUniverseFiles()) {
      const slug = fileName.replace("-singles-universe.json", "");
      const equal = readIndex(slug + "-singles-equal.json");
      const market = readIndex(slug + "-singles-market.json");
      const indicator = readIndicator(slug + "-singles.json");

      expect(equal.metrics).toEqual(SET_METRICS);
      expect(market.metrics).toEqual(SET_METRICS);
      expect(equal.points[0][0]).toBe("2026-06-23");
      expect(market.points[0][0]).toBe("2026-06-23");
      expect(equal.points[0]).toHaveLength(7);
      expect(market.points[0]).toHaveLength(7);
      expect(equal.points[0].slice(1).every((value) => typeof value === "number")).toBe(true);
      expect(market.points[0].slice(1).every((value) => typeof value === "number")).toBe(true);
      expect(indicator.points[0][0]).toBe("2026-06-23");
    }
  });

  it("keeps Base Set Shadowless fixed while excluding missing metric products only for that metric", () => {
    const equal = readIndex("base-set-shadowless-singles-equal.json");

    expect(equal.composition.matchedProducts).toBe(103);
    expect(equal.composition.activeProductsByMetric).toEqual({
      avg1: 103,
      avg7: 103,
      avg30: 103,
      avg: 101,
      low: 103,
      trend: 103,
    });
    expect(equal.diagnostics["2026-06-23"].quality.avg.missing).toBe(2);
    expect(equal.diagnostics["2026-06-23"].quality.avg1.missing).toBe(0);
  });

  it("publishes set indexes and indicators through Pokemon manifest and summary", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join("public", "data", "pokemon", "manifest.json"), "utf8"));
    const summary = JSON.parse(fs.readFileSync(path.join("public", "data", "pokemon", "summary.json"), "utf8"));
    const expectedIndexIds = setUniverseFiles().flatMap((fileName) => {
      const slug = fileName.replace("-singles-universe.json", "");
      return [slug + "-singles-equal", slug + "-singles-market"];
    });
    const expectedIndicatorIds = setUniverseFiles().map((fileName) => fileName.replace("-singles-universe.json", "") + "-singles");

    expect(manifest.indexes.map((index) => index.id)).toEqual(expect.arrayContaining(expectedIndexIds));
    expect(summary.indexes.map((index) => index.id)).toEqual(expect.arrayContaining(expectedIndexIds));
    expect(manifest.indicators.map((indicator) => indicator.id)).toEqual(expect.arrayContaining(expectedIndicatorIds));
    expect(summary.indicators.map((indicator) => indicator.id)).toEqual(expect.arrayContaining(expectedIndicatorIds));
    expect(manifest.indexes).toHaveLength(6 + expectedIndexIds.length);
    expect(summary.indexes).toHaveLength(6 + expectedIndexIds.length);
    expect(manifest.indicators).toHaveLength(3 + expectedIndicatorIds.length);
    expect(summary.indicators).toHaveLength(3 + expectedIndicatorIds.length);
  });

  it("points generated compositions at the shared universes folder", () => {
    for (const fileName of setUniverseFiles()) {
      const slug = fileName.replace("-singles-universe.json", "");
      const equal = readIndex(slug + "-singles-equal.json");
      const market = readIndex(slug + "-singles-market.json");
      const indicator = readIndicator(slug + "-singles.json");

      expect(equal.composition.universeFile).toBe("/data/pokemon/universes/" + fileName);
      expect(market.composition.universeFile).toBe("/data/pokemon/universes/" + fileName);
      expect(indicator.composition.universeFile).toBe("/data/pokemon/universes/" + fileName);
    }
  });
});
