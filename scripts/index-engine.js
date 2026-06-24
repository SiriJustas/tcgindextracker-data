export const SINGLES_METRICS = ["avg1", "avg7", "avg30", "avg", "low", "trend"];
export const SEALED_METRICS = ["avg", "low", "trend"];
export const WINDOW_INDICATOR_METRICS = ["advanceDecline", "percentAbove30d", "heat", "dispersion"];
export const TREND_INDICATOR_METRICS = ["advanceDeclineTrend", "percentAboveTrend", "trendHeat", "floorStrength", "spread", "trendDispersion"];

export const PRODUCT_UNIVERSES = [
  {
    id: "global-singles",
    name: "Global Singles",
    categoryId: 51,
    source: "singles",
    metrics: SINGLES_METRICS,
    description: "Pokemon single cards.",
    itemLabel: "Pokemon single card",
    matcher: "singles",
    universeSlug: "global-singles",
    rebalancePolicy: "monthly-chain-linked",
  },
  {
    id: "global-booster-boxes",
    name: "Global Booster Boxes",
    categoryId: 53,
    source: "nonSingles",
    metrics: SEALED_METRICS,
    description: "Pokemon booster boxes and displays.",
    itemLabel: "Pokemon booster box/display",
    matcher: "boosterBoxes",
    universeSlug: "global-booster-boxes",
    rebalancePolicy: "monthly-chain-linked",
  },
  {
    id: "global-booster-packs",
    name: "Global Booster Packs",
    categoryId: 52,
    source: "nonSingles",
    metrics: SEALED_METRICS,
    description: "Pokemon individual booster packs.",
    itemLabel: "Pokemon booster pack",
    matcher: "boosterPacks",
    universeSlug: "global-booster-packs",
    rebalancePolicy: "monthly-chain-linked",
  },
];

export const INDEX_METHODS = [
  {
    suffix: "equal",
    label: "Equal Weight",
    method: "equal",
    description: (universe) => `Each eligible ${universe.itemLabel} contributes equally to percent movement.`,
  },
  {
    suffix: "market",
    label: "Market Weight",
    method: "market",
    description: (universe) => `Tracks total value movement across eligible ${universe.description.replace(/\.$/, "")}.`,
  },
];

export const INDEX_DEFINITIONS = PRODUCT_UNIVERSES.flatMap((universe) =>
  INDEX_METHODS.map((indexMethod) => ({
    id: `${universe.id}-${indexMethod.suffix}`,
    name: `${universe.name} ${indexMethod.label}`,
    method: indexMethod.method,
    universeId: universe.id,
    metrics: universe.metrics,
    file: `/data/pokemon/indexes/${universe.id}-${indexMethod.suffix}.json`,
    description: indexMethod.description(universe),
  })),
);

export function universeFilePath(universe) {
  return `/data/pokemon/indexes/${universe.universeSlug}-universe.json`;
}

export function buildUniverseFile({ universe, updatedAt, baseDate, rows, baseProducts, productMeta = {} }) {
  const metrics = universe.metrics;
  const productsById = new Map(rows.map((row) => [String(row.product.idProduct), row.product]));
  const sortedProducts = Object.entries(baseProducts)
    .filter(([, prices]) => hasAllMetricPrices(prices, metrics))
    .map(([id]) => {
      const product = productsById.get(id);
      return {
        id,
        idProduct: Number(id),
        name: product?.name ?? productMeta[id]?.name ?? "",
      };
    })
    .sort((left, right) => {
      const byName = left.name.localeCompare(right.name);
      return byName || left.idProduct - right.idProduct;
    });
  const entries = Object.fromEntries(sortedProducts.map((product) => [product.id, product.name]));

  return {
    id: `${universe.universeSlug}-universe`,
    tcg: "pokemon",
    universe: universe.id,
    metrics,
    updatedAt,
    baseDate,
    count: sortedProducts.length,
    entries,
  };
}

export function parseValuationDate(createdAt) {
  const match = String(createdAt ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) {
    throw new Error(`Unable to parse valuation date from createdAt: ${createdAt}`);
  }
  return match[1];
}

export function currentDateInTimeZone(now = new Date(), timeZone = "Europe/Berlin") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function assertFreshPriceGuide(priceGuidePayload, options = {}) {
  const valuationDate = parseValuationDate(priceGuidePayload?.createdAt);
  const today = currentDateInTimeZone(options.now ?? new Date(), options.timeZone ?? "Europe/Berlin");
  if (!options.allowStale && valuationDate !== today) {
    throw new Error(`Price guide date ${valuationDate} does not match current date ${today}`);
  }
  return valuationDate;
}

export function readPrice(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function joinPokemonSingles(productsPayload, priceGuidePayload) {
  return joinPokemonProducts(productsPayload, priceGuidePayload, PRODUCT_UNIVERSES[0]);
}

export function joinPokemonProducts(productsPayload, priceGuidePayload, universeOrCategoryId) {
  const universe = typeof universeOrCategoryId === "number" ? { categoryId: universeOrCategoryId } : universeOrCategoryId;
  const products = Array.isArray(productsPayload?.products) ? productsPayload.products : [];
  const priceGuides = Array.isArray(priceGuidePayload?.priceGuides) ? priceGuidePayload.priceGuides : [];
  const pricesByProduct = new Map(priceGuides.map((price) => [price.idProduct, price]));

  return products
    .filter((product) => productMatchesUniverse(product, universe))
    .map((product) => ({
      product,
      price: pricesByProduct.get(product.idProduct),
    }))
    .filter((row) => row.price);
}

export function auditPokemonProducts(productsPayload, universe) {
  const products = Array.isArray(productsPayload?.products) ? productsPayload.products : [];
  const candidates = products.filter((product) => product?.idCategory === universe.categoryId);
  const included = candidates.filter((product) => productMatchesUniverse(product, universe));
  const rejected = candidates.filter((product) => !productMatchesUniverse(product, universe));

  return {
    candidateProducts: candidates.length,
    includedProducts: included.length,
    rejectedProducts: rejected.length,
    includedNames: included.map((product) => product.name).sort((a, b) => a.localeCompare(b)),
    rejectedSample: rejected.slice(0, 12).map((product) => ({
      idProduct: product.idProduct,
      name: product.name,
      categoryName: product.categoryName,
    })),
  };
}

export function productMatchesUniverse(product, universe) {
  if (!product || product.idCategory !== universe.categoryId) return false;
  if (universe.matcher === "singles") return true;
  if (universe.matcher === "boosterPacks") return isBoosterPack(product);
  if (universe.matcher === "boosterBoxes") return isBoosterBoxDisplay(product);
  return true;
}

export function isBoosterPack(product) {
  if (!categoryNameIncludes(product, "Booster")) return false;
  const name = normalizedProductName(product.name);
  return /\bbooster\b/.test(name) && !/\b(box|case|display|bundle)\b/.test(name);
}

export function isBoosterBoxDisplay(product) {
  if (!categoryNameIncludes(product, "Display")) return false;
  const name = normalizedProductName(product.name);
  return /\bbooster box\b/.test(name) || /\bdisplay\b/.test(name) || /\bbooster bundle\b/.test(name) || /\bsleeved booster case\b/.test(name);
}

function categoryNameIncludes(product, expected) {
  return String(product.categoryName ?? "").toLowerCase().includes(expected.toLowerCase());
}

function normalizedProductName(name) {
  return String(name ?? "").toLowerCase();
}

export function createSnapshot(rows, previousState = {}, baseProducts = null, metrics = SINGLES_METRICS) {
  const productState = previousState.products ?? {};
  const productMeta = previousState.productMeta ?? {};
  const snapshot = {};
  const hasActiveBase = baseProducts && Object.keys(baseProducts).length > 0;
  const rowsById = new Map(rows.map((row) => [String(row.product.idProduct), row]));
  const nextProducts = hasActiveBase ? {} : { ...productState };
  const nextProductMeta = hasActiveBase ? {} : { ...productMeta };
  const idsToProcess = hasActiveBase ? Object.keys(baseProducts) : rows.map((row) => String(row.product.idProduct));
  const quality = Object.fromEntries(
    metrics.map((metric) => [
      metric,
      {
        matchedProducts: idsToProcess.length,
        pricedProducts: 0,
        missing: 0,
        carried: 0,
        activeProducts: 0,
        unavailable: 0,
      },
    ]),
  );

  if (hasActiveBase) {
    for (const metric of metrics) {
      quality[metric].activeProducts = Object.values(baseProducts).filter((prices) => readPrice(prices?.[metric]) !== null).length;
    }
  }

  for (const id of idsToProcess) {
    const row = rowsById.get(id);
    const product = row?.product ?? productMeta[id] ?? { idProduct: Number(id) };
    const price = row?.price;
    snapshot[id] = {};
    nextProducts[id] = { ...(nextProducts[id] ?? {}) };
    nextProductMeta[id] = compactProductMeta(product);

    for (const metric of metrics) {
      if (!row) {
        quality[metric].unavailable += 1;
        carryForwardProductMetric({ snapshot, nextProducts, productState, id, metric, quality });
        continue;
      }

      const freshValue = readPrice(price[metric]);
      if (freshValue !== null) {
        snapshot[id][metric] = freshValue;
        nextProducts[id][metric] = freshValue;
        quality[metric].pricedProducts += 1;
        continue;
      }

      quality[metric].missing += 1;
      carryForwardProductMetric({ snapshot, nextProducts, productState, id, metric, quality });
    }
  }

  return { snapshot, state: { products: nextProducts, productMeta: nextProductMeta }, quality };
}

function carryForwardProductMetric({ snapshot, nextProducts, productState, id, metric, quality }) {
  const carriedValue = readPrice(productState[id]?.[metric]);
  if (carriedValue !== null) {
    snapshot[id][metric] = carriedValue;
    nextProducts[id][metric] = carriedValue;
    quality[metric].carried += 1;
  }
}

function compactProductMeta(product) {
  return {
    idProduct: product.idProduct,
    name: product.name ?? "",
    categoryName: product.categoryName,
  };
}

export function ensureBaseState(existingIndex, snapshot, metrics = SINGLES_METRICS) {
  const currentBase = existingIndex?.baseProducts ?? {};
  const completeCurrentBase = filterCompleteBaseProducts(currentBase, metrics);
  if (hasAnyBasePrice(completeCurrentBase, metrics)) {
    return completeCurrentBase;
  }

  return buildBaseProductsFromSnapshot(snapshot, metrics);
}

export function hasAnyBasePrice(baseProducts, metrics = SINGLES_METRICS) {
  return Object.values(baseProducts).some((prices) => metrics.some((metric) => readPrice(prices?.[metric]) !== null));
}

export function hasAllMetricPrices(prices, metrics = SINGLES_METRICS) {
  return metrics.every((metric) => readPrice(prices?.[metric]) !== null);
}

function filterCompleteBaseProducts(baseProducts, metrics = SINGLES_METRICS) {
  return Object.fromEntries(Object.entries(baseProducts ?? {}).filter(([, prices]) => hasAllMetricPrices(prices, metrics)));
}

export function activeProductsByMetric(baseProducts, metrics = SINGLES_METRICS) {
  return Object.fromEntries(
    metrics.map((metric) => [metric, Object.values(baseProducts).filter((prices) => readPrice(prices?.[metric]) !== null).length]),
  );
}

export function buildBaseProductsFromSnapshot(snapshot, metrics = SINGLES_METRICS) {
  const baseProducts = {};
  for (const [id, prices] of Object.entries(snapshot)) {
    if (!hasAllMetricPrices(prices, metrics)) {
      continue;
    }
    const metricPrices = {};
    for (const metric of metrics) {
      metricPrices[metric] = readPrice(prices[metric]);
    }
    baseProducts[id] = metricPrices;
  }
  return baseProducts;
}

export function shouldRebalanceUniverse(universe, state = {}, valuationDate) {
  if (universe.rebalancePolicy !== "monthly-chain-linked") return false;
  if (!hasAnyBasePrice(state.baseProducts ?? {}, universe.metrics)) return false;
  if (state.lastRebalancedAt === valuationDate) return false;

  const valuationMonth = monthKey(valuationDate);
  const activeMonth = state.lastRebalanceMonth ?? monthKey(state.baseDate);
  return Boolean(valuationMonth && activeMonth && valuationMonth !== activeMonth);
}

export function monthKey(date) {
  const match = String(date ?? "").match(/^(\d{4}-\d{2})/);
  return match?.[1] ?? null;
}

export function defaultScaleByMethodMetric(metrics = SINGLES_METRICS) {
  return Object.fromEntries(INDEX_METHODS.map(({ method }) => [method, Object.fromEntries(metrics.map((metric) => [metric, 100]))]));
}

export function normalizeScaleByMethodMetric(scaleByMethodMetric = {}, metrics = SINGLES_METRICS) {
  const defaults = defaultScaleByMethodMetric(metrics);
  return Object.fromEntries(
    Object.entries(defaults).map(([method, metrics]) => [
      method,
      Object.fromEntries(Object.keys(metrics).map((metric) => [metric, readPrice(scaleByMethodMetric?.[method]?.[metric]) ?? metrics[metric]])),
    ]),
  );
}

export function calculateMetricValue(method, snapshot, baseProducts, metric) {
  let count = 0;
  let relativesTotal = 0;
  let currentTotal = 0;
  let baseTotal = 0;

  for (const [id, prices] of Object.entries(snapshot)) {
    const current = readPrice(prices[metric]);
    const base = readPrice(baseProducts[id]?.[metric]);
    if (current === null || base === null) {
      continue;
    }

    count += 1;
    relativesTotal += current / base;
    currentTotal += current;
    baseTotal += base;
  }

  if (count === 0 || baseTotal === 0) {
    return null;
  }

  const value = method === "equal" ? (relativesTotal / count) * 100 : (currentTotal / baseTotal) * 100;
  return roundIndex(value);
}

export function calculateScaledMetricValue(method, snapshot, baseProducts, metric, scale = 100) {
  const raw = calculateMetricValue(method, snapshot, baseProducts, metric);
  return raw === null ? null : roundIndex((raw * scale) / 100);
}

export function buildPoint(method, date, snapshot, baseProducts, metrics = SINGLES_METRICS) {
  return [
    date,
    ...metrics.map((metric) => calculateMetricValue(method, snapshot, baseProducts, metric)),
  ];
}

export function buildScaledPoint(method, date, snapshot, baseProducts, scaleByMetric = {}, metrics = SINGLES_METRICS) {
  return [
    date,
    ...metrics.map((metric) => calculateScaledMetricValue(method, snapshot, baseProducts, metric, readPrice(scaleByMetric[metric]) ?? 100)),
  ];
}

export function buildRebalanceScale(previousScaleByMethodMetric, oldSnapshot, oldBaseProducts, metrics = SINGLES_METRICS) {
  const previousScale = normalizeScaleByMethodMetric(previousScaleByMethodMetric, metrics);
  return Object.fromEntries(
    INDEX_METHODS.map(({ method }) => [
      method,
      Object.fromEntries(
        metrics.map((metric) => [
          metric,
          calculateScaledMetricValue(method, oldSnapshot, oldBaseProducts, metric, previousScale[method][metric]) ?? previousScale[method][metric],
        ]),
      ),
    ]),
  );
}

export function summarizeRebalance(previousBaseProducts, nextBaseProducts, rowsLength, metrics = SINGLES_METRICS) {
  return Object.fromEntries(
    metrics.map((metric) => {
      const previousIds = metricEligibleIds(previousBaseProducts, metric, metrics);
      const nextIds = metricEligibleIds(nextBaseProducts, metric, metrics);
      return [
        metric,
        {
          previous: previousIds.size,
          next: nextIds.size,
          added: [...nextIds].filter((id) => !previousIds.has(id)).length,
          removed: [...previousIds].filter((id) => !nextIds.has(id)).length,
          excludedMissingAtRebalance: Math.max(rowsLength - nextIds.size, 0),
        },
      ];
    }),
  );
}

function metricEligibleIds(baseProducts, metric, metrics = SINGLES_METRICS) {
  return new Set(Object.entries(baseProducts ?? {}).filter(([, prices]) => hasAllMetricPrices(prices, metrics) && readPrice(prices?.[metric]) !== null).map(([id]) => id));
}

export function buildIndicatorFile({ universe, updatedAt, baseDate, snapshot, baseProducts, existing = null, rebalanceEvent = null, rebalances = [] }) {
  const metrics = indicatorMetricsForUniverse(universe);
  const point = buildIndicatorPoint(updatedAt, snapshot, baseProducts, universe);
  const normalizedExisting = normalizeIndicatorHistory(existing, metrics);
  const points = upsertPoint(normalizedExisting.points, point);
  return {
    id: universe.id,
    name: `${universe.name} Market Indicators`,
    tcg: "pokemon",
    universe: universe.id,
    updatedAt,
    metrics,
    units: indicatorUnits(metrics),
    composition: {
      universeFile: universeFilePath(universe),
      universePolicy: universe.rebalancePolicy,
      currentBaseDate: baseDate,
      rebalanceCount: rebalances.length,
    },
    diagnostics: {
      ...normalizedExisting.diagnostics,
      [updatedAt]: buildIndicatorDiagnostics(snapshot, baseProducts, rebalanceEvent, universe),
    },
    points,
  };
}

function normalizeIndicatorHistory(existing, metrics) {
  const existingMetrics = Array.isArray(existing?.metrics) ? existing.metrics : [];
  const existingPoints = Array.isArray(existing?.points) ? existing.points : [];
  if (existingMetrics.length === 0 || existingPoints.length === 0) {
    return { points: [], diagnostics: {} };
  }

  const canMapMetrics = existingMetrics.every((metric) => metrics.includes(metric));
  if (!canMapMetrics) {
    return { points: [], diagnostics: {} };
  }

  return {
    points: existingPoints.map((point) => [
      point[0],
      ...metrics.map((metric) => {
        const oldIndex = existingMetrics.indexOf(metric);
        return oldIndex === -1 ? null : point[oldIndex + 1] ?? null;
      }),
    ]),
    diagnostics: existing?.diagnostics ?? {},
  };
}

export function indicatorMetricsForUniverse(universe) {
  return universe.id === "global-singles" ? [...WINDOW_INDICATOR_METRICS, ...TREND_INDICATOR_METRICS] : TREND_INDICATOR_METRICS;
}

export function buildIndicatorPoint(date, snapshot, baseProducts, universe = PRODUCT_UNIVERSES[0]) {
  const indicators = {
    ...calculateWindowIndicators(snapshot, baseProducts),
    ...calculateTrendIndicators(snapshot, baseProducts),
  };
  return [date, ...indicatorMetricsForUniverse(universe).map((metric) => indicators[metric])];
}

export function calculateWindowIndicators(snapshot, baseProducts) {
  const rows = windowIndicatorRows(snapshot, baseProducts);
  const advancers = rows.filter((row) => row.avg1 > row.avg7).length;
  const decliners = rows.filter((row) => row.avg1 < row.avg7).length;
  const above30 = rows.filter((row) => row.avg1 > row.avg30).length;
  const heatValues = rows.map((row) => 0.4 * (row.avg1 / row.avg7) + 0.6 * (row.avg7 / row.avg30));
  const returns = rows.map((row) => row.avg1 / row.avg30 - 1);

  return {
    advanceDecline: decliners === 0 ? null : roundIndex(advancers / decliners),
    percentAbove30d: rows.length === 0 ? null : roundIndex((above30 / rows.length) * 100),
    heat: heatValues.length === 0 ? null : roundIndex(average(heatValues) * 100),
    dispersion: returns.length === 0 ? null : roundIndex(populationStdDev(returns) * 100),
  };
}

export function calculateTrendIndicators(snapshot, baseProducts) {
  const rows = trendIndicatorRows(snapshot, baseProducts);
  const aboveTrend = rows.filter((row) => row.avg > row.trend).length;
  const belowTrend = rows.filter((row) => row.avg < row.trend).length;
  const heatValues = rows.map((row) => row.avg / row.trend);
  const floorStrengthValues = rows.map((row) => row.low / row.trend);
  const spreadValues = rows.map((row) => (row.avg - row.low) / row.avg);
  const trendReturns = rows.map((row) => row.avg / row.trend - 1);

  return {
    advanceDeclineTrend: belowTrend === 0 ? null : roundIndex(aboveTrend / belowTrend),
    percentAboveTrend: rows.length === 0 ? null : roundIndex((aboveTrend / rows.length) * 100),
    trendHeat: heatValues.length === 0 ? null : roundIndex(average(heatValues) * 100),
    floorStrength: floorStrengthValues.length === 0 ? null : roundIndex(average(floorStrengthValues) * 100),
    spread: spreadValues.length === 0 ? null : roundIndex(average(spreadValues) * 100),
    trendDispersion: trendReturns.length === 0 ? null : roundIndex(populationStdDev(trendReturns) * 100),
  };
}

function buildIndicatorDiagnostics(snapshot, baseProducts, rebalanceEvent, universe) {
  const windowRows = windowIndicatorRows(snapshot, baseProducts);
  const trendRows = trendIndicatorRows(snapshot, baseProducts);
  const activeCount = Object.keys(baseProducts ?? {}).length;
  const output = {
    activeProducts: activeCount,
    validProducts: trendRows.length,
    unavailableOrInvalidProducts: Math.max(activeCount - trendRows.length, 0),
    trendBreadth: trendBreadthCounts(trendRows),
    rebalance: Boolean(rebalanceEvent),
    rebalanceDetails: rebalanceEvent,
  };
  if (universe.id === "global-singles") {
    output.windowValidProducts = windowRows.length;
    output.windowUnavailableOrInvalidProducts = Math.max(activeCount - windowRows.length, 0);
    output.advanceDecline = windowBreadthCounts(windowRows);
  }
  return output;
}

function windowIndicatorRows(snapshot, baseProducts) {
  return Object.keys(baseProducts ?? {})
    .map((id) => ({
      avg1: readPrice(snapshot[id]?.avg1),
      avg7: readPrice(snapshot[id]?.avg7),
      avg30: readPrice(snapshot[id]?.avg30),
    }))
    .filter((row) => row.avg1 !== null && row.avg7 !== null && row.avg30 !== null);
}

function trendIndicatorRows(snapshot, baseProducts) {
  return Object.keys(baseProducts ?? {})
    .map((id) => ({
      avg: readPrice(snapshot[id]?.avg),
      low: readPrice(snapshot[id]?.low),
      trend: readPrice(snapshot[id]?.trend),
    }))
    .filter((row) => row.avg !== null && row.low !== null && row.trend !== null);
}

function windowBreadthCounts(rows) {
  return {
    advancers: rows.filter((row) => row.avg1 > row.avg7).length,
    decliners: rows.filter((row) => row.avg1 < row.avg7).length,
    unchanged: rows.filter((row) => row.avg1 === row.avg7).length,
  };
}

function trendBreadthCounts(rows) {
  return {
    aboveTrend: rows.filter((row) => row.avg > row.trend).length,
    belowTrend: rows.filter((row) => row.avg < row.trend).length,
    equalTrend: rows.filter((row) => row.avg === row.trend).length,
  };
}

function indicatorUnits(metrics) {
  const units = {
    advanceDecline: "ratio",
    percentAbove30d: "percent",
    heat: "score",
    dispersion: "percent",
    advanceDeclineTrend: "ratio",
    percentAboveTrend: "percent",
    trendHeat: "score",
    floorStrength: "score",
    spread: "percent",
    trendDispersion: "percent",
  };
  return Object.fromEntries(metrics.map((metric) => [metric, units[metric]]));
}

function average(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function populationStdDev(values) {
  if (values.length === 0) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

export function upsertPoint(points, point) {
  const next = points.filter((existing) => existing[0] !== point[0]);
  next.push(point);
  next.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return next;
}

export function percentChange(points, metricIndex, days) {
  if (points.length < 2) return null;
  const latest = readNonNegativeNumber(points.at(-1)?.[metricIndex]);
  const prior = readNonNegativeNumber(points.at(-(days + 1))?.[metricIndex]);
  if (latest === null || prior === null || prior === 0) return null;
  return roundIndex(((latest - prior) / prior) * 100);
}

function readNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function roundIndex(value) {
  return Number(value.toFixed(2));
}
