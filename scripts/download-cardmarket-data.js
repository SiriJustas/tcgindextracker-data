import { mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import path from "node:path";
import { CARDMARKET_GAMES, cardmarketSourceUrls } from "./cardmarket-sources.js";

const root = process.cwd();
const downloadsDir = path.join(root, "downloads");

for (const gameKey of Object.keys(CARDMARKET_GAMES)) {
  const urls = cardmarketSourceUrls(gameKey);
  const gameDir = path.join(downloadsDir, gameKey);
  await mkdir(gameDir, { recursive: true });

  await download(urls.singles, path.join(gameDir, "products_singles.json"));
  await download(urls.nonSingles, path.join(gameDir, "products_nonsingles.json"));
  await download(urls.priceGuide, path.join(gameDir, "price_guide.json"));
}

async function download(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed with HTTP ${response.status}: ${url}`);
  }

  await finished(Readable.fromWeb(response.body).pipe(createWriteStream(outputPath)));
  console.log(`Downloaded ${url} -> ${path.relative(root, outputPath)}`);
}
