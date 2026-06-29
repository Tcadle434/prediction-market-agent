/**
 * Shared chunk-building helpers used by every Chunker.
 *
 * `estimateTokens` is the DEFAULT token-counting seam: a cheap, dependency-free
 * ~4-characters-per-token heuristic. Chunk sizing only needs the right ballpark for the
 * hand-rolled chunkers, and the embedding step (Voyage) reports EXACT token usage when
 * precision actually matters. The LangChain chunkers pass a REAL tiktoken counter into
 * `buildChunk`/`toChunks` instead (see langchain.ts) — which is why `countTokens` is a
 * parameter, not hard-wired.
 */
import type { Chunk, Evidence } from "@lykos/core";

/** Rough bytes-per-token ratio for English text; good enough for size targeting. */
export const CHARS_PER_TOKEN = 4;

/** Counts (or estimates) the number of tokens in a string. */
export type TokenCounter = (text: string) => number;

/** Default token counter: the ~4-characters-per-token heuristic. Returns 0 for blank input. */
export function estimateTokens(text: string): number {
	const trimmed = text.trim();
	if (trimmed.length === 0) return 0;
	return Math.ceil(trimmed.length / CHARS_PER_TOKEN);
}

/** Build one Chunk from a piece of text at a given position within its Evidence. */
export function buildChunk(
	evidence: Evidence,
	text: string,
	index: number,
	countTokens: TokenCounter = estimateTokens,
): Chunk {
	return {
		id: `${evidence.id}#${index}`,
		evidenceId: evidence.id,
		text,
		index,
		tokenCount: countTokens(text),
		publishedAt: evidence.publishedAt, // copied down so retrieval can time-decay without a join
	};
}

/**
 * Turn raw text pieces into Chunks: trim each, drop blanks, and assign contiguous
 * indices. Chunkers produce `string[]` and delegate all Chunk bookkeeping here (DRY).
 * Pass `countTokens` to record real token counts (the LangChain chunkers do).
 */
export function toChunks(
	evidence: Evidence,
	pieces: string[],
	countTokens: TokenCounter = estimateTokens,
): Chunk[] {
	const chunks: Chunk[] = [];
	for (const piece of pieces) {
		const text = piece.trim();
		if (text.length === 0) continue;
		chunks.push(buildChunk(evidence, text, chunks.length, countTokens));
	}
	return chunks;
}
