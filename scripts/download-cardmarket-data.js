import { mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CARDMARKET_GAMES, cardmarketSourceUrls } from "./cardmarket-sources.js";

const root = process.cwd();
const downloadsDir = path.join(root, "downloads");

export function selectedGameKeys(args = []) {
  const requested = args.length === 0 ? ["pokemon"] : args;
  const keys = requested.includes("all") ? Object.keys(CARDMARKET_GAMES) : requested;
  const uniqueKeys = [...new Set(keys)];
  const unknown = uniqueKeys.filter((key) => !CARDMARKET_GAMES[key]);
  if (unknown.length > 0) {
    throw new Error(`Unknown Cardmarket game key(s): ${unknown.join(", ")}`);
  }
  return uniqueKeys;
}

export async function downloadCardmarketData(gameKeys = ["pokemon"]) {
  for (const gameKey of gameKeys) {
    await downloadGame(gameKey);
  }
}

async function downloadGame(gameKey) {
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await downloadCardmarketData(selectedGameKeys(process.argv.slice(2)));
}
