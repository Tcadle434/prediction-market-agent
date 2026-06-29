import { ChunkSchema, type Evidence } from "@lykos/core";
import { describe, expect, it } from "vitest";
import { recursiveChunker } from "./recursive.js";

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

describe("recursiveChunker", () => {
	it("encodes its configuration in the name", () => {
		expect(recursiveChunker({ targetTokens: 256 }).name).toBe("recursive(256)");
	});

	it("returns a single chunk when the document fits the budget", () => {
		const chunks = recursiveChunker({ targetTokens: 100 }).chunk(
			evidenceWith("short text"),
		);
		expect(chunks).toHaveLength(1);
		expect(chunks[0]!.text).toBe("short text");
	});

	it("returns no chunks for blank content", () => {
		expect(recursiveChunker().chunk(evidenceWith("   "))).toEqual([]);
	});

	it("breaks on paragraph boundaries when whole paragraphs fit", () => {
		// Arrange — three ~6-token paragraphs; any two together exceed a 10-token budget
		const p1 = "alpha bravo charlie delta";
		const p2 = "echo foxtrot golf hotel";
		const p3 = "india juliet kilo lima";
		const content = [p1, p2, p3].join("\n\n");

		// Act
		const chunks = recursiveChunker({ targetTokens: 10 }).chunk(
			evidenceWith(content),
		);

		// Assert — each paragraph lands in its own chunk, structure preserved
		expect(chunks.map((c) => c.text)).toEqual([p1, p2, p3]);
	});

	it("recurses into an oversized paragraph and stays within budget", () => {
		// Arrange — one paragraph, several sentences, no blank-line breaks
		const content = "alpha alpha. bravo bravo. charlie charlie. delta delta.";
		const targetTokens = 5;

		// Act
		const chunks = recursiveChunker({ targetTokens }).chunk(
			evidenceWith(content),
		);

		// Assert
		expect(chunks.length).toBeGreaterThan(1);
		for (const chunk of chunks) {
			expect(chunk.tokenCount).toBeLessThanOrEqual(targetTokens);
		}
	});

	it("merges small adjacent pieces instead of over-fragmenting", () => {
		// Arrange — 40 tiny single-token lines under a generous budget
		const content = Array.from({ length: 40 }, () => "xx").join("\n");

		// Act
		const chunks = recursiveChunker({ targetTokens: 10 }).chunk(
			evidenceWith(content),
		);

		// Assert — far fewer chunks than lines, but more than one
		expect(chunks.length).toBeGreaterThan(1);
		expect(chunks.length).toBeLessThan(40);
	});

	it("produces schema-valid chunks with sequential ids", () => {
		const content = [
			"alpha bravo charlie delta",
			"echo foxtrot golf hotel",
			"india juliet kilo lima",
		].join("\n\n");
		const chunks = recursiveChunker({ targetTokens: 10 }).chunk(
			evidenceWith(content),
		);
		chunks.forEach((chunk, i) => {
			expect(() => ChunkSchema.parse(chunk)).not.toThrow();
			expect(chunk.id).toBe(`ev1#${i}`);
			expect(chunk.index).toBe(i);
		});
	});

	it("is deterministic", () => {
		const chunker = recursiveChunker({ targetTokens: 8 });
		const evidence = evidenceWith(
			"alpha bravo. charlie delta. echo foxtrot. golf hotel india.",
		);
		expect(chunker.chunk(evidence)).toEqual(chunker.chunk(evidence));
	});

	it("rejects a non-positive target", () => {
		expect(() => recursiveChunker({ targetTokens: 0 })).toThrow(/targetTokens/);
	});
});
