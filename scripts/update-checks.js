import { appendFile } from "node:fs/promises";
import { currentDateInTimeZone, parseValuationDate } from "./index-engine.js";

export const DEFAULT_TIME_ZONE = "Europe/Berlin";

export function checkUpdateNeeded(summaryPayload, options = {}) {
  const today = options.today ?? currentDateInTimeZone(options.now ?? new Date(), options.timeZone ?? DEFAULT_TIME_ZONE);
  const updatedAt = typeof summaryPayload?.updatedAt === "string" ? summaryPayload.updatedAt : null;
  const needed = updatedAt !== today;

  return {
    needed,
    today,
    updatedAt,
    reason: needed ? `No generated data for ${today}` : `Generated data already exists for ${today}`,
  };
}

export function checkPriceGuideFreshness(priceGuidePayload, options = {}) {
  const today = options.today ?? currentDateInTimeZone(options.now ?? new Date(), options.timeZone ?? DEFAULT_TIME_ZONE);
  const valuationDate = parseValuationDate(priceGuidePayload?.createdAt);
  const fresh = valuationDate === today;

  return {
    fresh,
    today,
    valuationDate,
    reason: fresh ? `Cardmarket price guide is fresh for ${today}` : `Cardmarket price guide is still dated ${valuationDate}; waiting for ${today}`,
  };
}

export async function writeGithubOutputs(outputs, outputPath = process.env.GITHUB_OUTPUT) {
  if (!outputPath) return;
  const text = Object.entries(outputs)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  await appendFile(outputPath, `${text}\n`, "utf8");
}
