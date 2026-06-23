import { readFile } from "node:fs/promises";
import { checkPriceGuideFreshness, writeGithubOutputs } from "./update-checks.js";

const priceGuidePath = process.argv[2] ?? "downloads/pokemon/price_guide.json";
const priceGuide = JSON.parse(await readFile(priceGuidePath, "utf8"));
const result = checkPriceGuideFreshness(priceGuide);

console.log(result.reason);
console.log(`Price guide date: ${result.valuationDate}`);
console.log(`Current Cardmarket date: ${result.today}`);

await writeGithubOutputs({
  fresh: String(result.fresh),
  today: result.today,
  valuationDate: result.valuationDate,
});
