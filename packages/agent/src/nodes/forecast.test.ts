import type { Market } from "@lykos/core";
import { describe, expect, it } from "vitest";
import type { ForecastDraft, ForecastModel } from "../forecast/index.js";
import type { RetrievedPassage } from "../passage.js";
import type { AgentStateType } from "../state.js";
import { createForecastNode } from "./forecast.js";

const market: Market = {
	id: "mkt-1",
	question: "Will the Fed cut rates in December?",
	description: "",
	resolutionCriteria: "",
	outcomes: [
		{ name: "Yes", price: 0.3, bid: 0.29, ask: 0.31 },
		{ name: "No", price: 0.7, bid: 0.69, ask: 0.71 },
	],
	status: "open",
	resolvedOutcome: null,
	endDate: null,
	url: null,
	source: "polymarket",
};

const passages: RetrievedPassage[] = [
	{
		id: "ev-1#0",
		evidenceId: "ev-1",
		text: "The Fed signaled it is in no hurry to cut.",
		index: 0,
		tokenCount: 10,
		publishedAt: null,
		similarity: 0.9,
		rerankScore: 0.8,
		url: "https://example.com/fed",
		title: "Fed holds",
	},
];

/** A fake ForecastModel that returns a fixed draft and records the prompt it saw. */
function fakeModel(returns: ForecastDraft): {
	model: ForecastModel;
	lastPrompt: () => unknown;
} {
	let seen: unknown;
	return {
		model: async (prompt) => {
			seen = prompt;
			return returns;
		},
		lastPrompt: () => seen,
	};
}

function state(news: RetrievedPassage[]): AgentStateType {
	return { market, news, forecast: null, decision: null, position: null };
}

describe("createForecastNode", () => {
	it("calls the model and writes an assembled forecast to state.forecast", async () => {
		const { model } = fakeModel({
			probabilityYes: 0.65,
			confidence: 0.5,
			abstained: false,
			rationale: "Grounded.",
			citedChunkIds: ["ev-1#0"],
		});
		const node = createForecastNode({ model });

		const update = await node(state(passages));

		expect(update.forecast?.marketId).toBe("mkt-1");
		expect(update.forecast?.probabilityYes).toBe(0.65);
		expect(update.forecast?.citations).toHaveLength(1);
		expect(update.forecast?.citations[0]?.url).toBe("https://example.com/fed");
		expect(update.forecast?.citations[0]?.quote).toBe(
			"The Fed signaled it is in no hurry to cut.",
		);
	});

	it("builds a prompt the model receives, with the system rules and the market question", async () => {
		const { model, lastPrompt } = fakeModel({
			probabilityYes: null,
			confidence: 0,
			abstained: true,
			rationale: "Too thin.",
			citedChunkIds: [],
		});
		const node = createForecastNode({ model });

		await node(state([]));

		const prompt = lastPrompt() as { system: string; user: string };
		expect(prompt.system).toContain("Lykos");
		expect(prompt.user).toContain(market.question);
	});
});
