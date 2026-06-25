import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SINGLES_METRICS, TOP_SINGLES_LIMITS, TREND_INDICATOR_METRICS, indicatorChange } from "./index-engine.js";

const REMOVED_NAMES = new Set(["avg1", "avg7", "avg30", "advanceDecline", "percentAbove30d", "heat", "dispersion"]);
const REQUIRED_GLOBAL_UNIVERSE_IDS = ["global-singles", "global-booster-boxes", "global-booster-packs"];
const WINDOWS_ABSOLUTE_PATH = /[A-Za-z]:[\\/]/;
const UNIX_HOME_PATH = /\/home\/[^/\s"]+\//;
const MAC_HOME_PATH = /\/u(?:sers)\/[^/\s"]+\//i;

export function validateGeneratedData(root = process.cwd(), options = {}) {
  const pokemonDir = path.join(root, "public", "data", "pokemon");
  const indexDir = path.join(pokemonDir, "indexes");
  const indicatorDir = path.join(pokemonDir, "indicators");
  const universeDir = path.join(pokemonDir, "universes");
  const manifest = readJson(path.join(pokemonDir, "manifest.json"));
  const summary = readJson(path.join(pokemonDir, "summary.json"));
  const productsPayload = readOptionalJson(options.productsPath ?? path.join(root, "testdata", "products_singles_6 (8).json"));
  const priceGuidePayloads = options.priceGuidePayloads ?? readDefaultPriceGuides(root, options.pricesPath);
  const universeFiles = jsonFileNames(universeDir);
  const expectedUniverseCount = universeFiles.length;
  const expectedIndexCount = expectedUniverseCount * 2;
  const expectedIndicatorCount = expectedUniverseCount;

  assertArrayLength(manifest.indexes, expectedIndexCount, "manifest.json indexes");
  assertArrayLength(manifest.indicators, expectedIndicatorCount, "manifest.json indicators");
  assertArrayLength(manifest.universes, expectedUniverseCount, "manifest.json universes");
  assertArrayLength(summary.indexes, expectedIndexCount, "summary.json indexes");
  assertArrayLength(summary.indicators, expectedIndicatorCount, "summary.json indicators");
  assertRequiredGlobalItems(manifest);

  for (const universe of manifest.universes) {
    if (!String(universe.universeFile ?? "").startsWith("/data/pokemon/universes/")) {
      throw new Error(`manifest universe has unexpected universeFile: ${universe.universeFile}`);
    }
    const file = publicPathToFile(root, universe.universeFile);
    const universeFile = assertFileMetrics(file, SINGLES_METRICS);
    assertSetUniverse(universeFile, productsPayload, file);
  }
  assertCustomUniverses(root, manifest, productsPayload, priceGuidePayloads);

  for (const index of manifest.indexes) {
    if (!String(index.file ?? "").startsWith("/data/pokemon/indexes/")) {
      throw new Error(`manifest index has unexpected file: ${index.file}`);
    }
    const file = publicPathToFile(root, index.file);
    const history = assertFileMetrics(file, SINGLES_METRICS);
    assertHistoryPointLengths(history, file);
  }

  for (const indicator of manifest.indicators) {
    if (!String(indicator.file ?? "").startsWith("/data/pokemon/indicators/")) {
      throw new Error(`manifest indicator has unexpected file: ${indicator.file}`);
    }
    const file = publicPathToFile(root, indicator.file);
    const history = assertFileMetrics(file, TREND_INDICATOR_METRICS);
    assertHistoryPointLengths(history, file);
  }

  for (const index of summary.indexes) {
    assertSummaryMetricObjects(index, SINGLES_METRICS, `summary index ${index.id}`);
  }

  for (const indicator of summary.indicators) {
    assertSummaryMetricObjects(indicator, TREND_INDICATOR_METRICS, `summary indicator ${indicator.id}`);
    const history = readJson(publicPathToFile(root, indicator.file));
    assertIndicatorSummaryChanges(indicator, history);
  }

  for (const name of jsonFileNames(indexDir)) {
    if (name.endsWith("-universe.json") || name === "set-singles-universes-manifest.json") {
      throw new Error(`Universe file must not remain in indexes folder: ${name}`);
    }
    readJson(path.join(indexDir, name));
  }
  for (const name of jsonFileNames(indicatorDir)) readJson(path.join(indicatorDir, name));
  for (const name of universeFiles) readJson(path.join(universeDir, name));

  const report = buildSizeReport(root);
  if (options.logSizes !== false) {
    console.log(`Generated data size: ${formatBytes(report.totalBytes)} total`);
    console.log(`summary.json: ${formatBytes(report.summaryBytes)}`);
    console.log(`manifest.json: ${formatBytes(report.manifestBytes)}`);
  }
  return report;
}

export function assertIndicatorSummaryChanges(summaryIndicator, indicatorFile) {
  const metrics = indicatorFile.metrics ?? [];
  for (const [changeKey, days] of [
    ["change1d", 1],
    ["change7d", 7],
    ["change30d", 30],
  ]) {
    const changes = summaryIndicator[changeKey] ?? {};
    for (const [index, metric] of metrics.entries()) {
      const expected = indicatorChange(indicatorFile.points ?? [], metric, index + 1, days);
      const actual = changes[metric] ?? null;
      if (!sameNullableNumber(actual, expected)) {
        throw new Error(`${summaryIndicator.id}.${changeKey}.${metric} expected ${expected}, got ${actual}`);
      }
    }
  }
}

export function assertSummaryMetricObjects(item, expectedMetrics, label) {
  if (!sameArray(item.metrics, expectedMetrics)) {
    throw new Error(`${label} has unexpected metrics`);
  }
  for (const key of ["latest", "change1d", "change7d", "change30d"]) {
    const value = item[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${label}.${key} must be an object`);
    }
    assertExactKeys(value, expectedMetrics, `${label}.${key}`);
    for (const metric of expectedMetrics) {
      const metricValue = value[metric];
      if (metricValue !== null && (typeof metricValue !== "number" || !Number.isFinite(metricValue))) {
        throw new Error(`${label}.${key}.${metric} must be a finite number or null`);
      }
    }
  }
}

function assertRequiredGlobalItems(manifest) {
  for (const id of REQUIRED_GLOBAL_UNIVERSE_IDS) {
    if (!manifest.universes.some((universe) => universe.id === id)) {
      throw new Error(`Missing required universe: ${id}`);
    }
    if (!manifest.indicators.some((indicator) => indicator.id === id)) {
      throw new Error(`Missing required indicator: ${id}`);
    }
    for (const method of ["equal", "market"]) {
      if (!manifest.indexes.some((index) => index.id === `${id}-${method}`)) {
        throw new Error(`Missing required index: ${id}-${method}`);
      }
    }
  }
}

export function assertCustomUniverses(root, manifest, productsPayload = null, priceGuidePayloads = []) {
  const singlesProducts = new Set((productsPayload?.products ?? []).filter((product) => product.idCategory === 51).map((product) => String(product.idProduct)));
  const priceGuidesByCreatedAt = new Map(asArray(priceGuidePayloads).map((payload) => [payload?.createdAt, new Map((payload?.priceGuides ?? []).map((price) => [String(price.idProduct), price]))]));
  for (const universe of manifest.universes) {
    const file = readJson(publicPathToFile(root, universe.universeFile));
    if (file.kind !== "custom-singles-universe") continue;
    const priceGuides = priceGuidesByCreatedAt.get(file.source?.pricesCreatedAt) ?? [...priceGuidesByCreatedAt.values()].at(-1) ?? new Map();
    const topLimit = topSinglesLimit(universe.id);
    if (topLimit !== null && Object.keys(file.entries ?? {}).length > topLimit) {
      throw new Error(`${universe.id} universe must not contain more than ${topLimit} products`);
    }
    if (file.source?.universeSource !== "pokemon-singles-price-guide") {
      throw new Error(`${universe.id} must be generated from the Pokemon singles price guide`);
    }
    for (const idProduct of Object.keys(file.entries ?? {})) {
      if (singlesProducts.size > 0 && !singlesProducts.has(idProduct)) {
        throw new Error(`${universe.id} contains product outside Pokemon singles catalog: ${idProduct}`);
      }
      const price = priceGuides.get(idProduct);
      if (priceGuides.size > 0 && !hasAllValidPrices(price, SINGLES_METRICS)) {
        throw new Error(`${universe.id} contains product without valid avg/low/trend prices: ${idProduct}`);
      }
    }
  }
}

export function assertSetUniverse(universe, productsPayload = null, file = "") {
  if (universe?.kind !== "set-singles-universe") return;
  if (universe.count !== Object.keys(universe.entries ?? {}).length) {
    throw new Error(`${path.relative(process.cwd(), file)} count must match entries length`);
  }
  const productsById = new Map((productsPayload?.products ?? []).map((product) => [String(product.idProduct), product]));
  if (productsById.size === 0) return;
  const expectedExpansions = new Set((universe.source?.idExpansions ?? [universe.source?.idExpansion]).filter(Number.isInteger));
  if (expectedExpansions.size === 0) {
    throw new Error(`${path.relative(process.cwd(), file)} set universe must declare source.idExpansion`);
  }
  for (const [idProduct, name] of Object.entries(universe.entries ?? {})) {
    const product = productsById.get(idProduct);
    if (!product || product.idCategory !== 51) {
      throw new Error(`${path.relative(process.cwd(), file)} contains product outside Pokemon singles catalog: ${idProduct}`);
    }
    if (!expectedExpansions.has(product.idExpansion)) {
      throw new Error(`${path.relative(process.cwd(), file)} contains product ${idProduct} outside declared idExpansion`);
    }
    if (product.name !== name) {
      throw new Error(`${path.relative(process.cwd(), file)} product ${idProduct} name does not match products_singles catalog`);
    }
  }
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function hasAllValidPrices(price, metrics) {
  return metrics.every((metric) => Number(price?.[metric]) > 0);
}

function topSinglesLimit(universeId) {
  const match = String(universeId ?? "").match(/^top-(\d+)-singles$/);
  if (!match) return null;
  const limit = Number(match[1]);
  if (!TOP_SINGLES_LIMITS.includes(limit)) {
    throw new Error(`Unexpected top singles universe id: ${universeId}`);
  }
  return limit;
}

function assertFileMetrics(file, expectedMetrics) {
  const data = readJson(file);
  if (!sameArray(data.metrics, expectedMetrics)) {
    throw new Error(`${path.relative(process.cwd(), file)} has unexpected metrics`);
  }
  return data;
}

function assertHistoryPointLengths(history, file) {
  if (!Array.isArray(history.points)) {
    throw new Error(`${path.relative(process.cwd(), file)} must contain points`);
  }
  const expectedLength = (history.metrics?.length ?? 0) + 1;
  for (const point of history.points) {
    if (!Array.isArray(point) || point.length !== expectedLength) {
      throw new Error(`${path.relative(process.cwd(), file)} has a point with unexpected length`);
    }
  }
}

function readJson(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing required generated file: ${path.relative(process.cwd(), file)}`);
  }
  const text = fs.readFileSync(file, "utf8");
  if (WINDOWS_ABSOLUTE_PATH.test(text) || UNIX_HOME_PATH.test(text) || MAC_HOME_PATH.test(text)) {
    throw new Error(`Local filesystem path found in ${path.relative(process.cwd(), file)}`);
  }
  const data = JSON.parse(text);
  assertNoDemoKeys(data, file);
  assertNoRemovedMetricNames(data, file);
  return data;
}

function readOptionalJson(file) {
  if (!file || !fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readDefaultPriceGuides(root, explicitPath) {
  if (explicitPath) return asArray(readOptionalJson(explicitPath)).filter(Boolean);
  const testdataDir = path.join(root, "testdata");
  if (!fs.existsSync(testdataDir)) return [];
  return fs
    .readdirSync(testdataDir)
    .filter((fileName) => /^price_guide_6 .*\.json$/.test(fileName))
    .map((fileName) => readOptionalJson(path.join(testdataDir, fileName)))
    .filter(Boolean);
}

function assertNoDemoKeys(value, file) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/^demo/i.test(key)) {
      throw new Error(`Demo metadata key found in ${path.relative(process.cwd(), file)}`);
    }
    assertNoDemoKeys(child, file);
  }
}

function assertNoRemovedMetricNames(value, file) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (REMOVED_NAMES.has(key) || (typeof child === "string" && REMOVED_NAMES.has(child))) {
      throw new Error(`Removed metric name found in ${path.relative(process.cwd(), file)}`);
    }
    assertNoRemovedMetricNames(child, file);
  }
}

function publicPathToFile(root, publicPath) {
  if (!String(publicPath ?? "").startsWith("/data/pokemon/")) {
    throw new Error(`Unexpected public data path: ${publicPath}`);
  }
  return path.join(root, "public", publicPath.slice(1));
}

function jsonFileNames(dir) {
  return fs.readdirSync(dir).filter((name) => name.endsWith(".json"));
}

function assertArrayLength(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error(`${label} must list exactly ${length} items`);
  }
}

function assertExactKeys(value, expectedKeys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (!sameArray(actual, expected)) {
    throw new Error(`${label} keys must match metrics`);
  }
}

function sameArray(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameNullableNumber(left, right) {
  if (left === null && right === null) return true;
  return typeof left === "number" && typeof right === "number" && Math.abs(left - right) < Number.EPSILON;
}

function buildSizeReport(root) {
  const dataDir = path.join(root, "public", "data");
  return {
    totalBytes: sumFileBytes(dataDir),
    summaryBytes: fs.statSync(path.join(dataDir, "pokemon", "summary.json")).size,
    manifestBytes: fs.statSync(path.join(dataDir, "pokemon", "manifest.json")).size,
  };
}

function sumFileBytes(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) total += sumFileBytes(fullPath);
    if (entry.isFile()) total += fs.statSync(fullPath).size;
  }
  return total;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateGeneratedData();
}
