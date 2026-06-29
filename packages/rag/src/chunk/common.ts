/**
 * Shared chunk-building helpers used by every Chunker.
 *
 * `estimateTokens` is the single token-counting seam: a cheap, dependency-free
 * ~4-characters-per-token heuristic. Chunk sizing only needs the right ballpark, and
 * the embedding step (Voyage) reports EXACT token usage when precision actually matters.
 * Swap a real tokenizer in here if we ever need exactness — nothing else changes.
 */
import type { Chunk, Evidence } from "@lykos/core";

/** Rough bytes-per-token ratio for English text; good enough for size targeting. */
export const CHARS_PER_TOKEN = 4;

/** Approximate the token count of a string. Returns 0 for blank input. */
export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return Math.ceil(trimmed.length / CHARS_PER_TOKEN);
}

/** Build one Chunk from a piece of text at a given position within its Evidence. */
export function buildChunk(evidence: Evidence, text: string, index: number): Chunk {
  return {
    id: `${evidence.id}#${index}`,
    evidenceId: evidence.id,
    text,
    index,
    tokenCount: estimateTokens(text),
    publishedAt: evidence.publishedAt, // copied down so retrieval can time-decay without a join
  };
}

/**
 * Turn raw text pieces into Chunks: trim each, drop blanks, and assign contiguous
 * indices. Chunkers produce `string[]` and delegate all Chunk bookkeeping here (DRY).
 */
export function toChunks(evidence: Evidence, pieces: string[]): Chunk[] {
  const chunks: Chunk[] = [];
  for (const piece of pieces) {
    const text = piece.trim();
    if (text.length === 0) continue;
    chunks.push(buildChunk(evidence, text, chunks.length));
  }
  return chunks;
}
