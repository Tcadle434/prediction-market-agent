import { ChunkSchema, type Evidence } from "@lykos/core";
import { describe, expect, it } from "vitest";
import { buildChunk, estimateTokens, toChunks } from "./common.js";

function evidenceWith(content: string): Evidence {
	return {
		id: "ev1",
		url: "https://example.com/a",
		title: "Title",
		content,
		publishedAt: "2026-01-01T00:00:00Z",
		source: "tavily",
		searchScore: null,
	};
}

describe("estimateTokens", () => {
	it("returns 0 for blank input", () => {
		expect(estimateTokens("")).toBe(0);
		expect(estimateTokens("   \n  ")).toBe(0);
	});

	it("uses the ~4 chars/token heuristic, rounding up", () => {
		expect(estimateTokens("abcd")).toBe(1); // 4 chars
		expect(estimateTokens("abcde")).toBe(2); // 5 chars → ceil(5/4)
	});

	it("ignores surrounding whitespace", () => {
		expect(estimateTokens("  abcd  ")).toBe(1);
	});
});

describe("buildChunk", () => {
	it("derives a deterministic id and copies evidence fields", () => {
		// Arrange
		const evidence = evidenceWith("hello world");

		// Act
		const chunk = buildChunk(evidence, "hello world", 0);

		// Assert
		expect(chunk.id).toBe("ev1#0");
		expect(chunk.evidenceId).toBe("ev1");
		expect(chunk.index).toBe(0);
		expect(chunk.publishedAt).toBe("2026-01-01T00:00:00Z");
		expect(chunk.tokenCount).toBe(estimateTokens("hello world"));
		expect(() => ChunkSchema.parse(chunk)).not.toThrow();
	});
});

describe("toChunks", () => {
	it("drops blank pieces and assigns contiguous indices", () => {
		// Arrange
		const evidence = evidenceWith("");

		// Act
		const chunks = toChunks(evidence, ["first", "   ", "second", ""]);

		// Assert
		expect(chunks.map((c) => c.text)).toEqual(["first", "second"]);
		expect(chunks.map((c) => c.index)).toEqual([0, 1]);
		expect(chunks.map((c) => c.id)).toEqual(["ev1#0", "ev1#1"]);
	});

	it("trims each piece", () => {
		const chunks = toChunks(evidenceWith(""), ["  padded  "]);
		expect(chunks[0]!.text).toBe("padded");
	});
});
