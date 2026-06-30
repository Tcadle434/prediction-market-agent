/**
 * Recency weighting for retrieval.
 *
 * Fresh news matters for forecasting, so after relevance ranking we down-weight stale passages
 * with an exponential time decay: a chunk loses half its weight every `halfLifeDays`. The final
 * ranking multiplies relevance (the rerank score, or vector similarity if not reranked) by this
 * recency weight, so a passage must be BOTH relevant and reasonably fresh to rank high.
 *
 * `nowMs` is passed in, so these functions are pure and deterministic.
 */
import type { RetrievedChunk } from "@lykos/core";

const MS_PER_DAY = 86_400_000;
const DEFAULT_HALF_LIFE_DAYS = 14;

/**
 * Exponential recency weight in (0, 1]. Returns 1 for an unknown/unparseable/future date — we
 * don't penalize a passage just because its publish date is missing — and halves every
 * `halfLifeDays` of age.
 */
export function recencyWeight(
	publishedAt: string | null,
	nowMs: number,
	halfLifeDays: number = DEFAULT_HALF_LIFE_DAYS,
): number {
	if (!publishedAt) return 1;
	const publishedMs = Date.parse(publishedAt);
	if (Number.isNaN(publishedMs)) return 1;
	const ageDays = (nowMs - publishedMs) / MS_PER_DAY;
	if (ageDays <= 0) return 1;
	return 0.5 ** (ageDays / halfLifeDays);
}

/** Relevance signal for a retrieved chunk: the rerank score if present, else vector similarity. */
function relevanceOf(chunk: RetrievedChunk): number {
	return chunk.rerankScore ?? chunk.similarity;
}

/**
 * Reorder retrieved chunks best-first by recency-adjusted relevance (relevance × recencyWeight).
 * Pure: returns a new array, input untouched.
 */
export function reorderByRecency(
	chunks: RetrievedChunk[],
	nowMs: number,
	halfLifeDays: number = DEFAULT_HALF_LIFE_DAYS,
): RetrievedChunk[] {
	return [...chunks].sort(
		(a, b) =>
			relevanceOf(b) * recencyWeight(b.publishedAt, nowMs, halfLifeDays) -
			relevanceOf(a) * recencyWeight(a.publishedAt, nowMs, halfLifeDays),
	);
}
