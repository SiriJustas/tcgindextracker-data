import { describe, expect, it } from "vitest";
import {
  buildExpansionUniverseCandidates,
  inferExpansionNameFromNonSingles,
  parseManualExpansionMappings,
  parseCardmarketExpansionEntries,
  slugifyName,
  validateManualExpansionMappings,
} from "./expansion-universe-engine.js";

describe("expansion universe engine", () => {
  it("parses Cardmarket expansion entries from HTML", () => {
    const html = `
      <a href="/en/Pokemon/Expansions/Mega-Brave">Mega Brave</a>
      <span>92 Cards</span>
      <a href="/en/Pokemon/Expansions/30th-Celebration">30th Celebration</a>
      <span>0 Cards</span>
    `;

    expect(parseCardmarketExpansionEntries(html)).toEqual([
      {
        name: "Mega Brave",
        slug: "Mega-Brave",
        url: "https://www.cardmarket.com/en/Pokemon/Expansions/Mega-Brave",
        cardCount: 92,
      },
      {
        name: "30th Celebration",
        slug: "30th-Celebration",
        url: "https://www.cardmarket.com/en/Pokemon/Expansions/30th-Celebration",
        cardCount: 0,
      },
    ]);
  });

  it("infers clean expansion names from non-single product names", () => {
    expect(
      inferExpansionNameFromNonSingles([
        { name: "CSV9C: Stellar Crystal Booster Box" },
        { name: "CSV9C: Stellar Crystal Jumbo Booster" },
      ]),
    ).toBe("Stellar Crystal");
    expect(inferExpansionNameFromNonSingles([{ name: "Mega Evolution ID/TH Booster Box" }])).toBe("Mega Evolution ID/TH");
    expect(inferExpansionNameFromNonSingles([{ name: "EX Trainer Kit" }])).toBe("EX Trainer Kit");
  });

  it("creates collision-safe slugs", () => {
    expect(slugifyName("M-P Traditional Chinese Promos")).toBe("m-p-traditional-chinese-promos");
    expect(slugifyName("Scarlet & Violet: Additionals")).toBe("scarlet-and-violet-additionals");
  });

  it("builds only high-confidence candidates when expansion page entries are present", () => {
    const result = buildExpansionUniverseCandidates({
      productsPayload: {
        createdAt: "2026-06-22T12:09:07+0200",
        products: [
          { idProduct: 1, name: "Alpha", idCategory: 51, idExpansion: 9001 },
          { idProduct: 2, name: "Beta", idCategory: 51, idExpansion: 9001 },
          { idProduct: 3, name: "Gamma", idCategory: 51, idExpansion: 9002 },
        ],
      },
      nonSinglesPayload: {
        products: [
          { name: "Mega Brave Booster Box", idExpansion: 9001 },
          { name: "Unknown Local Set Booster Box", idExpansion: 9002 },
        ],
      },
      expansionEntries: [{ name: "Mega Brave", slug: "Mega-Brave", url: "https://example.test/Mega-Brave", cardCount: 92 }],
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      id: "mega-brave-singles-universe",
      name: "Mega Brave",
      slug: "mega-brave",
      source: {
        idExpansion: 9001,
        cardmarketExpansionUrl: "https://example.test/Mega-Brave",
      },
      curation: { status: "cardmarket-expansion-page-matched" },
      count: 2,
      metrics: ["avg", "low", "trend"],
    });
    expect(result.candidates[0].entries).toEqual({ "1": "Alpha", "2": "Beta" });
    expect(result.skipped).toEqual(expect.arrayContaining([expect.objectContaining({ idExpansion: 9002, reason: "not-found-on-cardmarket-expansions-page" })]));
  });

  it("can generate local-inference candidates when live Cardmarket HTML is unavailable", () => {
    const result = buildExpansionUniverseCandidates({
      productsPayload: {
        products: [{ idProduct: 10, name: "Pikachu", idCategory: 51, idExpansion: 9100 }],
      },
      nonSinglesPayload: {
        products: [{ name: "M-P Traditional Chinese Promos Booster", idExpansion: 9100 }],
      },
      existingUniverses: [],
      expansionEntries: [],
      allowLocalInference: true,
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].name).toBe("M-P Traditional Chinese Promos");
    expect(result.candidates[0].curation.status).toBe("local-catalog-name-inferred");
  });

  it("preserves existing approved universes", () => {
    const result = buildExpansionUniverseCandidates({
      productsPayload: {
        products: [{ idProduct: 10, name: "Pikachu", idCategory: 51, idExpansion: 9100 }],
      },
      nonSinglesPayload: {
        products: [{ name: "Mega Brave Booster", idExpansion: 9100 }],
      },
      existingUniverses: [{ kind: "set-singles-universe", slug: "mega-brave", source: { idExpansion: 9100 } }],
      expansionEntries: [{ name: "Mega Brave", cardCount: 92 }],
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toEqual([expect.objectContaining({ idExpansion: 9100, reason: "already-covered" })]);
  });

  it("parses manual mappings with quotes, tight arrows, and missing names", () => {
    const parsed = parseManualExpansionMappings(`
      275589, Brock's Vulpix [Hypnotic Gaze | Fire Ring], 1606 ->"W" Promos
      678012, Flareon [4] Lv.55 [Tackle | Fire Tail Slap], 4288 ->Infernape SP Half Deck
      550216, Alolan Raichu [Quick Attack | Electric Surfer], 6200
    `);

    expect(parsed.errors).toEqual([]);
    expect(parsed.mappings).toEqual([
      {
        idProduct: 275589,
        cardName: "Brock's Vulpix [Hypnotic Gaze | Fire Ring]",
        idExpansion: 1606,
        setName: "W Promos",
        line: 2,
      },
      {
        idProduct: 678012,
        cardName: "Flareon [4] Lv.55 [Tackle | Fire Tail Slap]",
        idExpansion: 4288,
        setName: "Infernape SP Half Deck",
        line: 3,
      },
      {
        idProduct: 550216,
        cardName: "Alolan Raichu [Quick Attack | Electric Surfer]",
        idExpansion: 6200,
        setName: null,
        line: 4,
      },
    ]);
  });

  it("uses manual names as authoritative and audits missing manual names", () => {
    const productsPayload = {
      products: [
        { idProduct: 1, name: "Alpha [Hit]", idCategory: 51, idExpansion: 9001 },
        { idProduct: 2, name: "Beta [Hit]", idCategory: 51, idExpansion: 9002 },
      ],
    };
    const manualMappings = [
      { idProduct: 1, cardName: "Alpha [Hit]", idExpansion: 9001, setName: "Manual Alpha", line: 1 },
      { idProduct: 2, cardName: "Beta [Hit]", idExpansion: 9002, setName: null, line: 2 },
    ];
    const result = buildExpansionUniverseCandidates({
      productsPayload,
      nonSinglesPayload: { products: [] },
      manualMappings,
    });

    expect(validateManualExpansionMappings(manualMappings, productsPayload)).toEqual([]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].name).toBe("Manual Alpha");
    expect(result.candidates[0].curation.status).toBe("manual-idExpansion-name-map");
    expect(result.skipped).toEqual([expect.objectContaining({ idExpansion: 9002, reason: "missing-manual-name" })]);
  });

  it("uses explicit name overrides to replace stale generic universe names", () => {
    const result = buildExpansionUniverseCandidates({
      productsPayload: {
        products: [{ idProduct: 281964, name: "Swirlix [Draining Kiss | XY]", idCategory: 51, idExpansion: 1632 }],
      },
      nonSinglesPayload: {
        products: [{ name: "XY Trainer Kit Booster", idExpansion: 1632 }],
      },
      existingUniverses: [{ kind: "set-singles-universe", name: "XY Trainer Kit", slug: "xy-trainer-kit-1632", source: { idExpansion: 1632 } }],
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      id: "xy-trainer-kit-bisharp-and-wigglytuff-singles-universe",
      name: "XY Trainer Kit: Bisharp & Wigglytuff",
      slug: "xy-trainer-kit-bisharp-and-wigglytuff",
      curation: { status: "explicit-idExpansion-name-override" },
    });
  });
});
