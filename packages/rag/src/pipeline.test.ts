import type { Evidence } from "@lykos/core";
import { describe, expect, it } from "vitest";
import { fixedChunker } from "./chunk/fixed.js";
import type { EmbedBatch } from "./embed.js";
import { indexEvidence } from "./pipeline.js";
import { InMemoryVectorStore } from "./store/memory.js";

function evidence(id: string, content: string): Evidence {
	return {
		id,
		url: `https://example.com/${id}`,
		title: id,
		content,
		publishedAt: null,
		source: "tavily",
		searchScore: null,
	};
}

/** Fake batch-embed returning a deterministic finite vector per text. */
function fakeEmbed(dim = 4): EmbedBatch {
	return async (texts) =>
		texts.map((_t, i) => Array.from({ length: dim }, (_, d) => (i + d) / 10));
}

const words = (n: number) =>
	Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

describe("indexEvidence", () => {
	it("chunks, embeds, and upserts every document into the store", async () => {
		const store = new InMemoryVectorStore();
		const chunker = fixedChunker({ targetTokens: 10, overlapTokens: 0 });

		const count = await indexEvidence(
			[evidence("a", words(25)), evidence("b", words(15))],
			{
				store,
				chunker,
				embed: fakeEmbed(),
			},
		);

		expect(count).toBeGreaterThan(2); // both docs split into several chunks
		expect(await store.count()).toBe(count);
	});

	it("tags records with the marketId so scoped retrieval finds them", async () => {
		const store = new InMemoryVectorStore();
		const chunker = fixedChunker({ targetTokens: 10, overlapTokens: 0 });

		await indexEvidence([evidence("a", words(20))], {
			store,
			chunker,
			embed: fakeEmbed(),
			marketId: "mkt-1",
		});

		const hits = await store.query({
			embedding: [0, 0, 0, 0],
			topK: 100,
			marketId: "mkt-1",
		});
		expect(hits.length).toBeGreaterThan(0);
		const other = await store.query({
			embedding: [0, 0, 0, 0],
			topK: 100,
			marketId: "mkt-2",
		});
		expect(other).toHaveLength(0);
	});

	it("returns 0 and upserts nothing when there is no usable text", async () => {
		const store = new InMemoryVectorStore();
		const count = await indexEvidence([evidence("blank", "   ")], {
			store,
			chunker: fixedChunker(),
			embed: fakeEmbed(),
		});

		expect(count).toBe(0);
		expect(await store.count()).toBe(0);
	});

	it("strips page boilerplate so nav-only evidence indexes nothing", async () => {
		const store = new InMemoryVectorStore();
		const navOnly =
			"* [About](/about) * [Login](/login)\n* [Ads](/ads) * [Help](/help)";
		const count = await indexEvidence([evidence("nav", navOnly)], {
			store,
			chunker: fixedChunker(),
			embed: fakeEmbed(),
		});
		expect(count).toBe(0);
	});
});
