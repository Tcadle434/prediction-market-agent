import type { RetrievedChunk } from "@lykos/core";
import { describe, expect, it } from "vitest";
import { type RerankFn, rerank } from "./rerank.js";

function candidate(
	id: string,
	text: string,
	similarity: number,
): RetrievedChunk {
	return {
		id,
		evidenceId: "ev",
		text,
		index: 0,
		tokenCount: 1,
		publishedAt: null,
		similarity,
		rerankScore: null,
	};
}

describe("rerank", () => {
	it("reorders best-first, attaches rerankScore, and preserves similarity", async () => {
		// Arrange — vector order is c0,c1,c2; reranker prefers c2 > c0 > c1
		const candidates = [
			candidate("c0", "alpha", 0.7),
			candidate("c1", "bravo", 0.6),
			candidate("c2", "charlie", 0.5),
		];
		const rerankFn: RerankFn = async () => [
			{ index: 2, relevanceScore: 0.95 },
			{ index: 0, relevanceScore: 0.55 },
			{ index: 1, relevanceScore: 0.12 },
		];

		// Act
		const out = await rerank("q", candidates, { rerank: rerankFn });

		// Assert
		expect(out.map((c) => c.id)).toEqual(["c2", "c0", "c1"]);
		expect(out.map((c) => c.rerankScore)).toEqual([0.95, 0.55, 0.12]);
		expect(out[0]!.similarity).toBe(0.5); // c2's original vector similarity, untouched
	});

	it("returns an empty array for no candidates", async () => {
		const rerankFn: RerankFn = async () => [{ index: 0, relevanceScore: 1 }];
		expect(await rerank("q", [], { rerank: rerankFn })).toEqual([]);
	});

	it("throws when a result index is out of range", async () => {
		const rerankFn: RerankFn = async () => [{ index: 9, relevanceScore: 0.9 }];
		await expect(
			rerank("q", [candidate("c0", "x", 0.5)], { rerank: rerankFn }),
		).rejects.toThrow(/out of range/);
	});

	it("trims to topK", async () => {
		const candidates = [
			candidate("c0", "a", 0.5),
			candidate("c1", "b", 0.5),
			candidate("c2", "c", 0.5),
		];
		const rerankFn: RerankFn = async () => [
			{ index: 0, relevanceScore: 0.9 },
			{ index: 1, relevanceScore: 0.8 },
			{ index: 2, relevanceScore: 0.7 },
		];
		const out = await rerank("q", candidates, { rerank: rerankFn, topK: 2 });
		expect(out.map((c) => c.id)).toEqual(["c0", "c1"]);
	});

	// Live — only runs with a real key.
	it.skipIf(!process.env.VOYAGE_API_KEY)(
		"reranks real documents by relevance",
		async () => {
			const candidates = [
				candidate(
					"fed",
					"The Federal Reserve held interest rates steady in June.",
					0.5,
				),
				candidate("cake", "A simple recipe for a chocolate layer cake.", 0.5),
				candidate(
					"cut",
					"Economists now expect the Fed to cut rates this year.",
					0.5,
				),
			];
			const out = await rerank("Will the Fed cut interest rates?", candidates, {
				topK: 2,
			});
			expect(out).toHaveLength(2);
			expect(out[0]!.rerankScore).not.toBeNull();
			expect(out.map((c) => c.id)).not.toContain("cake");
		},
		30_000,
	);
});
