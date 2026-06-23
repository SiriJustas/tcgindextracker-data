import { readFile } from "node:fs/promises";
import { checkUpdateNeeded, writeGithubOutputs } from "./update-checks.js";

const summaryPath = process.argv[2] ?? "public/data/pokemon/summary.json";
const summary = await readOptionalJson(summaryPath);
const result = checkUpdateNeeded(summary);

console.log(result.reason);
if (result.updatedAt) {
  console.log(`Existing generated date: ${result.updatedAt}`);
}
console.log(`Current Cardmarket date: ${result.today}`);

await writeGithubOutputs({
  needed: String(result.needed),
  today: result.today,
  updatedAt: result.updatedAt ?? "",
});

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
