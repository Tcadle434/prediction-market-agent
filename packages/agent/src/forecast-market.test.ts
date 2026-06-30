import type { Evidence, Market } from "@lykos/core";
import { InMemoryVectorStore } from "@lykos/rag";
import { describe, expect, it } from "vitest";
import { forecastMarket } from "./forecast-market.js";

const market: Market = {
	id: "mkt-1",
	question: "Will the Fed cut rates in December?",
	description: "",
	resolutionCriteria: "",
	outcomes: [],
	status: "open",
	resolvedOutcome: null,
	endDate: null,
	url: null,
	source: "polymarket",
};

const evidence: Evidence[] = [
	{
		id: "ev-1",
		url: "https://example.com/fed",
		title: "Fed holds",
		content: "The Fed held rates steady, signaling patience.",
		publishedAt: null,
		source: "tavily",
		searchScore: null,
	},
];

describe("forecastMarket", () => {
	it("runs gatherNews → forecast and returns the news + forecast", async () => {
		const result = await forecastMarket(market, {
			gatherNews: {
				search: async () => evidence,
				store: new InMemoryVectorStore(),
				embed: async (texts) => texts.map(() => [1, 2, 3, 4]),
				rerank: async (_query, documents) =>
					documents.map((_doc, index) => ({ index, relevanceScore: 1 - index * 0.01 })),
			},
			forecast: {
				model: async () => ({
					probabilityYes: 0.6,
					confidence: 0.5,
					abstained: false,
					rationale: "Grounded.",
					citedChunkIds: [],
				}),
			},
		});

		expect(result.news.length).toBeGreaterThan(0);
		expect(result.news[0]?.url).toBe("https://example.com/fed");
		expect(result.forecast?.probabilityYes).toBe(0.6);
	});
});
