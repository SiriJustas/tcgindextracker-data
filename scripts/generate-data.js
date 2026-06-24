import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  INDEX_DEFINITIONS,
  PRODUCT_UNIVERSES,
  activeProductsByMetric,
  assertFreshPriceGuide,
  auditPokemonProducts,
  buildBaseProductsFromSnapshot,
  buildIndicatorFile,
  buildUniverseFile,
  createSnapshot,
  ensureBaseState,
  buildRebalanceScale,
  buildScaledPoint,
  indicatorMetricsForUniverse,
  joinPokemonProducts,
  normalizeScaleByMethodMetric,
  percentChange,
  shouldRebalanceUniverse,
  summarizeRebalance,
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
const tcg = "pokemon";
const tcgOutDir = path.join(outDir, tcg);
const indexesDir = path.join(tcgOutDir, "indexes");
const indicatorsDir = path.join(tcgOutDir, "indicators");

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
const nextUniverses = {};
const universeSnapshots = {};

await mkdir(indexesDir, { recursive: true });
await mkdir(indicatorsDir, { recursive: true });
await mkdir(path.dirname(statePath), { recursive: true });

const summary = {
  updatedAt: valuationDate,
  indexes: [],
  indicators: [],
};

const manifest = {
  updatedAt: valuationDate,
  version: Number(valuationDate.replaceAll("-", "")),
  indexes: INDEX_DEFINITIONS.map(({ id, name, file, description, metrics }) => ({ id, name, file, description, metrics })),
  universes: PRODUCT_UNIVERSES.map((universe) => ({
    id: universe.id,
    name: universe.name,
    tcg,
    metrics: universe.metrics,
    universeFile: universeFilePath(universe),
  })),
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

for (const universe of PRODUCT_UNIVERSES) {
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

  const rebalances = upsertRebalanceEvent(previousUniverseState.rebalances ?? [], rebalanceEvent);

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
  if (universe.id === "global-booster-boxes") {
    console.log("Included Booster Boxes / Displays / Bundles / Sleeved Booster Cases:");
    for (const name of audit.includedNames) {
      console.log(`- ${name}`);
    }
  }
}

for (const universe of PRODUCT_UNIVERSES) {
  const universeData = universeSnapshots[universe.id];
  const universeFile = buildUniverseFile({
    universe,
    updatedAt: valuationDate,
    baseDate: universeData.baseDate,
    rows: universeData.rows,
    baseProducts: universeData.baseProducts,
    productMeta: universeData.productMeta,
  });
  await writeCompactJson(path.join(indexesDir, `${universeFile.id}.json`), universeFile);
}

for (const definition of INDEX_DEFINITIONS) {
  const universe = PRODUCT_UNIVERSES.find((item) => item.id === definition.universeId);
  const metrics = universe.metrics;
  const universeData = universeSnapshots[definition.universeId];
  const indexPath = path.join(indexesDir, `${definition.id}.json`);
  const existing = await readOptionalJson(indexPath, null);
  const existingCompatible = arraysEqual(existing?.metrics, metrics) ? existing : null;
  const point = buildScaledPoint(
    definition.method,
    valuationDate,
    universeData.snapshot,
    universeData.baseProducts,
    universeData.scaleByMethodMetric[definition.method],
    metrics,
  );
  const points = upsertPoint(existingCompatible?.points ?? [], point);
  const diagnostics = {
    ...(existingCompatible?.diagnostics ?? {}),
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
    baseDate: existingCompatible?.baseDate ?? valuationDate,
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

for (const universe of PRODUCT_UNIVERSES) {
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
    change1d: Object.fromEntries(indicatorFile.metrics.map((metric, index) => [metric, percentChange(indicatorFile.points, index + 1, 1)])),
    change7d: Object.fromEntries(indicatorFile.metrics.map((metric, index) => [metric, percentChange(indicatorFile.points, index + 1, 7)])),
    change30d: Object.fromEntries(indicatorFile.metrics.map((metric, index) => [metric, percentChange(indicatorFile.points, index + 1, 30)])),
  });
}

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
