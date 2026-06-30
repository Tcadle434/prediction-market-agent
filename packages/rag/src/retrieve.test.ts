import { describe, expect, it } from "vitest";
import type { EmbedBatch } from "./embed.js";
import type { RerankFn } from "./rerank.js";
import { retrieve } from "./retrieve.js";
import { InMemoryVectorStore } from "./store/memory.js";
import type { VectorRecord } from "./store/vector-store.js";

const NOW = Date.parse("2026-06-29T00:00:00Z");
const DAY = 86_400_000;

function record(
	id: string,
	embedding: number[],
	ageDays: number,
	marketId?: string,
): VectorRecord {
	return {
		chunk: {
			id,
			evidenceId: `e-${id}`,
			text: `text ${id}`,
			index: 0,
			tokenCount: 1,
			publishedAt: new Date(NOW - ageDays * DAY).toISOString(),
		},
		embedding,
		marketId,
	};
}

/** Fake batch-embed that always returns a fixed query vector (so the store does real cosine). */
function fakeEmbed(queryVec: number[]): EmbedBatch {
	return async (texts) => texts.map(() => queryVec);
}

/** Fake rerank that preserves candidate order (score decreases with input index). */
function passthroughRerank(): RerankFn {
	return async (_query, documents) =>
		documents.map((_doc, index) => ({
			index,
			relevanceScore: 1 - index * 0.01,
		}));
}

describe("retrieve", () => {
	const embed = fakeEmbed([1, 0, 0]);
	const rerankFn = passthroughRerank();

	it("returns the top-K passages best-first, each with a rerank score", async () => {
		const store = new InMemoryVectorStore();
		await store.upsert([
			record("a", [1, 0, 0], 0),
			record("b", [0.8, 0.2, 0], 0),
			record("c", [0, 1, 0], 0), // orthogonal — least similar
		]);

		const out = await retrieve("q", {
			store,
			embed,
			rerankFn,
			nowMs: NOW,
			topK: 2,
		});

		expect(out.map((c) => c.id)).toEqual(["a", "b"]);
		expect(out[0]!.rerankScore).not.toBeNull();
		expect(out[0]!.similarity).toBeGreaterThan(out[1]!.similarity);
	});

	it("returns an empty array when the store is empty", async () => {
		const out = await retrieve("q", {
			store: new InMemoryVectorStore(),
			embed,
			rerankFn,
			nowMs: NOW,
		});
		expect(out).toEqual([]);
	});

	it("restricts to a marketId when given", async () => {
		const store = new InMemoryVectorStore();
		await store.upsert([
			record("a", [1, 0, 0], 0, "m1"),
			record("b", [1, 0, 0], 0, "m2"),
		]);

		const out = await retrieve("q", {
			store,
			embed,
			rerankFn,
			nowMs: NOW,
			marketId: "m1",
		});

		expect(out.map((c) => c.id)).toEqual(["a"]);
	});

	it("lets recency promote a fresher candidate over a stale, more-relevant one", async () => {
		const store = new InMemoryVectorStore();
		await store.upsert([
			record("old", [1, 0, 0], 90), // most similar → reranks #1, but 90 days old
			record("new", [0.85, 0.15, 0], 0), // slightly less similar, but fresh
		]);

		const out = await retrieve("q", {
			store,
			embed,
			rerankFn,
			nowMs: NOW,
			halfLifeDays: 14,
			topK: 2,
		});

		expect(out[0]!.id).toBe("new");
	});
});
