import { describe, expect, it } from "vitest";
import {
	EMBED_MAX_BATCH,
	type EmbedBatch,
	embedDocuments,
	embedQuery,
	embedTexts,
	type InputType,
} from "./embed.js";

/** A recording fake batch-embedder: returns deterministic finite vectors, logs each call. */
function fakeEmbed(dim = 4) {
	const calls: { size: number; inputType: InputType }[] = [];
	const fn: EmbedBatch = async (texts, inputType) => {
		calls.push({ size: texts.length, inputType });
		return texts.map((_, i) =>
			Array.from({ length: dim }, (_, d) => (i + d) / 10),
		);
	};
	return { fn, calls };
}

describe("embedTexts", () => {
	it("returns one vector per text", async () => {
		const { fn } = fakeEmbed(4);
		const vectors = await embedTexts(["a", "b", "c"], "document", {
			embed: fn,
		});
		expect(vectors).toHaveLength(3);
		expect(vectors[0]).toHaveLength(4);
	});

	it("returns an empty array for no texts (and never calls embed)", async () => {
		const { fn, calls } = fakeEmbed();
		expect(await embedTexts([], "document", { embed: fn })).toEqual([]);
		expect(calls).toHaveLength(0);
	});

	it("batches to the SDK's 128-input limit", async () => {
		// Arrange — 200 texts must split into 128 + 72
		const { fn, calls } = fakeEmbed();
		const texts = Array.from({ length: 200 }, (_, i) => `t${i}`);

		// Act
		const vectors = await embedTexts(texts, "document", { embed: fn });

		// Assert
		expect(vectors).toHaveLength(200);
		expect(calls.map((c) => c.size)).toEqual([EMBED_MAX_BATCH, 72]);
		expect(calls.every((c) => c.size <= EMBED_MAX_BATCH)).toBe(true);
	});

	it("rejects inconsistent vector dimensions", async () => {
		const fn: EmbedBatch = async () => [
			[1, 2, 3],
			[1, 2],
		];
		await expect(
			embedTexts(["a", "b"], "document", { embed: fn }),
		).rejects.toThrow(/inconsistent vector dimension/);
	});

	it("rejects non-finite values", async () => {
		const fn: EmbedBatch = async () => [[Number.NaN, 1]];
		await expect(embedTexts(["a"], "document", { embed: fn })).rejects.toThrow(
			/non-finite/,
		);
	});
});

describe("embedDocuments / embedQuery", () => {
	it("embedDocuments uses inputType 'document'", async () => {
		const { fn, calls } = fakeEmbed();
		await embedDocuments(["a", "b"], { embed: fn });
		expect(calls[0]!.inputType).toBe("document");
	});

	it("embedQuery uses inputType 'query' and returns a single vector", async () => {
		const { fn, calls } = fakeEmbed(4);
		const vector = await embedQuery("how will the election go?", { embed: fn });
		expect(calls[0]!.inputType).toBe("query");
		expect(vector).toHaveLength(4);
	});

	// Live — only runs with a real key.
	it.skipIf(!process.env.VOYAGE_API_KEY)(
		"embeds a real query to a 1024-dim finite vector",
		async () => {
			const vector = await embedQuery(
				"Will the Fed cut interest rates in 2026?",
			);
			expect(vector).toHaveLength(1024);
			expect(vector.every((x) => Number.isFinite(x))).toBe(true);
		},
		30_000,
	);
});
