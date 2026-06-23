import { describe, expect, it } from "vitest";
import { CARDMARKET_GAMES, cardmarketSourceUrls } from "./cardmarket-sources.js";

describe("Cardmarket sources", () => {
  it("uses the confirmed game ids", () => {
    expect(CARDMARKET_GAMES).toEqual({
      pokemon: 6,
      mtg: 1,
      yugioh: 3,
    });
  });

  it("builds public source urls from game ids", () => {
    expect(cardmarketSourceUrls("pokemon")).toEqual({
      singles: "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json",
      nonSingles: "https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_6.json",
      priceGuide: "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json",
    });
  });
});
