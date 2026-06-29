/**
 * A Chunker turns one Evidence document into an ordered list of Chunks.
 *
 * The interface is deliberately tiny so the eval harness can iterate over a set of
 * chunkers — `[fixedChunker(), recursiveChunker(), ...]` — run each over the same
 * corpus, and let retrieval-recall pick the winner. The comparison IS the deliverable;
 * we don't hard-code a "best" strategy. `name` labels a chunker in those results.
 *
 * `chunk` must be PURE and deterministic: no I/O, no clock, no randomness. The same
 * Evidence in always yields the same Chunks out, which is what makes idempotent upsert
 * (stable ids) and reproducible evals possible.
 */
import type { Chunk, Evidence } from "@lykos/core";

export interface Chunker {
  /** Human-readable label, e.g. "fixed(512/64)" — used to tag comparison results. */
  readonly name: string;
  /** Split one document into ordered, non-empty chunks. */
  chunk(evidence: Evidence): Chunk[];
}
