import type { Chunk } from "@lykos/core";
import { beforeEach, describe, expect, it } from "vitest";
import { cosineSimilarity, InMemoryVectorStore } from "./memory.js";
import type { VectorRecord } from "./vector-store.js";

function makeChunk(id: string): Chunk {
	return {
		id,
		evidenceId: `ev-${id}`,
		text: `text ${id}`,
		index: 0,
		tokenCount: 1,
		publishedAt: null,
	};
}

function makeRecord(
	id: string,
	embedding: number[],
	marketId?: string,
): VectorRecord {
	return { chunk: makeChunk(id), embedding, marketId };
}

describe("cosineSimilarity", () => {
	it("returns 1 for identical direction vectors", () => {
		// Arrange
		const a = [1, 2, 3];
		const b = [2, 4, 6]; // same direction, different magnitude

		// Act
		const similarity = cosineSimilarity(a, b);

		// Assert
		expect(similarity).toBeCloseTo(1, 10);
	});

	it("returns 0 for orthogonal vectors", () => {
		expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
	});

	it("returns 0 when either vector is all zeros", () => {
		expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
	});

	it("throws when dimensions differ", () => {
		expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(
			/dimension mismatch/,
		);
	});
});

describe("InMemoryVectorStore", () => {
	let store: InMemoryVectorStore;

	beforeEach(() => {
		store = new InMemoryVectorStore();
	});

	it("returns the topK most similar chunks ordered best-first", async () => {
		// Arrange — query [1,0] is closest to 'a', then 'b', then 'c'
		await store.upsert([
			makeRecord("a", [1, 0]),
			makeRecord("b", [0.7, 0.7]),
			makeRecord("c", [0, 1]),
		]);

		// Act
		const hits = await store.query({ embedding: [1, 0], topK: 2 });

		// Assert
		expect(hits.map((h) => h.chunk.id)).toEqual(["a", "b"]);
		expect(hits[0]!.similarity).toBeGreaterThan(hits[1]!.similarity);
	});

	it("restricts results to a marketId when one is given", async () => {
		// Arrange
		await store.upsert([
			makeRecord("a", [1, 0], "mkt-1"),
			makeRecord("b", [1, 0], "mkt-2"),
		]);

		// Act
		const hits = await store.query({
			embedding: [1, 0],
			topK: 10,
			marketId: "mkt-1",
		});

		// Assert
		expect(hits.map((h) => h.chunk.id)).toEqual(["a"]);
	});

	it("searches the whole corpus when no marketId is given", async () => {
		await store.upsert([
			makeRecord("a", [1, 0], "mkt-1"),
			makeRecord("b", [1, 0], "mkt-2"),
		]);

		const hits = await store.query({ embedding: [1, 0], topK: 10 });

		expect(hits).toHaveLength(2);
	});

	it("replaces a chunk on re-upsert instead of duplicating it", async () => {
		// Arrange
		await store.upsert([makeRecord("a", [1, 0])]);

		// Act
		await store.upsert([makeRecord("a", [0, 1])]);

		// Assert
		expect(await store.count()).toBe(1);
		const hits = await store.query({ embedding: [0, 1], topK: 1 });
		expect(hits[0]!.similarity).toBeCloseTo(1, 10);
	});

	it("clears all records", async () => {
		await store.upsert([makeRecord("a", [1, 0]), makeRecord("b", [0, 1])]);

		await store.clear();

		expect(await store.count()).toBe(0);
	});
});
