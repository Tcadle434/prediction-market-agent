/**
 * Voyage reranking — the precision step after vector top-k.
 *
 * Two-stage retrieval over-fetches with cheap vector similarity (Stage 2a), then a cross-encoder
 * reranker re-scores the candidates against the query for a sharper final ordering (Stage 2b).
 * We attach the score to RetrievedChunk.rerankScore and reorder best-first; similarity from the
 * vector stage is preserved.
 *
 * Config: model "rerank-2.5" (32K context). Voyage returns results sorted best-first, each with
 * an `index` back into the input documents. Conventions mirror embed.ts/search.ts: typed SDK +
 * validate our own output, [RAG]-prefixed errors, required(VOYAGE_API_KEY) only at live-client
 * build, and an injectable rerank function so tests run offline.
 */
import { loadConfig, type RetrievedChunk, required } from "@lykos/core";
import { VoyageAIClient } from "voyageai";

const DEFAULT_RERANK_MODEL = "rerank-2.5";

/** One rerank result: the index into the input documents, plus its relevance score. */
export interface RerankHit {
	index: number;
	relevanceScore: number;
}

/** Reranks documents against a query → hits sorted best-first. Injected in tests. */
export type RerankFn = (
	query: string,
	documents: string[],
	topK?: number,
) => Promise<RerankHit[]>;

export interface RerankOptions {
	/** Voyage rerank model. */
	model?: string;
	/** Keep only the top-K reranked candidates. */
	topK?: number;
	/** Inject a rerank function for offline tests; defaults to the live Voyage client. */
	rerank?: RerankFn;
}

/** Build the live rerank function. Reads the key only here (not on import). */
function createLiveRerank(model: string): RerankFn {
	const apiKey = required(loadConfig().VOYAGE_API_KEY, "VOYAGE_API_KEY");
	const client = new VoyageAIClient({ apiKey });
	return async (query, documents, topK) => {
		const res = await client.rerank({
			query,
			documents,
			model,
			topK,
			returnDocuments: false,
			truncation: true,
		});
		const data = res.data ?? [];
		return data.map((item) => {
			if (item.index == null || item.relevanceScore == null) {
				throw new Error(
					"[RAG] Voyage rerank: malformed item (missing index or relevanceScore)",
				);
			}
			return { index: item.index, relevanceScore: item.relevanceScore };
		});
	};
}

/**
 * Rerank Stage-1 candidates by relevance to the query: attaches `rerankScore`, reorders best-first
 * (Voyage's order), and preserves each chunk's vector `similarity`. `topK` trims the result.
 */
export async function rerank(
	query: string,
	candidates: RetrievedChunk[],
	options: RerankOptions = {},
): Promise<RetrievedChunk[]> {
	if (candidates.length === 0) return [];
	const model = options.model ?? DEFAULT_RERANK_MODEL;
	const rerankFn = options.rerank ?? createLiveRerank(model);

	const hits = await rerankFn(
		query,
		candidates.map((c) => c.text),
		options.topK,
	);

	const reranked: RetrievedChunk[] = [];
	for (const hit of hits) {
		const base = candidates[hit.index];
		if (!base)
			throw new Error(`[RAG] rerank: result index ${hit.index} out of range`);
		reranked.push({ ...base, rerankScore: hit.relevanceScore });
	}
	return options.topK == null ? reranked : reranked.slice(0, options.topK);
}
