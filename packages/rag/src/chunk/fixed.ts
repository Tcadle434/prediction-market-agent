/**
 * Fixed-size chunker: pack words into uniform ~`targetTokens` windows with a trailing
 * `overlapTokens` carried into the next window.
 *
 * The overlap is the point — it keeps a claim that straddles a window boundary intact in
 * at least one chunk, so retrieval doesn't miss it. Simplicity is the trade-off: windows
 * ignore sentence/paragraph structure (that's the recursive chunker's job). The eval
 * measures which trade wins.
 *
 * Words (whitespace-delimited) are the unit; token budget is the stop condition.
 */
import type { Chunk, Evidence } from "@lykos/core";
import { estimateTokens, toChunks } from "./common.js";
import type { Chunker } from "./types.js";

export interface FixedChunkerOptions {
	/** Target window size in (estimated) tokens. */
	targetTokens?: number;
	/** Trailing tokens carried from one window into the next. Must be < targetTokens. */
	overlapTokens?: number;
}

const DEFAULT_TARGET_TOKENS = 512;
const DEFAULT_OVERLAP_TOKENS = 64;

export function fixedChunker(options: FixedChunkerOptions = {}): Chunker {
	const targetTokens = options.targetTokens ?? DEFAULT_TARGET_TOKENS;
	const overlapTokens = options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;

	if (targetTokens <= 0) {
		throw new Error(
			`[RAG] fixedChunker: targetTokens must be > 0 (got ${targetTokens})`,
		);
	}
	if (overlapTokens < 0 || overlapTokens >= targetTokens) {
		throw new Error(
			`[RAG] fixedChunker: overlapTokens must be in [0, targetTokens) (got ${overlapTokens})`,
		);
	}

	return {
		name: `fixed(${targetTokens}/${overlapTokens})`,
		chunk(evidence: Evidence): Chunk[] {
			const words = evidence.content.split(/\s+/).filter((w) => w.length > 0);
			if (words.length === 0) return [];
			const costs = words.map((w) => Math.max(1, estimateTokens(w)));

			const pieces: string[] = [];
			let start = 0;
			while (start < words.length) {
				// Grow the window until the next word would exceed the budget (always take ≥1 word).
				let end = start;
				let tokens = 0;
				while (
					end < words.length &&
					(end === start || tokens + costs[end]! <= targetTokens)
				) {
					tokens += costs[end]!;
					end++;
				}
				pieces.push(words.slice(start, end).join(" "));
				if (end >= words.length) break;

				// Walk back from the window end to leave ~overlapTokens of trailing context.
				// `back > start + 1` guarantees the next window advances by at least one word.
				let back = end;
				let overlap = 0;
				while (back > start + 1 && overlap < overlapTokens) {
					back--;
					overlap += costs[back]!;
				}
				start = back;
			}
			return toChunks(evidence, pieces);
		},
	};
}
