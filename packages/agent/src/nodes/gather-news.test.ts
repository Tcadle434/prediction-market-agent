import type { Evidence, Market, RetrievedChunk } from "@lykos/core";
import { InMemoryVectorStore } from "@lykos/rag";
import { describe, expect, it } from "vitest";
import type { AgentStateType } from "../state.js";
import { createGatherNewsNode, toPassages } from "./gather-news.js";

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

function evidence(
	id: string,
	url: string,
	title: string,
	content = "The Fed held rates steady.",
): Evidence {
	return {
		id,
		url,
		title,
		content,
		publishedAt: null,
		source: "tavily",
		searchScore: null,
	};
}

function chunk(id: string, evidenceId: string): RetrievedChunk {
	return {
		id,
		evidenceId,
		text: "some text",
		index: 0,
		tokenCount: 3,
		publishedAt: null,
		similarity: 0.9,
		rerankScore: null,
	};
}

function state(): AgentStateType {
	return { market, news: [], forecast: null, decision: null, position: null };
}

describe("toPassages", () => {
	it("enriches each chunk with the url + title of its evidence", () => {
		const docs = [
			evidence("ev-1", "https://a.com", "A"),
			evidence("ev-2", "https://b.com", "B"),
		];
		const chunks = [chunk("ev-2#0", "ev-2"), chunk("ev-1#0", "ev-1")];

		const passages = toPassages(chunks, docs);

		expect(passages).toHaveLength(2);
		expect(passages[0]).toMatchObject({ url: "https://b.com", title: "B" });
		expect(passages[1]).toMatchObject({ url: "https://a.com", title: "A" });
	});

	it("drops a chunk whose evidence is not in the batch", () => {
		const passages = toPassages(
			[chunk("x#0", "missing")],
			[evidence("ev-1", "https://a.com", "A")],
		);
		expect(passages).toHaveLength(0);
	});
});

describe("createGatherNewsNode", () => {
	it("searches, indexes, retrieves, and returns citable passages", async () => {
		const docs = [
			evidence(
				"ev-1",
				"https://a.com",
				"Fed holds",
				"The Fed held rates steady, signaling patience.",
			),
		];
		const node = createGatherNewsNode({
			search: async () => docs,
			store: new InMemoryVectorStore(),
			embed: async (texts) => texts.map(() => [1, 2, 3, 4]),
			rerank: async (_query, documents) =>
				documents.map((_doc, index) => ({
					index,
					relevanceScore: 1 - index * 0.01,
				})),
		});

		const update = await node(state());

		expect(update.news?.length).toBeGreaterThan(0);
		expect(update.news?.[0]).toMatchObject({
			url: "https://a.com",
			title: "Fed holds",
		});
	});

	it("returns no news when the search finds nothing", async () => {
		const node = createGatherNewsNode({ search: async () => [] });
		const update = await node(state());
		expect(update.news).toEqual([]);
	});
});
