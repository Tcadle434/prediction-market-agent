/**
 * The index side of the RAG pipeline: Evidence → Chunks → embeddings → VectorStore.
 *
 * Pairs with retrieve.ts (the query side). Together they are the full two-stage loop:
 *   searchEvidence(question)  →  indexEvidence(evidence, …)  →  retrieve(question, …)
 *
 * Chunks every document with the chosen Chunker, embeds the chunk texts as "document" vectors,
 * tags them with an optional marketId, and upserts them. The chunker, embedder, and store are
 * all injected, so the whole thing runs offline in tests.
 */
import type { Chunk, Evidence } from "@lykos/core";
import type { Chunker } from "./chunk/types.js";
import { cleanMarkdown } from "./clean.js";
import { type EmbedBatch, embedDocuments } from "./embed.js";
import type { VectorRecord, VectorStore } from "./store/vector-store.js";

export interface IndexEvidenceOptions {
	/** Where the embedded chunks are stored. */
	store: VectorStore;
	/** How documents are split into chunks. */
	chunker: Chunker;
	/** Tag every record with this market id (enables scoped retrieval). */
	marketId?: string;
	/** Inject the batch-embed fn for offline tests; defaults to the live Voyage client. */
	embed?: EmbedBatch;
}

/**
 * Chunk, embed, and upsert a batch of Evidence into the store. Returns the number of chunks
 * indexed. Idempotent: re-indexing the same Evidence replaces its chunks (stable chunk ids).
 */
export async function indexEvidence(
	evidence: Evidence[],
	options: IndexEvidenceOptions,
): Promise<number> {
	const { store, chunker, marketId } = options;

	const chunks: Chunk[] = [];
	for (const doc of evidence) {
		// Strip page boilerplate (nav/link lists) before chunking — see clean.ts / roadmap D14.
		const cleaned: Evidence = { ...doc, content: cleanMarkdown(doc.content) };
		chunks.push(...(await chunker.chunk(cleaned)));
	}
	if (chunks.length === 0) return 0;

	const vectors = await embedDocuments(
		chunks.map((chunk) => chunk.text),
		{ embed: options.embed },
	);

	const records: VectorRecord[] = chunks.map((chunk, i) => ({
		chunk,
		embedding: vectors[i]!,
		marketId,
	}));
	await store.upsert(records);
	return chunks.length;
}
