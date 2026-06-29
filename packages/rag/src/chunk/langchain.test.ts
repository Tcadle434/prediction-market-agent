import { ChunkSchema, type Evidence } from "@lykos/core";
import { getEncoding } from "js-tiktoken";
import { describe, expect, it } from "vitest";
import {
	langchainRecursiveChunker,
	langchainTokenChunker,
} from "./langchain.js";

const encoding = getEncoding("cl100k_base");
const tok = (text: string): number => encoding.encode(text).length;

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

// Three structured paragraphs for the recursive splitter to find boundaries in.
const ARTICLE = [
	"The incumbent leads the challenger by four points in the latest national poll.",
	"Markets moved sharply after the surprise announcement late on Tuesday evening.",
	"Analysts now expect the central bank to hold rates steady through the summer months.",
].join("\n\n");

describe("langchainRecursiveChunker", () => {
	it("encodes its configuration in the name", () => {
		expect(
			langchainRecursiveChunker({ targetTokens: 256, overlapTokens: 32 }).name,
		).toBe("langchain-recursive(256/32)");
	});

	it("returns no chunks for blank content", async () => {
		expect(
			await langchainRecursiveChunker().chunk(evidenceWith("   ")),
		).toEqual([]);
	});

	it("returns a single chunk when the document fits the budget", async () => {
		const chunks = await langchainRecursiveChunker({ targetTokens: 512 }).chunk(
			evidenceWith("short text"),
		);
		expect(chunks).toHaveLength(1);
		expect(chunks[0]!.text).toBe("short text");
	});

	it("keeps every chunk within the real-token budget and records real token counts", async () => {
		const targetTokens = 16;
		const chunks = await langchainRecursiveChunker({
			targetTokens,
			overlapTokens: 4,
		}).chunk(evidenceWith(ARTICLE));
		expect(chunks.length).toBeGreaterThan(1);
		for (const chunk of chunks) {
			expect(tok(chunk.text)).toBeLessThanOrEqual(targetTokens);
			expect(chunk.tokenCount).toBe(tok(chunk.text)); // tokenCount = REAL tokens, not chars/4
		}
	});

	it("produces schema-valid chunks with sequential ids", async () => {
		const chunks = await langchainRecursiveChunker({
			targetTokens: 16,
			overlapTokens: 0,
		}).chunk(evidenceWith(ARTICLE));
		chunks.forEach((chunk, i) => {
			expect(() => ChunkSchema.parse(chunk)).not.toThrow();
			expect(chunk.id).toBe(`ev1#${i}`);
			expect(chunk.index).toBe(i);
		});
	});

	it("rejects an overlap that is not smaller than the target", () => {
		expect(() =>
			langchainRecursiveChunker({ targetTokens: 16, overlapTokens: 16 }),
		).toThrow(/overlapTokens/);
	});

	it("is deterministic", async () => {
		const chunker = langchainRecursiveChunker({
			targetTokens: 16,
			overlapTokens: 4,
		});
		const evidence = evidenceWith(ARTICLE);
		expect(await chunker.chunk(evidence)).toEqual(
			await chunker.chunk(evidence),
		);
	});
});

describe("langchainTokenChunker", () => {
	it("encodes its configuration in the name", () => {
		expect(
			langchainTokenChunker({ targetTokens: 256, overlapTokens: 32 }).name,
		).toBe("langchain-token(256/32)");
	});

	it("returns no chunks for blank content", async () => {
		expect(await langchainTokenChunker().chunk(evidenceWith(""))).toEqual([]);
	});

	it("packs text into exact token windows within budget", async () => {
		const targetTokens = 16;
		const chunks = await langchainTokenChunker({
			targetTokens,
			overlapTokens: 4,
		}).chunk(evidenceWith(ARTICLE));
		expect(chunks.length).toBeGreaterThan(1);
		for (const chunk of chunks) {
			expect(tok(chunk.text)).toBeLessThanOrEqual(targetTokens);
		}
	});

	it("produces schema-valid chunks with sequential ids", async () => {
		const chunks = await langchainTokenChunker({
			targetTokens: 16,
			overlapTokens: 0,
		}).chunk(evidenceWith(ARTICLE));
		chunks.forEach((chunk, i) => {
			expect(() => ChunkSchema.parse(chunk)).not.toThrow();
			expect(chunk.id).toBe(`ev1#${i}`);
		});
	});

	it("is deterministic", async () => {
		const chunker = langchainTokenChunker({
			targetTokens: 16,
			overlapTokens: 4,
		});
		const evidence = evidenceWith(ARTICLE);
		expect(await chunker.chunk(evidence)).toEqual(
			await chunker.chunk(evidence),
		);
	});
});
