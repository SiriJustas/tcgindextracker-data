export const CARDMARKET_GAMES = {
  pokemon: 6,
  mtg: 1,
  yugioh: 3,
};

const baseUrl = "https://downloads.s3.cardmarket.com/productCatalog";

export function cardmarketSourceUrls(gameKey) {
  const gameId = CARDMARKET_GAMES[gameKey];
  if (!gameId) {
    throw new Error(`Unknown Cardmarket game key: ${gameKey}`);
  }

  return {
    singles: `${baseUrl}/productList/products_singles_${gameId}.json`,
    nonSingles: `${baseUrl}/productList/products_nonsingles_${gameId}.json`,
    priceGuide: `${baseUrl}/priceGuide/price_guide_${gameId}.json`,
  };
}
