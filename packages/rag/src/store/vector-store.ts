/**
 * The storage seam for the RAG pipeline.
 *
 * Embedded chunks are written through `upsert` and read back by similarity through
 * `query`. Everything downstream (retrieval, the agent) depends on THIS interface,
 * never on Postgres/pgvector directly — so we can run the whole pipeline against an
 * in-memory store in tests and swap in pgvector in production with no caller changes.
 *
 * `marketId` is an OPTIONAL tag on the stored record, not a field on the core `Chunk`.
 * That keeps `@lykos/core` storage-agnostic while still supporting two retrieval modes:
 *   • scoped     — pass `marketId` in the query to restrict to one market's evidence.
 *   • cross-market — omit it to search the whole reusable corpus (dedup + reuse).
 */
import type { Chunk } from "@lykos/core";

/** A chunk plus its embedding vector, ready to persist. */
export interface VectorRecord {
  chunk: Chunk;
  embedding: number[];
  /** Which market's search surfaced this chunk. Omitted for shared/global evidence. */
  marketId?: string;
}

/** A stored chunk returned by similarity search, with its score. */
export interface VectorHit {
  chunk: Chunk;
  /** Cosine similarity to the query embedding, in [-1, 1]; higher = closer. */
  similarity: number;
}

/** A nearest-neighbour query against the store. */
export interface VectorQuery {
  embedding: number[];
  topK: number;
  /** Restrict to one market's chunks. Omit to search the whole cross-market corpus. */
  marketId?: string;
}

/**
 * A store of embedded chunks supporting nearest-neighbour retrieval.
 * Implementations: {@link InMemoryVectorStore} (tests) and a pgvector store (production).
 */
export interface VectorStore {
  /** Insert or replace records, keyed by `chunk.id`. */
  upsert(records: VectorRecord[]): Promise<void>;
  /** Return up to `topK` chunks most similar to the query embedding, best first. */
  query(query: VectorQuery): Promise<VectorHit[]>;
  /** Remove all records (test/reset helper). */
  clear(): Promise<void>;
  /** Number of records currently stored. */
  count(): Promise<number>;
}
