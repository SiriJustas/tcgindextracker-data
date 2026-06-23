export const METRICS = ["avg1", "avg7", "avg30"];

export const PRODUCT_UNIVERSES = [
  {
    id: "global-singles",
    name: "Global Singles",
    categoryId: 51,
    source: "singles",
    priceField: null,
    description: "Pokemon single cards.",
    itemLabel: "Pokemon single card",
    matcher: "singles",
    universeSlug: "global-singles",
    rebalancePolicy: "monthly-chain-linked",
  },
  {
    id: "booster-boxes",
    name: "Booster Boxes",
    categoryId: 53,
    source: "nonSingles",
    priceField: "trend",
    description: "Pokemon booster boxes and displays.",
    itemLabel: "Pokemon booster box/display",
    matcher: "boosterBoxes",
    universeSlug: "booster-boxes",
    rebalancePolicy: "monthly-chain-linked",
  },
  {
    id: "booster-packs",
    name: "Booster Packs",
    categoryId: 52,
    source: "nonSingles",
    priceField: "trend",
    description: "Pokemon individual booster packs.",
    itemLabel: "Pokemon booster pack",
    matcher: "boosterPacks",
    universeSlug: "booster-packs",
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
    file: `/data/pokemon/indexes/${universe.id}-${indexMethod.suffix}.json`,
    description: indexMethod.description(universe),
  })),
);

export function universeFilePath(universe) {
  return `/data/pokemon/indexes/${universe.universeSlug}-universe.json`;
}

export function buildUniverseFile({ universe, updatedAt, baseDate, rows, baseProducts, productMeta = {} }) {
  const productsById = new Map(rows.map((row) => [String(row.product.idProduct), row.product]));
  const sortedProducts = Object.entries(baseProducts)
    .filter(([, prices]) => hasAllMetricPrices(prices))
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
    metrics: METRICS,
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

export function createSnapshot(rows, previousState = {}, baseProducts = null, priceField = null) {
  const productState = previousState.products ?? {};
  const productMeta = previousState.productMeta ?? {};
  const snapshot = {};
  const hasActiveBase = baseProducts && Object.keys(baseProducts).length > 0;
  const rowsById = new Map(rows.map((row) => [String(row.product.idProduct), row]));
  const nextProducts = hasActiveBase ? {} : { ...productState };
  const nextProductMeta = hasActiveBase ? {} : { ...productMeta };
  const idsToProcess = hasActiveBase ? Object.keys(baseProducts) : rows.map((row) => String(row.product.idProduct));
  const quality = Object.fromEntries(
    METRICS.map((metric) => [
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
    for (const metric of METRICS) {
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

    for (const metric of METRICS) {
      if (!row) {
        quality[metric].unavailable += 1;
        carryForwardProductMetric({ snapshot, nextProducts, productState, id, metric, quality });
        continue;
      }

      const freshValue = readPrice(priceField ? price[priceField] : price[metric]);
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

export function ensureBaseState(existingIndex, snapshot) {
  const currentBase = existingIndex?.baseProducts ?? {};
  const completeCurrentBase = filterCompleteBaseProducts(currentBase);
  if (hasAnyBasePrice(completeCurrentBase)) {
    return completeCurrentBase;
  }

  return buildBaseProductsFromSnapshot(snapshot);
}

function hasAnyBasePrice(baseProducts) {
  return Object.values(baseProducts).some((prices) => METRICS.some((metric) => readPrice(prices?.[metric]) !== null));
}

function hasAllMetricPrices(prices) {
  return METRICS.every((metric) => readPrice(prices?.[metric]) !== null);
}

function filterCompleteBaseProducts(baseProducts) {
  return Object.fromEntries(Object.entries(baseProducts ?? {}).filter(([, prices]) => hasAllMetricPrices(prices)));
}

export function activeProductsByMetric(baseProducts) {
  return Object.fromEntries(
    METRICS.map((metric) => [metric, Object.values(baseProducts).filter((prices) => readPrice(prices?.[metric]) !== null).length]),
  );
}

export function buildBaseProductsFromSnapshot(snapshot) {
  const baseProducts = {};
  for (const [id, prices] of Object.entries(snapshot)) {
    if (!hasAllMetricPrices(prices)) {
      continue;
    }
    const metricPrices = {};
    for (const metric of METRICS) {
      metricPrices[metric] = readPrice(prices[metric]);
    }
    baseProducts[id] = metricPrices;
  }
  return baseProducts;
}

export function shouldRebalanceUniverse(universe, state = {}, valuationDate) {
  if (universe.rebalancePolicy !== "monthly-chain-linked") return false;
  if (!hasAnyBasePrice(state.baseProducts ?? {})) return false;
  if (state.lastRebalancedAt === valuationDate) return false;

  const valuationMonth = monthKey(valuationDate);
  const activeMonth = state.lastRebalanceMonth ?? monthKey(state.baseDate);
  return Boolean(valuationMonth && activeMonth && valuationMonth !== activeMonth);
}

export function monthKey(date) {
  const match = String(date ?? "").match(/^(\d{4}-\d{2})/);
  return match?.[1] ?? null;
}

export function defaultScaleByMethodMetric() {
  return Object.fromEntries(INDEX_METHODS.map(({ method }) => [method, Object.fromEntries(METRICS.map((metric) => [metric, 100]))]));
}

export function normalizeScaleByMethodMetric(scaleByMethodMetric = {}) {
  const defaults = defaultScaleByMethodMetric();
  return Object.fromEntries(
    Object.entries(defaults).map(([method, metrics]) => [
      method,
      Object.fromEntries(METRICS.map((metric) => [metric, readPrice(scaleByMethodMetric?.[method]?.[metric]) ?? metrics[metric]])),
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

export function buildPoint(method, date, snapshot, baseProducts) {
  return [
    date,
    ...METRICS.map((metric) => calculateMetricValue(method, snapshot, baseProducts, metric)),
  ];
}

export function buildScaledPoint(method, date, snapshot, baseProducts, scaleByMetric = {}) {
  return [
    date,
    ...METRICS.map((metric) => calculateScaledMetricValue(method, snapshot, baseProducts, metric, readPrice(scaleByMetric[metric]) ?? 100)),
  ];
}

export function buildRebalanceScale(previousScaleByMethodMetric, oldSnapshot, oldBaseProducts) {
  const previousScale = normalizeScaleByMethodMetric(previousScaleByMethodMetric);
  return Object.fromEntries(
    INDEX_METHODS.map(({ method }) => [
      method,
      Object.fromEntries(
        METRICS.map((metric) => [
          metric,
          calculateScaledMetricValue(method, oldSnapshot, oldBaseProducts, metric, previousScale[method][metric]) ?? previousScale[method][metric],
        ]),
      ),
    ]),
  );
}

export function summarizeRebalance(previousBaseProducts, nextBaseProducts, rowsLength) {
  return Object.fromEntries(
    METRICS.map((metric) => {
      const previousIds = metricEligibleIds(previousBaseProducts, metric);
      const nextIds = metricEligibleIds(nextBaseProducts, metric);
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

function metricEligibleIds(baseProducts, metric) {
  return new Set(Object.entries(baseProducts ?? {}).filter(([, prices]) => hasAllMetricPrices(prices) && readPrice(prices?.[metric]) !== null).map(([id]) => id));
}

export function upsertPoint(points, point) {
  const next = points.filter((existing) => existing[0] !== point[0]);
  next.push(point);
  next.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return next;
}

export function percentChange(points, metricIndex, days) {
  if (points.length < 2) return null;
  const latest = readPrice(points.at(-1)?.[metricIndex]);
  const prior = readPrice(points.at(-(days + 1))?.[metricIndex]);
  if (latest === null || prior === null) return null;
  return roundIndex(((latest - prior) / prior) * 100);
}

export function roundIndex(value) {
  return Number(value.toFixed(2));
}
