import { ChunkSchema, type Evidence } from "@lykos/core";
import { describe, expect, it } from "vitest";
import { fixedChunker } from "./fixed.js";

function evidenceWith(content: string): Evidence {
	return {
		id: "ev1",
		url: "https://example.com/a",
		title: "Title",
		content,
		publishedAt: null,
		source: "tavily",
		searchScore: null,
	};
}

/** N short words ("w0 w1 …"), each estimated at 1 token, so windows are easy to reason about. */
function nWords(n: number): string {
	return Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
}

describe("fixedChunker", () => {
	it("encodes its configuration in the name", () => {
		expect(fixedChunker({ targetTokens: 256, overlapTokens: 32 }).name).toBe(
			"fixed(256/32)",
		);
	});

	it("returns a single chunk when the document fits in one window", async () => {
		const chunks = await fixedChunker({ targetTokens: 100 }).chunk(
			evidenceWith(nWords(5)),
		);
		expect(chunks).toHaveLength(1);
		expect(chunks[0]!.text).toBe(nWords(5));
	});

	it("returns no chunks for blank content", async () => {
		expect(await fixedChunker().chunk(evidenceWith("   \n  "))).toEqual([]);
	});

	it("partitions words with no repetition when overlap is 0", async () => {
		// Arrange — 25 one-token words, 10-token windows
		const chunker = fixedChunker({ targetTokens: 10, overlapTokens: 0 });

		// Act
		const chunks = await chunker.chunk(evidenceWith(nWords(25)));

		// Assert — concatenating the chunks reproduces the original word sequence exactly
		const rejoined = chunks.map((c) => c.text).join(" ");
		expect(rejoined).toBe(nWords(25));
		expect(chunks.length).toBeGreaterThan(1);
	});

	it("carries trailing words into the next window when overlap > 0", async () => {
		// Arrange
		const chunker = fixedChunker({ targetTokens: 10, overlapTokens: 4 });

		// Act
		const chunks = await chunker.chunk(evidenceWith(nWords(25)));

		// Assert — the start of chunk 1 repeats the tail of chunk 0
		const tail0 = chunks[0]!.text.split(" ").slice(-4);
		const head1 = chunks[1]!.text.split(" ").slice(0, 4);
		expect(head1).toEqual(tail0);
	});

	it("keeps every chunk within the token budget", async () => {
		const targetTokens = 10;
		const chunks = await fixedChunker({ targetTokens, overlapTokens: 2 }).chunk(
			evidenceWith(nWords(50)),
		);
		for (const chunk of chunks) {
			expect(chunk.tokenCount).toBeLessThanOrEqual(targetTokens);
		}
	});

	it("produces schema-valid chunks with sequential ids", async () => {
		const chunks = await fixedChunker({
			targetTokens: 10,
			overlapTokens: 0,
		}).chunk(evidenceWith(nWords(30)));
		chunks.forEach((chunk, i) => {
			expect(() => ChunkSchema.parse(chunk)).not.toThrow();
			expect(chunk.id).toBe(`ev1#${i}`);
			expect(chunk.index).toBe(i);
		});
	});

	it("is deterministic", async () => {
		const chunker = fixedChunker({ targetTokens: 10, overlapTokens: 3 });
		const evidence = evidenceWith(nWords(40));
		expect(await chunker.chunk(evidence)).toEqual(
			await chunker.chunk(evidence),
		);
	});

	it("rejects an overlap that is not smaller than the target", () => {
		expect(() => fixedChunker({ targetTokens: 10, overlapTokens: 10 })).toThrow(
			/overlapTokens/,
		);
	});
});
