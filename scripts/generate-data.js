import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  INDEX_DEFINITIONS,
  PRODUCT_UNIVERSES,
  SINGLES_METRICS,
  TOP_SINGLES_LIMITS,
  activeProductsByMetric,
  assertFreshPriceGuide,
  auditPokemonProducts,
  buildBaseProductsFromSnapshot,
  buildFixedMetricRebalanceState,
  buildIndicatorFile,
  buildMetricBaseProductsFromSnapshot,
  buildUniverseFile,
  createFixedUniverseSnapshot,
  createSnapshot,
  ensureBaseState,
  buildRebalanceScale,
  buildScaledPoint,
  indicatorChange,
  indicatorMetricsForUniverse,
  joinPokemonProducts,
  normalizeScaleByMethodMetric,
  normalizePriceHistory,
  percentChange,
  shouldRebalanceUniverse,
  summarizeRebalance,
  buildTopSinglesUniverseFile,
  universeFilePath,
  upsertPoint,
} from "./index-engine.js";

const root = process.cwd();
const defaults = {
  products: path.join(root, "downloads", "pokemon", "products_singles.json"),
  nonSingles: path.join(root, "downloads", "pokemon", "products_nonsingles.json"),
  prices: path.join(root, "downloads", "pokemon", "price_guide.json"),
  outDir: path.join(root, "public", "data"),
  statePath: path.join(root, ".index-state", "state.json"),
};

const args = parseArgs(process.argv.slice(2));
const productsPath = args.products ?? defaults.products;
const nonSinglesPath = args.nonSingles ?? args["non-singles"] ?? defaults.nonSingles;
const pricesPath = args.prices ?? defaults.prices;
const outDir = args.outDir ? path.resolve(args.outDir) : defaults.outDir;
const statePath = args.statePath ? path.resolve(args.statePath) : defaults.statePath;
const allowStalePrices = Boolean(args["allow-stale-prices"]);
const setsOnly = Boolean(args["sets-only"]);
const tcg = "pokemon";
const tcgOutDir = path.join(outDir, tcg);
const indexesDir = path.join(tcgOutDir, "indexes");
const indicatorsDir = path.join(tcgOutDir, "indicators");
const universesDir = path.join(tcgOutDir, "universes");

const productsPayload = await readJson(productsPath);
const nonSinglesPayload = await readJson(nonSinglesPath);
const priceGuidePayload = await readJson(pricesPath);
const valuationDate = assertFreshPriceGuide(priceGuidePayload, { allowStale: allowStalePrices });
const previousState = await readOptionalJson(statePath, { products: {} });
const sourcePayloads = {
  singles: productsPayload,
  nonSingles: nonSinglesPayload,
};
const previousUniverses = normalizeUniverseState(previousState);
const nextUniverses = setsOnly ? { ...previousUniverses } : {};
const universeSnapshots = {};

await mkdir(indexesDir, { recursive: true });
await mkdir(indicatorsDir, { recursive: true });
await mkdir(universesDir, { recursive: true });
await mkdir(path.dirname(statePath), { recursive: true });

const existingSummary = setsOnly ? await readOptionalJson(path.join(tcgOutDir, "summary.json"), null) : null;
const existingManifest = setsOnly ? await readOptionalJson(path.join(tcgOutDir, "manifest.json"), null) : null;

const summary = existingSummary ?? {
  updatedAt: valuationDate,
  indexes: [],
  indicators: [],
};

const manifest = existingManifest ?? {
  updatedAt: valuationDate,
  version: Number(valuationDate.replaceAll("-", "")),
  indexes: INDEX_DEFINITIONS.map(({ id, name, file, description, metrics }) => ({ id, name, file, description, metrics })),
  universes: [],
  indicators: [
    ...PRODUCT_UNIVERSES.map((universe) => ({
      id: universe.id,
      name: `${universe.name} Market Indicators`,
      universe: universe.id,
      file: `/data/pokemon/indicators/${universe.id}.json`,
      metrics: indicatorMetricsForUniverse(universe),
    })),
  ],
};

const setUniverseFiles = await readSetUniverseFiles(universesDir);
for (const setUniverse of setUniverseFiles) {
  if (!arraysEqual(setUniverse.metrics, SINGLES_METRICS)) {
    await writeCompactJson(path.join(universesDir, `${setUniverse.slug}-singles-universe.json`), {
      ...setUniverse,
      metrics: SINGLES_METRICS,
    });
    setUniverse.metrics = SINGLES_METRICS;
  }
}
const customUniverseFiles = await writeCustomUniverseFiles({ universesDir, productsPayload, priceGuidePayload, previousUniverses, valuationDate });
const indexedUniverseFiles = [...setUniverseFiles, ...customUniverseFiles].sort(compareUniverseFiles);
const setIndexDefinitions = indexedUniverseFiles.flatMap((setUniverse) => buildSetIndexDefinitions(setUniverse));
const setIndicatorDefinitions = indexedUniverseFiles.map((setUniverse) => buildSetIndicatorDefinition(setUniverse));
const setIndexIds = new Set(setIndexDefinitions.map((definition) => definition.id));
const setIndicatorIds = new Set(setIndicatorDefinitions.map((definition) => definition.id));
manifest.indexes = (manifest.indexes ?? []).filter((index) => !setIndexIds.has(index.id));
manifest.indicators = (manifest.indicators ?? []).filter((indicator) => !setIndicatorIds.has(indicator.id));
summary.indexes = (summary.indexes ?? []).filter((index) => !setIndexIds.has(index.id));
summary.indicators = (summary.indicators ?? []).filter((indicator) => !setIndicatorIds.has(indicator.id));

if (!setsOnly) for (const universe of PRODUCT_UNIVERSES) {
  const metrics = universe.metrics;
  const audit = auditPokemonProducts(sourcePayloads[universe.source], universe);
  const rows = joinPokemonProducts(sourcePayloads[universe.source], priceGuidePayload, universe);
  const previousUniverseState = previousUniverses[universe.id] ?? { products: {} };
  const existingBaseProducts = buildBaseProductsFromSnapshot(previousUniverseState.baseProducts ?? {}, metrics);
  const oldSnapshotData = createSnapshot(rows, previousUniverseState, existingBaseProducts, metrics);
  const initialBaseProducts = ensureBaseState(previousUniverseState, oldSnapshotData.snapshot, metrics);
  const schemaCorrection = Object.keys(existingBaseProducts).length === 0 && Object.keys(previousUniverseState.baseProducts ?? {}).length > 0;
  const rebalance = shouldRebalanceUniverse(universe, { ...previousUniverseState, baseProducts: initialBaseProducts }, valuationDate);
  const previousScaleByMethodMetric = normalizeScaleByMethodMetric(schemaCorrection ? {} : previousUniverseState.scaleByMethodMetric, metrics);
  let baseProducts = initialBaseProducts;
  let baseDate = schemaCorrection ? valuationDate : previousUniverseState.baseDate ?? valuationDate;
  let scaleByMethodMetric = previousScaleByMethodMetric;
  let snapshotData = oldSnapshotData;
  let rebalanceEvent = null;

  if (rebalance) {
    const candidateSnapshotData = createSnapshot(rows, {}, null, metrics);
    const rebalancedBaseProducts = buildBaseProductsFromSnapshot(candidateSnapshotData.snapshot, metrics);
    const rebalancedScaleByMethodMetric = buildRebalanceScale(previousScaleByMethodMetric, oldSnapshotData.snapshot, initialBaseProducts, metrics);
    const finalSnapshotData = createSnapshot(
      rows,
      { products: candidateSnapshotData.state.products, productMeta: candidateSnapshotData.state.productMeta },
      rebalancedBaseProducts,
      metrics,
    );

    rebalanceEvent = {
      date: valuationDate,
      previousBaseDate: baseDate,
      newBaseDate: valuationDate,
      summary: summarizeRebalance(initialBaseProducts, rebalancedBaseProducts, rows.length, metrics),
    };
    baseProducts = rebalancedBaseProducts;
    baseDate = valuationDate;
    scaleByMethodMetric = rebalancedScaleByMethodMetric;
    snapshotData = finalSnapshotData;
  } else if (Object.keys(existingBaseProducts).length === 0 && Object.keys(baseProducts).length > 0) {
    snapshotData = createSnapshot(
      rows,
      { products: oldSnapshotData.state.products, productMeta: oldSnapshotData.state.productMeta },
      baseProducts,
      metrics,
    );
  }

  const { snapshot, state, quality } = snapshotData;

  for (const metric of metrics) {
    quality[metric].activeProducts = activeProductsByMetric(baseProducts, metrics)[metric];
  }

  const rebalances = upsertRebalanceEvent(sanitizeRebalances(previousUniverseState.rebalances ?? [], metrics), rebalanceEvent);

  nextUniverses[universe.id] = {
    products: state.products,
    productMeta: state.productMeta,
    baseProducts,
    metrics,
    baseDate,
    lastRebalancedAt: rebalance ? valuationDate : previousUniverseState.lastRebalancedAt,
    lastRebalanceMonth: rebalance ? valuationDate.slice(0, 7) : previousUniverseState.lastRebalanceMonth ?? baseDate.slice(0, 7),
    scaleByMethodMetric,
    rebalancePolicy: universe.rebalancePolicy,
    rebalances,
  };
  universeSnapshots[universe.id] = {
    rows,
    snapshot,
    baseProducts,
    baseDate,
    scaleByMethodMetric,
    rebalanceEvent,
    rebalances,
    quality,
    audit,
    productMeta: state.productMeta,
    sourceCreatedAt: sourcePayloads[universe.source].createdAt,
  };

  console.log(
    `${universe.name}: included ${audit.includedProducts}/${audit.candidateProducts} category products, rejected ${audit.rejectedProducts}, priced ${rows.length}`,
  );
}

if (!setsOnly) for (const universe of PRODUCT_UNIVERSES) {
  const universeData = universeSnapshots[universe.id];
  const universeFile = buildUniverseFile({
    universe,
    updatedAt: valuationDate,
    baseDate: universeData.baseDate,
    rows: universeData.rows,
    baseProducts: universeData.baseProducts,
    productMeta: universeData.productMeta,
  });
  await writeCompactJson(path.join(universesDir, `${universeFile.id}.json`), universeFile);
}

if (!setsOnly) for (const definition of INDEX_DEFINITIONS) {
  const universe = PRODUCT_UNIVERSES.find((item) => item.id === definition.universeId);
  const metrics = universe.metrics;
  const universeData = universeSnapshots[definition.universeId];
  const indexPath = path.join(indexesDir, `${definition.id}.json`);
  const existing = await readOptionalJson(indexPath, null);
  const existingCompatible = normalizePriceHistory(existing, metrics);
  const point = buildScaledPoint(
    definition.method,
    valuationDate,
    universeData.snapshot,
    universeData.baseProducts,
    universeData.scaleByMethodMetric[definition.method],
    metrics,
  );
  const points = upsertPoint(existingCompatible.points, point);
  const diagnostics = {
    ...existingCompatible.diagnostics,
    [valuationDate]: {
      sourceCreatedAt: {
        products: universeData.sourceCreatedAt,
        prices: priceGuidePayload.createdAt,
      },
      quality: universeData.quality,
      audit: {
        candidateProducts: universeData.audit.candidateProducts,
        includedProducts: universeData.audit.includedProducts,
        rejectedProducts: universeData.audit.rejectedProducts,
        rejectedSample: universeData.audit.rejectedSample,
      },
      rebalance: Boolean(universeData.rebalanceEvent),
      rebalanceDetails: universeData.rebalanceEvent,
    },
  };

  const output = {
    id: definition.id,
    name: definition.name,
    currency: "EUR",
    baseDate: existingCompatible.baseDate ?? valuationDate,
    baseValue: 100,
    updatedAt: valuationDate,
    metrics,
    composition: {
      universe: definition.universeId,
      universePolicy: universe.rebalancePolicy,
      method: definition.method,
      currentBaseDate: universeData.baseDate,
      lastRebalancedAt: nextUniverses[definition.universeId].lastRebalancedAt ?? null,
      rebalanceCount: universeData.rebalances.length,
      matchedProducts: Object.keys(universeData.baseProducts).length,
      candidateProducts: universeData.audit.candidateProducts,
      includedProducts: universeData.audit.includedProducts,
      rejectedProducts: universeData.audit.rejectedProducts,
      activeProductsByMetric: activeProductsByMetric(universeData.baseProducts, metrics),
      unavailableActiveProductsByMetric: Object.fromEntries(metrics.map((metric) => [metric, universeData.quality[metric].unavailable])),
    },
    diagnostics,
    points,
  };

  await writeCompactJson(indexPath, output);

  const latest = points.at(-1);
  summary.indexes.push({
    id: definition.id,
    name: definition.name,
    file: definition.file,
    metrics,
    latest: Object.fromEntries(metrics.map((metric, index) => [metric, latest?.[index + 1] ?? null])),
    change1d: Object.fromEntries(metrics.map((metric, index) => [metric, percentChange(points, index + 1, 1)])),
    change7d: Object.fromEntries(metrics.map((metric, index) => [metric, percentChange(points, index + 1, 7)])),
    change30d: Object.fromEntries(metrics.map((metric, index) => [metric, percentChange(points, index + 1, 30)])),
    quality: universeData.quality,
  });
}

if (!setsOnly) for (const universe of PRODUCT_UNIVERSES) {
  const universeData = universeSnapshots[universe.id];
  const indicatorPath = path.join(indicatorsDir, `${universe.id}.json`);
  const existingIndicator = await readOptionalJson(indicatorPath, null);
  const indicatorFile = buildIndicatorFile({
    universe,
    updatedAt: valuationDate,
    baseDate: universeData.baseDate,
    snapshot: universeData.snapshot,
    baseProducts: universeData.baseProducts,
    existing: existingIndicator,
    rebalanceEvent: universeData.rebalanceEvent,
    rebalances: universeData.rebalances,
  });
  await writeCompactJson(indicatorPath, indicatorFile);

  const latestIndicator = indicatorFile.points.at(-1);
  summary.indicators.push({
    id: indicatorFile.id,
    name: indicatorFile.name,
    universe: indicatorFile.universe,
    file: `/data/pokemon/indicators/${universe.id}.json`,
    metrics: indicatorFile.metrics,
    latest: Object.fromEntries(indicatorFile.metrics.map((metric, index) => [metric, latestIndicator?.[index + 1] ?? null])),
    change1d: Object.fromEntries(indicatorFile.metrics.map((metric, index) => [metric, indicatorChange(indicatorFile.points, metric, index + 1, 1)])),
    change7d: Object.fromEntries(indicatorFile.metrics.map((metric, index) => [metric, indicatorChange(indicatorFile.points, metric, index + 1, 7)])),
    change30d: Object.fromEntries(indicatorFile.metrics.map((metric, index) => [metric, indicatorChange(indicatorFile.points, metric, index + 1, 30)])),
  });
}

for (const setUniverse of indexedUniverseFiles) {
  const universe = setUniverseToProductUniverse(setUniverse);
  const rows = fixedSetRows(setUniverse, priceGuidePayload);
  const previousUniverseState = previousUniverses[universe.id] ?? { products: {}, productMeta: {}, baseProducts: {} };
  const previousBaseProducts = previousUniverseState.baseProducts ?? {};
  const snapshotData = createFixedUniverseSnapshot(rows, previousUniverseState, previousBaseProducts, SINGLES_METRICS);
  const productMeta = snapshotData.state.productMeta;
  const previousScaleByMethodMetric = normalizeScaleByMethodMetric(previousUniverseState.scaleByMethodMetric, SINGLES_METRICS);
  const initialState =
    hasAnyMetricBaseProducts(previousBaseProducts, SINGLES_METRICS)
      ? buildFixedMetricRebalanceState({
          snapshot: snapshotData.snapshot,
          previousBaseProducts,
          previousScaleByMethodMetric,
          metrics: SINGLES_METRICS,
          valuationDate,
          productMeta,
        })
      : {
          baseProducts: buildMetricBaseProductsFromSnapshot(snapshotData.snapshot, SINGLES_METRICS),
          scaleByMethodMetric: previousScaleByMethodMetric,
          metricRebalances: {},
        };
  const baseProducts = initialState.baseProducts;
  const scaleByMethodMetric = initialState.scaleByMethodMetric;
  const metricRebalances = initialState.metricRebalances;
  const activeByMetric = activeProductsByMetric(baseProducts, SINGLES_METRICS);
  for (const metric of SINGLES_METRICS) {
    snapshotData.quality[metric].activeProducts = activeByMetric[metric];
  }
  const baseDate = previousUniverseState.baseDate ?? valuationDate;
  const rebalances = upsertMetricRebalances(sanitizeRebalances(previousUniverseState.rebalances ?? [], SINGLES_METRICS), valuationDate, metricRebalances);

  nextUniverses[universe.id] = {
    products: snapshotData.state.products,
    productMeta,
    baseProducts,
    metrics: SINGLES_METRICS,
    baseDate,
    lastRebalancedAt: Object.keys(metricRebalances).length > 0 ? valuationDate : previousUniverseState.lastRebalancedAt,
    scaleByMethodMetric,
    rebalancePolicy: universe.rebalancePolicy,
    rebalances,
  };

  for (const definition of buildSetIndexDefinitions(setUniverse)) {
    const indexPath = path.join(indexesDir, `${definition.id}.json`);
    const existing = await readOptionalJson(indexPath, null);
    const existingCompatible = normalizePriceHistory(existing, SINGLES_METRICS);
    const point = buildScaledPoint(
      definition.method,
      valuationDate,
      snapshotData.snapshot,
      baseProducts,
      scaleByMethodMetric[definition.method],
      SINGLES_METRICS,
    );
    const points = upsertPoint(existingCompatible.points, point);
    const diagnostics = {
      ...existingCompatible.diagnostics,
      [valuationDate]: {
        sourceCreatedAt: {
          products: setUniverse.source?.productsCreatedAt ?? null,
          prices: priceGuidePayload.createdAt,
        },
        quality: snapshotData.quality,
        rebalance: Object.keys(metricRebalances).length > 0,
        metricRebalances,
      },
    };
    const output = {
      id: definition.id,
      name: definition.name,
      currency: "EUR",
      baseDate: existingCompatible.baseDate ?? valuationDate,
      baseValue: 100,
      updatedAt: valuationDate,
      metrics: SINGLES_METRICS,
      composition: {
        universe: universe.id,
        universePolicy: universe.rebalancePolicy,
        universeFile: universe.universeFile,
        method: definition.method,
        currentBaseDate: baseDate,
        matchedProducts: setUniverse.count,
        activeProductsByMetric: activeByMetric,
        missingProductsByMetric: Object.fromEntries(SINGLES_METRICS.map((metric) => [metric, Math.max(setUniverse.count - activeByMetric[metric], 0)])),
      },
      diagnostics,
      points,
    };
    await writeCompactJson(indexPath, output);

    const latest = points.at(-1);
    summary.indexes.push({
      id: definition.id,
      name: definition.name,
      file: definition.file,
      metrics: SINGLES_METRICS,
      latest: Object.fromEntries(SINGLES_METRICS.map((metric, index) => [metric, latest?.[index + 1] ?? null])),
      change1d: Object.fromEntries(SINGLES_METRICS.map((metric, index) => [metric, percentChange(points, index + 1, 1)])),
      change7d: Object.fromEntries(SINGLES_METRICS.map((metric, index) => [metric, percentChange(points, index + 1, 7)])),
      change30d: Object.fromEntries(SINGLES_METRICS.map((metric, index) => [metric, percentChange(points, index + 1, 30)])),
      quality: snapshotData.quality,
    });
  }

  const indicatorPath = path.join(indicatorsDir, `${universe.id}.json`);
  const existingIndicator = await readOptionalJson(indicatorPath, null);
  const indicatorFile = buildIndicatorFile({
    universe,
    updatedAt: valuationDate,
    baseDate,
    snapshot: snapshotData.snapshot,
    baseProducts,
    existing: existingIndicator,
    rebalanceEvent: Object.keys(metricRebalances).length > 0 ? { date: valuationDate, metrics: metricRebalances } : null,
    rebalances,
  });
  await writeCompactJson(indicatorPath, indicatorFile);
  const latestIndicator = indicatorFile.points.at(-1);
  summary.indicators.push({
    id: indicatorFile.id,
    name: indicatorFile.name,
    universe: indicatorFile.universe,
    file: `/data/pokemon/indicators/${universe.id}.json`,
    metrics: indicatorFile.metrics,
    latest: Object.fromEntries(indicatorFile.metrics.map((metric, index) => [metric, latestIndicator?.[index + 1] ?? null])),
    change1d: Object.fromEntries(indicatorFile.metrics.map((metric, index) => [metric, indicatorChange(indicatorFile.points, metric, index + 1, 1)])),
    change7d: Object.fromEntries(indicatorFile.metrics.map((metric, index) => [metric, indicatorChange(indicatorFile.points, metric, index + 1, 7)])),
    change30d: Object.fromEntries(indicatorFile.metrics.map((metric, index) => [metric, indicatorChange(indicatorFile.points, metric, index + 1, 30)])),
  });
}

manifest.indexes.push(...setIndexDefinitions.map(({ id, name, file, description, metrics }) => ({ id, name, file, description, metrics })));
manifest.indicators.push(...setIndicatorDefinitions);
manifest.universes = buildManifestUniverses({
  existingManifest,
  setUniverseFiles: indexedUniverseFiles,
  universeSnapshots,
  setsOnly,
  tcg,
});

await writeCompactJson(path.join(tcgOutDir, "manifest.json"), manifest);
await writeCompactJson(path.join(tcgOutDir, "summary.json"), summary);
await writeCompactJson(statePath, { tcgs: { [tcg]: { universes: nextUniverses } } });

console.log(`Generated ${summary.indexes.length} indexes for ${valuationDate}`);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        parsed[arg.slice(2)] = true;
      } else {
        parsed[arg.slice(2)] = next;
        index += 1;
      }
    }
  }
  return parsed;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readOptionalJson(filePath, fallback) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeCompactJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function normalizeUniverseState(state) {
  if (state?.tcgs?.pokemon?.universes) return migrateUniverseKeys(state.tcgs.pokemon.universes);
  if (state?.universes) return migrateUniverseKeys(state.universes);
  return migrateUniverseKeys({
    "pokemon-singles": {
      products: state?.products ?? {},
      baseProducts: state?.baseProducts ?? {},
    },
  });
}

function migrateUniverseKeys(universes) {
  const keyMap = {
    "pokemon-singles": "global-singles",
    "pokemon-booster-boxes": "global-booster-boxes",
    "pokemon-booster-packs": "global-booster-packs",
    "booster-boxes": "global-booster-boxes",
    "booster-packs": "global-booster-packs",
  };
  return Object.fromEntries(Object.entries(universes ?? {}).map(([key, value]) => [keyMap[key] ?? key, value]));
}

function upsertRebalanceEvent(events, event) {
  if (!event) return events;
  return [...events.filter((existing) => existing.date !== event.date), event].sort((left, right) => left.date.localeCompare(right.date));
}

function arraysEqual(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
}

async function readSetUniverseFiles(universesDir) {
  let files = [];
  try {
    files = await readdir(universesDir);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const sets = [];
  for (const fileName of files.filter((file) => file.endsWith(".json")).sort()) {
    const universe = await readJson(path.join(universesDir, fileName));
    if (universe.kind === "set-singles-universe") {
      sets.push(universe);
    }
  }
  return sets.sort((left, right) => {
    const byName = String(left.name ?? "").localeCompare(String(right.name ?? ""));
    return byName || String(left.slug ?? left.id).localeCompare(String(right.slug ?? right.id));
  });
}

function setUniverseToProductUniverse(setUniverse) {
  if (setUniverse.kind === "custom-singles-universe") {
    return {
      id: setUniverse.slug,
      name: setUniverse.name,
      metrics: SINGLES_METRICS,
      rebalancePolicy: isTopSinglesSlug(setUniverse.slug) ? "monthly-chain-linked" : "fixed-curated",
      universeFile: `/data/pokemon/universes/${setUniverse.id}.json`,
    };
  }

  return {
    id: `${setUniverse.slug}-singles`,
    name: `${setUniverse.name} Singles`,
    metrics: SINGLES_METRICS,
    rebalancePolicy: "fixed-curated",
    universeFile: `/data/pokemon/universes/${setUniverse.slug}-singles-universe.json`,
  };
}

function buildManifestUniverses({ existingManifest, setUniverseFiles, universeSnapshots, setsOnly, tcg }) {
  const existingById = new Map((existingManifest?.universes ?? []).map((universe) => [universe.id, universe]));
  const globalUniverses = PRODUCT_UNIVERSES.map((universe) => {
    const generatedCount = universeSnapshots[universe.id]?.baseProducts ? Object.keys(universeSnapshots[universe.id].baseProducts).length : null;
    const existing = existingById.get(universe.id);
    return {
      id: universe.id,
      name: universe.name,
      tcg,
      kind: "product-universe",
      metrics: universe.metrics,
      universeFile: universeFilePath(universe),
      count: setsOnly ? existing?.count ?? generatedCount : generatedCount ?? existing?.count ?? null,
    };
  });
  const setUniverses = setUniverseFiles.map((setUniverse) => {
    const universe = setUniverseToProductUniverse(setUniverse);
    return {
      id: universe.id,
      name: universe.name,
      tcg,
      kind: setUniverse.kind,
      metrics: SINGLES_METRICS,
      universeFile: universe.universeFile,
      count: setUniverse.count,
      curationStatus: setUniverse.curationStatus ?? setUniverse.curation?.status ?? null,
    };
  });
  return [...globalUniverses, ...setUniverses];
}

function buildSetIndexDefinitions(setUniverse) {
  const universe = setUniverseToProductUniverse(setUniverse);
  return [
    {
      id: `${universe.id}-equal`,
      name: `${universe.name} Equal Weight`,
      method: "equal",
      universeId: universe.id,
      metrics: SINGLES_METRICS,
      file: `/data/pokemon/indexes/${universe.id}-equal.json`,
      description: `Each priced ${setUniverse.name} single contributes equally to percent movement.`,
    },
    {
      id: `${universe.id}-market`,
      name: `${universe.name} Market Weight`,
      method: "market",
      universeId: universe.id,
      metrics: SINGLES_METRICS,
      file: `/data/pokemon/indexes/${universe.id}-market.json`,
      description: `Tracks total value movement across priced ${setUniverse.name} singles.`,
    },
  ];
}

function buildSetIndicatorDefinition(setUniverse) {
  const universe = setUniverseToProductUniverse(setUniverse);
  return {
    id: universe.id,
    name: `${universe.name} Market Indicators`,
    universe: universe.id,
    file: `/data/pokemon/indicators/${universe.id}.json`,
    metrics: indicatorMetricsForUniverse(universe),
  };
}

function fixedSetRows(setUniverse, priceGuidePayload) {
  const priceGuides = Array.isArray(priceGuidePayload?.priceGuides) ? priceGuidePayload.priceGuides : [];
  const pricesByProduct = new Map(priceGuides.map((price) => [String(price.idProduct), price]));
  return Object.entries(setUniverse.entries ?? {}).map(([idProduct, name]) => ({
    product: {
      idProduct: Number(idProduct),
      name,
      categoryName: "Pokemon Single",
    },
    price: pricesByProduct.get(idProduct),
  }));
}

async function writeCustomUniverseFiles({ universesDir, productsPayload, priceGuidePayload, previousUniverses, valuationDate }) {
  const topUniverses = [];
  for (const limit of TOP_SINGLES_LIMITS) {
    const universeId = `top-${limit}-singles`;
    const previousTopUniverse = await readOptionalJson(path.join(universesDir, `${universeId}-universe.json`), null);
    const topUniverse = buildTopSinglesUniverseFile({
      limit,
      productsPayload,
      priceGuidePayload,
      updatedAt: valuationDate,
      previousUniverseFile: previousTopUniverse,
      shouldRebuild: shouldRebalanceCustomUniverse(universeId, previousUniverses[universeId], valuationDate) || !previousTopUniverse,
    });
    await writeCompactJson(path.join(universesDir, `${topUniverse.id}.json`), topUniverse);
    topUniverses.push(topUniverse);
  }

  return topUniverses.sort(compareUniverseFiles);
}

function shouldRebalanceCustomUniverse(universeId, previousUniverseState, valuationDate) {
  if (!previousUniverseState) return true;
  return shouldRebalanceUniverse(
    {
      id: universeId,
      metrics: SINGLES_METRICS,
      rebalancePolicy: "monthly-chain-linked",
    },
    previousUniverseState,
    valuationDate,
  );
}

function isTopSinglesSlug(slug) {
  return /^top-\d+-singles$/.test(String(slug ?? ""));
}

function compareUniverseFiles(left, right) {
  const byName = String(left.name ?? "").localeCompare(String(right.name ?? ""));
  return byName || String(left.slug ?? left.id).localeCompare(String(right.slug ?? right.id));
}

function hasAnyMetricBaseProducts(baseProducts, metrics) {
  return Object.values(baseProducts ?? {}).some((prices) => metrics.some((metric) => typeof prices?.[metric] === "number"));
}

function upsertMetricRebalances(events, date, metricRebalances) {
  const metrics = Object.keys(metricRebalances);
  if (metrics.length === 0) return events;
  return [
    ...events.filter((event) => event.date !== date),
    {
      date,
      metrics: metricRebalances,
    },
  ].sort((left, right) => left.date.localeCompare(right.date));
}

function sanitizeRebalances(events, metrics) {
  const allowed = new Set(metrics);
  return (events ?? []).map((event) => {
    const next = { ...event };
    if (event?.summary && typeof event.summary === "object") {
      next.summary = Object.fromEntries(Object.entries(event.summary).filter(([metric]) => allowed.has(metric)));
    }
    if (event?.metrics && typeof event.metrics === "object") {
      next.metrics = Object.fromEntries(Object.entries(event.metrics).filter(([metric]) => allowed.has(metric)));
    }
    return next;
  });
}
