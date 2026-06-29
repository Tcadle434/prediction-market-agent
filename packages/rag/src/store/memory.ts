/**
 * In-memory {@link VectorStore} — the reference implementation.
 *
 * Backs fast, deterministic, secret-free tests and small local runs. It computes true
 * cosine similarity (no assumption that embeddings are unit-normalised), so it stays
 * correct for any embedder. The pgvector store must match its observable behaviour.
 */
import type { VectorStore, VectorRecord, VectorHit, VectorQuery } from "./vector-store.js";

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

/** Cosine similarity of two equal-length vectors, in [-1, 1]. Returns 0 for a zero vector. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`[RAG] cosineSimilarity: dimension mismatch (${a.length} vs ${b.length})`);
  }
  const denom = Math.sqrt(dot(a, a)) * Math.sqrt(dot(b, b));
  return denom === 0 ? 0 : dot(a, b) / denom;
}

export class InMemoryVectorStore implements VectorStore {
  /** Keyed by `chunk.id` so re-upserting the same chunk replaces it (idempotent). */
  private readonly records = new Map<string, VectorRecord>();

  async upsert(records: VectorRecord[]): Promise<void> {
    for (const record of records) {
      this.records.set(record.chunk.id, record);
    }
  }

  async query({ embedding, topK, marketId }: VectorQuery): Promise<VectorHit[]> {
    const hits: VectorHit[] = [];
    for (const record of this.records.values()) {
      if (marketId !== undefined && record.marketId !== marketId) continue;
      hits.push({
        chunk: record.chunk,
        similarity: cosineSimilarity(embedding, record.embedding),
      });
    }
    hits.sort((a, b) => b.similarity - a.similarity);
    return hits.slice(0, topK);
  }

  async clear(): Promise<void> {
    this.records.clear();
  }

  async count(): Promise<number> {
    return this.records.size;
  }
}
