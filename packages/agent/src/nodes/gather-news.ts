import type { Evidence, RetrievedChunk } from "@lykos/core";
import {
	type Chunker,
	type EmbedBatch,
	InMemoryVectorStore,
	indexEvidence,
	type RerankFn,
	recursiveChunker,
	retrieve,
	searchEvidence,
	type VectorStore,
} from "@lykos/rag";
import type { RetrievedPassage } from "../passage.js";
import type { AgentNode } from "../state.js";

/** Search seam: question → source documents. Live default is rag's Tavily-backed searchEvidence. */
export type SearchEvidenceFn = (question: string) => Promise<Evidence[]>;

export interface GatherNewsDeps {
	/** Find source documents for the question. Default: live Tavily searchEvidence. */
	search?: SearchEvidenceFn;
	/** Where evidence is indexed + retrieved from. Default: a fresh in-memory store per run. */
	store?: VectorStore;
	/** How documents are split into chunks. Default: recursiveChunker(). */
	chunker?: Chunker;
	/** Batch-embed seam (used for both indexing and the query). Default: live Voyage. */
	embed?: EmbedBatch;
	/** Rerank seam. Default: live Voyage. */
	rerank?: RerankFn;
	/** Final passages to keep. */
	topK?: number;
	/** Candidates to over-fetch from the store before reranking. */
	candidateK?: number;
}

/**
 * Join retrieved chunks back to their source Evidence to produce citable passages. `retrieve()`
 * returns bare chunks (the store doesn't keep the url); each chunk knows its `evidenceId`, so we
 * look the Evidence up and carry its url + title forward. A chunk whose Evidence isn't in the batch
 * is dropped (defensive — shouldn't happen, since we indexed exactly this evidence).
 */
export function toPassages(
	chunks: RetrievedChunk[],
	evidence: Evidence[],
): RetrievedPassage[] {
	const byId = new Map(evidence.map((doc) => [doc.id, doc]));
	const passages: RetrievedPassage[] = [];
	for (const chunk of chunks) {
		const doc = byId.get(chunk.evidenceId);
		if (!doc) continue;
		passages.push({ ...chunk, url: doc.url, title: doc.title });
	}
	return passages;
}

/**
 * gatherNews node — the P1 retrieval loop as a graph node.
 *
 * searchEvidence (Tavily) → indexEvidence (chunk + embed → store) → retrieve (embed query → vector
 * KNN → rerank → recency), then enrich the retrieved chunks with their source url/title so the
 * forecast node can cite them. Everything is injectable (search, store, chunker, embed, rerank) so
 * it runs offline in tests; live defaults use Tavily + Voyage and a fresh in-memory store per run
 * (a single forecast indexes and retrieves its own evidence — no cross-run persistence needed).
 */
export function createGatherNewsNode(deps: GatherNewsDeps = {}): AgentNode {
	const search = deps.search ?? ((question) => searchEvidence(question));
	const chunker = deps.chunker ?? recursiveChunker();

	return async (state) => {
		const { market } = state;
		const store = deps.store ?? new InMemoryVectorStore();

		const evidence = await search(market.question);
		if (evidence.length === 0) return { news: [] };

		await indexEvidence(evidence, {
			store,
			chunker,
			marketId: market.id,
			embed: deps.embed,
		});
		const chunks = await retrieve(market.question, {
			store,
			marketId: market.id,
			topK: deps.topK,
			candidateK: deps.candidateK,
			embed: deps.embed,
			rerankFn: deps.rerank,
		});
		return { news: toPassages(chunks, evidence) };
	};
}
