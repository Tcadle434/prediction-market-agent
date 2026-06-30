/**
 * Stage-2 retrieval orchestration: a question → grounded passages.
 *
 * Flow: embed the question ("query" input type) → over-fetch the nearest chunks from the
 * VectorStore → rerank them all against the question with Voyage → reorder by recency-adjusted
 * relevance → return the top K. Reranking the full candidate set (not just the final K) lets
 * recency influence which passages make the cut, not merely their order.
 *
 * Every external call (embed, rerank) is injectable, and the store is passed in, so the whole
 * flow runs offline in tests with an InMemoryVectorStore + fakes.
 */
import type { RetrievedChunk } from "@lykos/core";
import { type EmbedBatch, embedQuery } from "./embed.js";
import { reorderByRecency } from "./recency.js";
import { type RerankFn, rerank } from "./rerank.js";
import type { VectorStore } from "./store/vector-store.js";

const DEFAULT_TOP_K = 8;
const DEFAULT_CANDIDATE_K = 30;

export interface RetrieveOptions {
	/** The corpus to search. */
	store: VectorStore;
	/** Final number of passages to return. */
	topK?: number;
	/** How many nearest chunks to over-fetch from the store before reranking. */
	candidateK?: number;
	/** Restrict to one market's chunks; omit to search the whole corpus. */
	marketId?: string;
	/** Current time (ms) for recency weighting. Defaults to now. */
	nowMs?: number;
	/** Recency half-life in days. */
	halfLifeDays?: number;
	/** Inject the batch-embed fn for offline tests; defaults to the live Voyage client. */
	embed?: EmbedBatch;
	/** Inject the rerank fn for offline tests; defaults to the live Voyage client. */
	rerankFn?: RerankFn;
}

/**
 * Retrieve the most relevant, reasonably-fresh passages for a question. Returns up to `topK`
 * RetrievedChunks, best-first, each carrying its vector `similarity` and `rerankScore`.
 */
export async function retrieve(
	question: string,
	options: RetrieveOptions,
): Promise<RetrievedChunk[]> {
	const {
		store,
		topK = DEFAULT_TOP_K,
		candidateK = DEFAULT_CANDIDATE_K,
		marketId,
		halfLifeDays,
	} = options;
	const nowMs = options.nowMs ?? Date.now();

	const queryVector = await embedQuery(question, { embed: options.embed });
	const hits = await store.query({
		embedding: queryVector,
		topK: candidateK,
		marketId,
	});
	if (hits.length === 0) return [];

	const candidates: RetrievedChunk[] = hits.map((hit) => ({
		...hit.chunk,
		similarity: hit.similarity,
		rerankScore: null,
	}));

	const reranked = await rerank(question, candidates, {
		rerank: options.rerankFn,
	});
	return reorderByRecency(reranked, nowMs, halfLifeDays).slice(0, topK);
}
