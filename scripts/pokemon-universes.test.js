import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const INDEX_DIR = path.join("public", "data", "pokemon", "indexes");
const UNIVERSE_DIR = path.join("public", "data", "pokemon", "universes");
const INDICATOR_DIR = path.join("public", "data", "pokemon", "indicators");
const SET_METRICS = ["avg", "low", "trend"];
const GLOBAL_UNIVERSE_FILES = ["global-singles-universe.json", "global-booster-boxes-universe.json", "global-booster-packs-universe.json"];
const CUSTOM_UNIVERSE_FILES = [
  "top-100-singles-universe.json",
  "top-250-singles-universe.json",
  "top-500-singles-universe.json",
  "top-1000-singles-universe.json",
];

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
    .filter((fileName) => {
      if (!fileName.endsWith(".json") || GLOBAL_UNIVERSE_FILES.includes(fileName)) return false;
      return readUniverse(fileName).kind === "set-singles-universe";
    })
    .sort();
}

function indexedUniverseFiles() {
  return fs
    .readdirSync(UNIVERSE_DIR)
    .filter((fileName) => {
      if (!fileName.endsWith(".json") || GLOBAL_UNIVERSE_FILES.includes(fileName)) return false;
      const kind = readUniverse(fileName).kind;
      return kind === "set-singles-universe" || kind === "custom-singles-universe";
    })
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
    expect(fs.readdirSync(UNIVERSE_DIR)).toEqual(expect.arrayContaining(CUSTOM_UNIVERSE_FILES));
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
  }, 30000);

  it("does not publish unsupported Base Set 1st Edition and excludes known incorrect rows", () => {
    expect(fs.existsSync(path.join(UNIVERSE_DIR, "base-set-1st-edition-singles-universe.json"))).toBe(false);

    expect(readUniverse("base-set-unlimited-singles-universe.json").entries["273703"]).toBe("Machamp [Strikes Back | Seismic Toss]");
    expect(readUniverse("base-set-shadowless-singles-universe.json").entries["660220"]).toBe("Machamp [Strikes Back | Seismic Toss]");
    expect(readUniverse("ex-hidden-legends-singles-universe.json").entries["881786"]).toBeUndefined();
  });

  it("uses corrected names for duplicate Trainer Kit and VMAX Starter Deck expansions", () => {
    const corrected = [
      ["xy-trainer-kit-singles-universe.json", "XY Trainer Kit", "281652"],
      ["xy-trainer-kit-bisharp-and-wigglytuff-singles-universe.json", "XY Trainer Kit: Bisharp & Wigglytuff", "281964"],
      ["xy-trainer-kit-latias-and-latios-singles-universe.json", "XY Trainer Kit: Latias & Latios", "289737"],
      ["xy-trainer-kit-pikachu-libre-and-suicune-singles-universe.json", "XY Trainer Kit: Pikachu Libre & Suicune", "290263"],
      ["sm-trainer-kit-lycanroc-and-alolan-raichu-singles-universe.json", "SM Trainer Kit: Lycanroc & Alolan Raichu", "297279"],
      ["sm-trainer-kit-alolan-sandslash-and-alolan-ninetales-singles-universe.json", "SM Trainer Kit: Alolan Sandslash & Alolan Ninetales", "359328"],
      ["vmax-starter-deck-venusaur-vmax-singles-universe.json", "VMAX Starter Deck: Venusaur VMAX", "523615"],
      ["vmax-starter-deck-blastoise-vmax-singles-universe.json", "VMAX Starter Deck: Blastoise VMAX", "523725"],
    ];
    const staleFiles = [
      "xy-trainer-kit-1632-singles-universe.json",
      "xy-trainer-kit-1683-singles-universe.json",
      "xy-trainer-kit-1707-singles-universe.json",
      "sm-trainer-kit-singles-universe.json",
      "sm-trainer-kit-2070-singles-universe.json",
      "vmax-starter-deck-singles-universe.json",
      "vmax-starter-deck-3590-singles-universe.json",
    ];

    for (const [fileName, name, sampleProductId] of corrected) {
      const universe = readUniverse(fileName);
      expect(universe.name).toBe(name);
      expect(universe.entries[sampleProductId]).toBeTruthy();
    }
    for (const fileName of staleFiles) {
      expect(fs.existsSync(path.join(UNIVERSE_DIR, fileName))).toBe(false);
    }
  });

  it("builds Top-N custom universes from the Pokemon singles price guide", () => {
    const products = JSON.parse(fs.readFileSync(path.join("testdata", "products_singles_6 (8).json"), "utf8")).products;
    const singlesIds = new Set(products.filter((product) => product.idCategory === 51).map((product) => String(product.idProduct)));
    const priceGuidesByCreatedAt = new Map(
      ["price_guide_6 (6).json", "price_guide_6 (8).json"].map((fileName) => {
        const payload = JSON.parse(fs.readFileSync(path.join("testdata", fileName), "utf8"));
        return [payload.createdAt, new Map(payload.priceGuides.map((price) => [String(price.idProduct), price]))];
      }),
    );

    const topUniverses = [
      [100, readUniverse("top-100-singles-universe.json")],
      [250, readUniverse("top-250-singles-universe.json")],
      [500, readUniverse("top-500-singles-universe.json")],
      [1000, readUniverse("top-1000-singles-universe.json")],
    ];

    for (const [limit, universe] of topUniverses) {
      expect(universe.kind).toBe("custom-singles-universe");
      expect(universe.source.universeSource).toBe("pokemon-singles-price-guide");
      expect(universe.curation.status).toBe("generated-from-price-guide");
      expect(Object.keys(universe.entries).length).toBeLessThanOrEqual(limit);
      const pricesByProduct = priceGuidesByCreatedAt.get(universe.source.pricesCreatedAt);
      for (const idProduct of Object.keys(universe.entries)) {
        expect(singlesIds.has(idProduct)).toBe(true);
        const price = pricesByProduct.get(idProduct);
        expect(price.avg).toBeGreaterThan(0);
        expect(price.low).toBeGreaterThan(0);
        expect(price.trend).toBeGreaterThan(0);
      }
    }
  });

  it("lists all universes in the Pokemon discovery manifest", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join("public", "data", "pokemon", "manifest.json"), "utf8"));
    const expectedUniverseFiles = [...GLOBAL_UNIVERSE_FILES, ...indexedUniverseFiles()].map((fileName) => "/data/pokemon/universes/" + fileName);

    expect(manifest.universes).toHaveLength(expectedUniverseFiles.length);
    expect(manifest.universes.map((universe) => universe.universeFile).sort()).toEqual(expectedUniverseFiles.sort());
    expect(manifest.universes.every((universe) => universe.universeFile.startsWith("/data/pokemon/universes/"))).toBe(true);
  });

  it("generates set price indexes and indicators from the fixed universes", () => {
    for (const fileName of indexedUniverseFiles()) {
      const universe = readUniverse(fileName);
      const universeId = universe.kind === "custom-singles-universe" ? universe.slug : universe.slug + "-singles";
      const equal = readIndex(universeId + "-equal.json");
      const market = readIndex(universeId + "-market.json");
      const indicator = readIndicator(universeId + ".json");

      expect(equal.metrics).toEqual(SET_METRICS);
      expect(market.metrics).toEqual(SET_METRICS);
      expect(equal.points[0][0]).toBe("2026-06-23");
      expect(market.points[0][0]).toBe("2026-06-23");
      expect(equal.points[0]).toHaveLength(4);
      expect(market.points[0]).toHaveLength(4);
      expect(equal.points[0].slice(1).every((value) => value === null || typeof value === "number")).toBe(true);
      expect(market.points[0].slice(1).every((value) => value === null || typeof value === "number")).toBe(true);
      expect(indicator.points[0][0]).toBe("2026-06-23");
    }
  });

  it("keeps Base Set Shadowless fixed while excluding missing metric products only for that metric", () => {
    const equal = readIndex("base-set-shadowless-singles-equal.json");

    expect(equal.composition.matchedProducts).toBe(103);
    expect(Object.keys(equal.composition.activeProductsByMetric)).toEqual(SET_METRICS);
    expect(equal.composition.activeProductsByMetric.avg).toBe(101);
    expect(equal.composition.activeProductsByMetric.low).toBe(103);
    expect(equal.composition.activeProductsByMetric.trend).toBe(103);
    expect(equal.composition.missingProductsByMetric.avg).toBe(2);
    expect(equal.composition.missingProductsByMetric.avg1).toBeUndefined();
  });

  it("publishes set indexes and indicators through Pokemon manifest and summary", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join("public", "data", "pokemon", "manifest.json"), "utf8"));
    const summary = JSON.parse(fs.readFileSync(path.join("public", "data", "pokemon", "summary.json"), "utf8"));
    const expectedIndexIds = indexedUniverseFiles().flatMap((fileName) => {
      const universe = readUniverse(fileName);
      const universeId = universe.kind === "custom-singles-universe" ? universe.slug : universe.slug + "-singles";
      return [universeId + "-equal", universeId + "-market"];
    });
    const expectedIndicatorIds = indexedUniverseFiles().map((fileName) => {
      const universe = readUniverse(fileName);
      return universe.kind === "custom-singles-universe" ? universe.slug : universe.slug + "-singles";
    });

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
    for (const fileName of indexedUniverseFiles()) {
      const universe = readUniverse(fileName);
      const universeId = universe.kind === "custom-singles-universe" ? universe.slug : universe.slug + "-singles";
      const equal = readIndex(universeId + "-equal.json");
      const market = readIndex(universeId + "-market.json");
      const indicator = readIndicator(universeId + ".json");

      expect(equal.composition.universeFile).toBe("/data/pokemon/universes/" + fileName);
      expect(market.composition.universeFile).toBe("/data/pokemon/universes/" + fileName);
      expect(indicator.composition.universeFile).toBe("/data/pokemon/universes/" + fileName);
    }
  });
});
