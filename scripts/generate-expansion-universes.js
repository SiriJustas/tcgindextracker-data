import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  CARDMARKET_EXPANSIONS_URL,
  buildExpansionUniverseCandidates,
  parseManualExpansionMappings,
  parseCardmarketExpansionEntries,
  validateManualExpansionMappings,
} from "./expansion-universe-engine.js";

const root = process.cwd();
const defaults = {
  products: path.join(root, "downloads", "pokemon", "products_singles.json"),
  nonSingles: path.join(root, "downloads", "pokemon", "products_nonsingles.json"),
  universesDir: path.join(root, "public", "data", "pokemon", "universes"),
  auditDir: path.join(root, "audit"),
  manualMap: path.join(root, "scripts", "manual-expansion-name-map.txt"),
};

export async function generateExpansionUniverses(options = {}) {
  const productsPayload = await readJson(options.products ?? defaults.products);
  const nonSinglesPayload = await readJson(options.nonSingles ?? options["non-singles"] ?? defaults.nonSingles);
  const universesDir = path.resolve(options.universesDir ?? options["universes-dir"] ?? defaults.universesDir);
  const auditDir = path.resolve(options.auditDir ?? options["audit-dir"] ?? defaults.auditDir);
  const existingUniverses = await readExistingSetUniverses(universesDir);
  const expansionEntries = await loadExpansionEntries(options);
  const manualMap = await loadManualMap(options, productsPayload);
  const result = buildExpansionUniverseCandidates({
    productsPayload,
    nonSinglesPayload,
    existingUniverses,
    expansionEntries,
    manualMappings: manualMap.mappings,
    allowLocalInference: Boolean(options.allowLocalInference ?? options["allow-local-inference"]),
  });

  await mkdir(universesDir, { recursive: true });
  for (const universe of result.candidates) {
    await writeCompactJson(path.join(universesDir, `${universe.id}.json`), universe);
  }

  await mkdir(auditDir, { recursive: true });
  const audit = {
    updatedAt: new Date().toISOString(),
    source: {
      cardmarketExpansionsUrl: CARDMARKET_EXPANSIONS_URL,
      productsCreatedAt: productsPayload?.createdAt ?? null,
      nonSinglesCreatedAt: nonSinglesPayload?.createdAt ?? null,
      expansionEntries: expansionEntries.length,
      manualMappings: manualMap.mappings.length,
    },
    manualMappingErrors: manualMap.errors,
    stats: result.stats,
    generated: result.candidates.map((universe) => ({
      id: universe.id,
      name: universe.name,
      slug: universe.slug,
      idExpansion: universe.source.idExpansion,
      count: universe.count,
      curationStatus: universe.curation.status,
    })),
    skipped: result.skipped,
  };
  await writeCompactJson(path.join(auditDir, "pokemon-expansion-universe-coverage.json"), audit);

  console.log(`Generated ${result.candidates.length} missing expansion universes`);
  console.log(`Skipped ${result.skipped.length} expansion groups; see audit/pokemon-expansion-universe-coverage.json`);
  return audit;
}

async function loadManualMap(options, productsPayload) {
  const manualMapPath = options.manualMap ?? options["manual-map"] ?? defaults.manualMap;
  if (options["no-manual-map"]) return { mappings: [], errors: [] };
  let text = "";
  try {
    text = await readFile(path.resolve(manualMapPath), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { mappings: [], errors: [] };
    throw error;
  }
  const parsed = parseManualExpansionMappings(text);
  const validationErrors = validateManualExpansionMappings(parsed.mappings, productsPayload);
  const errors = [...parsed.errors, ...validationErrors];
  if (errors.length > 0) {
    throw new Error(`Manual expansion map contains ${errors.length} error(s): ${JSON.stringify(errors.slice(0, 5))}`);
  }
  return { mappings: parsed.mappings, errors };
}

async function loadExpansionEntries(options) {
  const htmlPath = options.expansionsHtml ?? options["expansions-html"];
  if (htmlPath) {
    return parseCardmarketExpansionEntries(await readFile(path.resolve(htmlPath), "utf8"));
  }
  if (options.skipFetch ?? options["skip-fetch"]) return [];
  try {
    const response = await fetch(CARDMARKET_EXPANSIONS_URL, {
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "user-agent": "Mozilla/5.0 TCGIndexTrackerDataUniverseAudit/1.0",
      },
    });
    if (!response.ok) {
      console.warn(`Cardmarket expansion page fetch returned ${response.status}; falling back to local inference only.`);
      return [];
    }
    return parseCardmarketExpansionEntries(await response.text());
  } catch (error) {
    console.warn(`Cardmarket expansion page fetch failed: ${error.message}`);
    return [];
  }
}

async function readExistingSetUniverses(universesDir) {
  let files = [];
  try {
    files = await readdir(universesDir);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const universes = [];
  for (const fileName of files.filter((file) => file.endsWith(".json"))) {
    const universe = await readJson(path.join(universesDir, fileName));
    if (universe.kind === "set-singles-universe") universes.push(universe);
  }
  return universes;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeCompactJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await generateExpansionUniverses(parseArgs(process.argv.slice(2)));
}
