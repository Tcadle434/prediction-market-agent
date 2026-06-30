import type { Market } from "@lykos/core";
import { describe, expect, it } from "vitest";
import type { RetrievedPassage } from "../passage.js";
import { assembleForecast, resolveCitations } from "./assemble.js";
import type { ForecastDraft } from "./draft.js";

function market(): Market {
	return {
		id: "mkt-1",
		question: "Will X happen?",
		description: "",
		resolutionCriteria: "",
		outcomes: [
			{ name: "Yes", price: 0.4, bid: 0.39, ask: 0.41 },
			{ name: "No", price: 0.6, bid: 0.59, ask: 0.61 },
		],
		status: "open",
		resolvedOutcome: null,
		endDate: null,
		url: null,
		source: "polymarket",
	};
}

function passage(id: string, evidenceId = "ev-1"): RetrievedPassage {
	return {
		id,
		evidenceId,
		text: "some supporting text",
		index: 0,
		tokenCount: 3,
		publishedAt: null,
		similarity: 0.9,
		rerankScore: null,
		url: "https://example.com/article",
		title: "An article",
	};
}

function draft(overrides: Partial<ForecastDraft> = {}): ForecastDraft {
	return {
		probabilityYes: 0.7,
		confidence: 0.6,
		abstained: false,
		rationale: "Grounded in the evidence.",
		citations: [],
		...overrides,
	};
}

describe("resolveCitations", () => {
	it("keeps a matching citation and backfills evidenceId + url from the passage", () => {
		const passages = [passage("ev-1#0", "ev-1")];
		const cited = draft({
			citations: [{ chunkId: "ev-1#0", quote: "some supporting text" }],
		});

		const citations = resolveCitations(cited, passages);

		expect(citations).toHaveLength(1);
		expect(citations[0]).toMatchObject({
			chunkId: "ev-1#0",
			evidenceId: "ev-1",
			url: "https://example.com/article",
			quote: "some supporting text",
		});
	});

	it("drops a citation whose chunkId was never retrieved (no fabricated sources)", () => {
		const passages = [passage("ev-1#0")];
		const cited = draft({ citations: [{ chunkId: "made-up#9", quote: "x" }] });

		expect(resolveCitations(cited, passages)).toHaveLength(0);
	});
});

describe("assembleForecast", () => {
	it("assembles a schema-valid Forecast with marketId and resolved citations", () => {
		const passages = [passage("ev-1#0")];
		const cited = draft({
			citations: [{ chunkId: "ev-1#0", quote: "some supporting text" }],
		});

		const forecast = assembleForecast(market(), passages, cited);

		expect(forecast.marketId).toBe("mkt-1");
		expect(forecast.probabilityYes).toBe(0.7);
		expect(forecast.abstained).toBe(false);
		expect(forecast.citations).toHaveLength(1);
	});

	it("normalizes a null probability to an abstention with confidence 0", () => {
		const forecast = assembleForecast(
			market(),
			[],
			draft({ probabilityYes: null, confidence: 0.8 }),
		);

		expect(forecast.abstained).toBe(true);
		expect(forecast.probabilityYes).toBeNull();
		expect(forecast.confidence).toBe(0);
	});

	it("treats an explicit abstain flag as abstention even when a probability is present", () => {
		const forecast = assembleForecast(
			market(),
			[],
			draft({ abstained: true, probabilityYes: 0.7 }),
		);

		expect(forecast.abstained).toBe(true);
		expect(forecast.probabilityYes).toBeNull();
	});
});
