import { describe, expect, it } from "vitest";
import { ForecastDraftSchema } from "./draft.js";

const base = {
	probabilityYes: 0.1,
	confidence: 0.7,
	abstained: false,
	rationale: "Grounded in the evidence.",
};

describe("ForecastDraftSchema", () => {
	it("accepts a normal citedChunkIds array unchanged", () => {
		const parsed = ForecastDraftSchema.parse({
			...base,
			citedChunkIds: ["a#0", "b#1"],
		});
		expect(parsed.citedChunkIds).toEqual(["a#0", "b#1"]);
	});

	it("coerces a stringified citedChunkIds array back to an array (Anthropic tool-use quirk)", () => {
		const parsed = ForecastDraftSchema.parse({
			...base,
			citedChunkIds: JSON.stringify(["a#0", "b#1"]),
		});
		expect(parsed.citedChunkIds).toEqual(["a#0", "b#1"]);
	});

	it("still rejects a non-JSON string for citedChunkIds", () => {
		expect(() =>
			ForecastDraftSchema.parse({ ...base, citedChunkIds: "not json" }),
		).toThrow();
	});
});
