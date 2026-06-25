import { SINGLES_METRICS } from "./index-engine.js";

export const CARDMARKET_EXPANSIONS_URL = "https://www.cardmarket.com/en/Pokemon/Expansions";

const NON_SINGLE_SUFFIXES = [
  "booster box case",
  "jumbo booster box",
  "booster box",
  "jumbo booster",
  "booster",
  "display",
  "case",
  "theme deck",
  "box set",
  "coin set",
  "collector set",
  "special set",
  "value set",
  "10-pack set plus",
  "2-pack blister",
  "3-pack blister",
  "pack",
  "tin",
  "sleeves",
  "playmat",
  "binder",
  "deck box",
];

const GENERIC_NAME_PATTERNS = [
  /^pokemon products$/i,
  /^traditional chinese products$/i,
  /^scarlet & violet products$/i,
  /^sword & shield products$/i,
  /^sun & moon products$/i,
  /^mega evolution products$/i,
];

export const EXPANSION_NAME_OVERRIDES = new Map([
  [1631, "XY Trainer Kit"],
  [1632, "XY Trainer Kit: Bisharp & Wigglytuff"],
  [1683, "XY Trainer Kit: Latias & Latios"],
  [1707, "XY Trainer Kit: Pikachu Libre & Suicune"],
  [1758, "SM Trainer Kit: Lycanroc & Alolan Raichu"],
  [2070, "SM Trainer Kit: Alolan Sandslash & Alolan Ninetales"],
  [3585, "VMAX Starter Deck: Venusaur VMAX"],
  [3590, "VMAX Starter Deck: Blastoise VMAX"],
]);

export function parseCardmarketExpansionEntries(html) {
  const entries = [];
  const anchorPattern = /<a\b[^>]*href=["'](?<href>\/en\/Pokemon\/Expansions\/(?<slug>[^"']+))["'][^>]*>(?<name>[\s\S]*?)<\/a>\s*[\s\S]{0,400}?(?<cards>\d+)\s+Cards/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const name = cleanHtml(match.groups.name);
    if (!name || name.startsWith("Image:")) continue;
    entries.push({
      name,
      slug: decodeURIComponent(match.groups.slug),
      url: `https://www.cardmarket.com${match.groups.href}`,
      cardCount: Number(match.groups.cards),
    });
  }
  return uniqueBy(entries, (entry) => normalizeName(entry.name));
}

export function slugifyName(name) {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/'/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .toLowerCase();
}

export function normalizeName(name) {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/'/g, "")
    .replace(/&/g, " and ")
    .replace(/pokemon/g, "pokemon")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function inferExpansionNameFromNonSingles(products) {
  const candidates = [];
  for (const product of products ?? []) {
    const candidate = cleanNonSingleProductName(product.name);
    if (!candidate || isGenericExpansionName(candidate)) continue;
    candidates.push(candidate);
  }
  const counts = new Map();
  for (const candidate of candidates) {
    const key = normalizeName(candidate);
    counts.set(key, {
      name: shortestName(counts.get(key)?.name, candidate),
      count: (counts.get(key)?.count ?? 0) + 1,
    });
  }
  const ranked = [...counts.values()].sort((left, right) => {
    const byCount = right.count - left.count;
    return byCount || left.name.length - right.name.length || left.name.localeCompare(right.name);
  });
  return ranked[0]?.name ?? null;
}

export function buildExpansionUniverseCandidates({
  productsPayload,
  nonSinglesPayload,
  existingUniverses = [],
  expansionEntries = [],
  manualMappings = [],
  allowLocalInference = false,
}) {
  const existingExpansionIds = new Set();
  const existingByExpansion = new Map();
  const existingSlugs = new Set();
  for (const universe of existingUniverses) {
    for (const id of universe.source?.idExpansions ?? [universe.source?.idExpansion]) {
      if (Number.isInteger(id)) {
        existingExpansionIds.add(id);
        existingByExpansion.set(id, universe);
      }
    }
    if (universe.slug) existingSlugs.add(universe.slug);
  }

  const pageEntriesByName = new Map(expansionEntries.filter((entry) => entry.cardCount > 0).map((entry) => [normalizeName(entry.name), entry]));
  const manualByExpansion = new Map(manualMappings.map((mapping) => [mapping.idExpansion, mapping]));
  const singlesByExpansion = groupBy(
    (productsPayload?.products ?? []).filter((product) => product.idCategory === 51),
    (product) => product.idExpansion,
  );
  const nonSinglesByExpansion = groupBy(nonSinglesPayload?.products ?? [], (product) => product.idExpansion);
  const candidates = [];
  const skipped = [];

  for (const [idExpansion, singles] of [...singlesByExpansion.entries()].sort((left, right) => Number(left[0]) - Number(right[0]))) {
    const numericId = Number(idExpansion);
    const overrideName = EXPANSION_NAME_OVERRIDES.get(numericId);
    if (existingExpansionIds.has(numericId)) {
      const existingUniverse = existingByExpansion.get(numericId);
      if (!overrideName || normalizeName(existingUniverse?.name) === normalizeName(overrideName)) {
        skipped.push({ idExpansion: numericId, reason: "already-covered", count: singles.length });
        continue;
      }
    }

    const manualMapping = manualByExpansion.get(numericId);
    if (manualMapping && !manualMapping.setName) {
      skipped.push({ idExpansion: numericId, reason: "missing-manual-name", count: singles.length, sampleProduct: manualMapping.sample });
      continue;
    }

    const inferredName = overrideName ?? manualMapping?.setName ?? inferExpansionNameFromNonSingles(nonSinglesByExpansion.get(idExpansion) ?? []);
    if (!inferredName) {
      skipped.push({ idExpansion: numericId, reason: "no-reliable-name", count: singles.length, sampleProducts: sampleNames(singles) });
      continue;
    }

    const pageEntry = pageEntriesByName.get(normalizeName(inferredName));
    if (!overrideName && !manualMapping && !pageEntry && expansionEntries.length > 0) {
      skipped.push({ idExpansion: numericId, reason: "not-found-on-cardmarket-expansions-page", inferredName, count: singles.length, sampleProducts: sampleNames(singles) });
      continue;
    }
    if (!overrideName && !manualMapping && !pageEntry && !allowLocalInference) {
      skipped.push({ idExpansion: numericId, reason: "requires-cardmarket-expansion-page-match", inferredName, count: singles.length, sampleProducts: sampleNames(singles) });
      continue;
    }

    const name = pageEntry?.name ?? inferredName;
    const baseSlug = slugifyName(name);
    const slug = collisionSafeSlug(baseSlug, existingSlugs, numericId);
    existingSlugs.add(slug);
    candidates.push(buildUniverseCandidate({
      idExpansion: numericId,
      name,
      slug,
      singles,
      productsCreatedAt: productsPayload?.createdAt ?? null,
      pageEntry,
      manualMapping,
      nameOverride: Boolean(overrideName),
      localInferenceOnly: !pageEntry,
    }));
  }

  return {
    candidates,
    skipped,
    stats: {
      existingUniverses: existingUniverses.length,
      candidateUniverses: candidates.length,
      skipped: skipped.length,
      pageEntries: expansionEntries.length,
    },
  };
}

export function parseManualExpansionMappings(text) {
  const mappings = [];
  const errors = [];
  for (const [lineIndex, rawLine] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?<idProduct>\d+),\s*(?<cardName>.*),\s*(?<idExpansion>\d+)(?:\s*->\s*(?<setName>.*))?$/);
    if (!match) {
      errors.push({ line: lineIndex + 1, reason: "invalid-format", text: line });
      continue;
    }
    const setName = cleanManualSetName(match.groups.setName);
    mappings.push({
      idProduct: Number(match.groups.idProduct),
      cardName: normalizeEncoding(match.groups.cardName.trim()),
      idExpansion: Number(match.groups.idExpansion),
      setName,
      line: lineIndex + 1,
    });
  }
  return { mappings, errors };
}

export function validateManualExpansionMappings(mappings, productsPayload) {
  const productsById = new Map((productsPayload?.products ?? []).map((product) => [Number(product.idProduct), product]));
  const errors = [];
  const seen = new Set();
  for (const mapping of mappings) {
    if (seen.has(mapping.idExpansion)) {
      errors.push({ line: mapping.line, idExpansion: mapping.idExpansion, reason: "duplicate-idExpansion" });
      continue;
    }
    seen.add(mapping.idExpansion);
    const product = productsById.get(mapping.idProduct);
    if (!product) {
      errors.push({ line: mapping.line, idExpansion: mapping.idExpansion, idProduct: mapping.idProduct, reason: "sample-product-not-found" });
      continue;
    }
    if (product.idExpansion !== mapping.idExpansion) {
      errors.push({ line: mapping.line, idExpansion: mapping.idExpansion, idProduct: mapping.idProduct, reason: "sample-product-expansion-mismatch", actualIdExpansion: product.idExpansion });
    }
    if (normalizeEncoding(product.name) !== normalizeEncoding(mapping.cardName)) {
      errors.push({ line: mapping.line, idExpansion: mapping.idExpansion, idProduct: mapping.idProduct, reason: "sample-product-name-mismatch", actualName: product.name });
    }
  }
  return errors;
}

function buildUniverseCandidate({ idExpansion, name, slug, singles, productsCreatedAt, pageEntry, manualMapping, nameOverride, localInferenceOnly }) {
  const sortedSingles = [...singles].sort((left, right) => {
    const byName = String(left.name).localeCompare(String(right.name));
    return byName || Number(left.idProduct) - Number(right.idProduct);
  });
  const entries = Object.fromEntries(sortedSingles.map((product) => [String(product.idProduct), product.name]));
  return {
    id: `${slug}-singles-universe`,
    tcg: "pokemon",
    kind: "set-singles-universe",
    name,
    slug,
    source: {
      productsCreatedAt,
      idExpansion,
      cardmarketExpansionName: pageEntry?.name ?? name,
      cardmarketExpansionUrl: pageEntry?.url ?? null,
      cardmarketExpansionCardCount: pageEntry?.cardCount ?? null,
      manualSampleProduct: manualMapping
        ? {
            idProduct: manualMapping.idProduct,
            name: manualMapping.cardName,
          }
        : undefined,
    },
    curation: {
      status: nameOverride ? "explicit-idExpansion-name-override" : manualMapping ? "manual-idExpansion-name-map" : localInferenceOnly ? "local-catalog-name-inferred" : "cardmarket-expansion-page-matched",
      method: nameOverride ? "explicit-idExpansion-name-override" : manualMapping ? "manual-idExpansion-name-map" : localInferenceOnly ? "idExpansion-product-ids-with-nonsingles-name-inference" : "cardmarket-expansion-name-and-idExpansion-product-ids",
      cardmarketProductCount: sortedSingles.length,
      note: nameOverride
        ? "Generated from an explicit reviewed idExpansion name override and Cardmarket product catalog membership."
        : manualMapping
        ? "Generated from a manually reviewed idExpansion name mapping and Cardmarket product catalog membership."
        : localInferenceOnly
        ? "Generated from Cardmarket product catalog idExpansion membership and non-single product names because the expansion page could not be fetched locally."
        : "Generated from Cardmarket product catalog idExpansion membership matched to the Cardmarket expansion page.",
    },
    count: sortedSingles.length,
    entries,
    metrics: SINGLES_METRICS,
  };
}

function cleanManualSetName(value) {
  const normalized = normalizeEncoding(String(value ?? "").trim());
  if (!normalized) return null;
  return normalized.replace(/["]/g, "").replace(/^'|'$/g, "").trim() || null;
}

function normalizeEncoding(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/PokÃ©mon/g, "Pokemon")
    .replace(/Pokémon/g, "Pokemon")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanNonSingleProductName(value) {
  let name = String(value ?? "")
    .replace(/^["']|["']$/g, "")
    .replace(/^[A-Z0-9.]+[a-zA-Z]?:\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return null;
  name = name.split(":")[0].trim();
  name = name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of NON_SINGLE_SUFFIXES) {
      const pattern = new RegExp(`\\s+${escapeRegExp(suffix)}$`, "i");
      if (pattern.test(name)) {
        name = name.replace(pattern, "").trim();
        changed = true;
      }
    }
  }
  name = name.replace(/\s+(?:Indonesian|Traditional Chinese|Simplified Chinese|Thai)$/i, "").trim();
  return name || null;
}

function cleanHtml(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function shortestName(left, right) {
  if (!left) return right;
  return right.length < left.length ? right : left;
}

function isGenericExpansionName(name) {
  const normalized = name.trim();
  return GENERIC_NAME_PATTERNS.some((pattern) => pattern.test(normalized));
}

function groupBy(values, getKey) {
  const groups = new Map();
  for (const value of values) {
    const key = String(getKey(value));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  }
  return groups;
}

function collisionSafeSlug(slug, existingSlugs, idExpansion) {
  if (!existingSlugs.has(slug)) return slug;
  return `${slug}-${idExpansion}`;
}

function sampleNames(products) {
  return products.slice(0, 5).map((product) => product.name);
}

function uniqueBy(values, getKey) {
  const seen = new Set();
  const unique = [];
  for (const value of values) {
    const key = getKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(value);
  }
  return unique;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
