import { describe, expect, it } from "vitest";
import { checkPriceGuideFreshness, checkUpdateNeeded } from "./update-checks.js";

describe("scheduled update checks", () => {
  it("skips when the Pokemon summary was already generated today", () => {
    expect(checkUpdateNeeded({ updatedAt: "2026-06-23" }, { today: "2026-06-23" })).toMatchObject({
      needed: false,
      today: "2026-06-23",
      updatedAt: "2026-06-23",
    });
  });

  it("continues when the Pokemon summary is missing or old", () => {
    expect(checkUpdateNeeded(null, { today: "2026-06-23" })).toMatchObject({
      needed: true,
      updatedAt: null,
    });
    expect(checkUpdateNeeded({ updatedAt: "2026-06-22" }, { today: "2026-06-23" })).toMatchObject({
      needed: true,
      updatedAt: "2026-06-22",
    });
  });

  it("accepts only price guides dated with the current Cardmarket day", () => {
    expect(checkPriceGuideFreshness({ createdAt: "2026-06-23T02:46:08+0200" }, { today: "2026-06-23" })).toMatchObject({
      fresh: true,
      valuationDate: "2026-06-23",
    });
    expect(checkPriceGuideFreshness({ createdAt: "2026-06-22T23:46:08+0200" }, { today: "2026-06-23" })).toMatchObject({
      fresh: false,
      valuationDate: "2026-06-22",
    });
  });
});
