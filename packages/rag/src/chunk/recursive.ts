/**
 * Recursive, structure-aware chunker (the classic RAG splitter).
 *
 * It tries to break text on the COARSEST natural boundary first — paragraphs, then lines,
 * then sentences, then words — falling to a finer separator only for pieces that are still
 * over budget, and finally to a hard character split if nothing else fits. Adjacent small
 * pieces are then merged back up toward `targetTokens` so we don't emit one-sentence chunks.
 *
 * The payoff vs. the fixed chunker: chunks respect meaning boundaries, so a passage is less
 * likely to be cut mid-thought. The trade-off: no overlap, and the rejoin separator at merge
 * time is approximate. The eval decides which strategy retrieves better.
 */
import type { Chunk, Evidence } from "@lykos/core";
import type { Chunker } from "./types.js";
import { CHARS_PER_TOKEN, estimateTokens, toChunks } from "./common.js";

export interface RecursiveChunkerOptions {
  /** Target chunk size in (estimated) tokens. */
  targetTokens?: number;
  /** Separator hierarchy, coarsest first. The final fallback is always a hard char split. */
  separators?: string[];
}

const DEFAULT_TARGET_TOKENS = 512;
const DEFAULT_SEPARATORS = ["\n\n", "\n", ". ", " "];

/** Last-resort split into fixed character windows when no separator helps. */
function hardSplitByChars(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    out.push(text.slice(i, i + maxChars));
  }
  return out;
}

/** Greedily merge adjacent parts up to the token budget, rejoining with `separator`. */
function mergeAdjacent(parts: string[], separator: string, targetTokens: number): string[] {
  const merged: string[] = [];
  let current: string[] = [];
  let tokens = 0;
  for (const part of parts) {
    const cost = estimateTokens(part);
    if (tokens + cost > targetTokens && current.length > 0) {
      merged.push(current.join(separator));
      current = [];
      tokens = 0;
    }
    current.push(part);
    tokens += cost;
  }
  if (current.length > 0) merged.push(current.join(separator));
  return merged;
}

function splitRecursive(text: string, separators: string[], targetTokens: number): string[] {
  if (estimateTokens(text) <= targetTokens) return [text];

  const maxChars = targetTokens * CHARS_PER_TOKEN;
  const sepIndex = separators.findIndex((s) => s.length > 0 && text.includes(s));

  // No usable separator left → hard split on character windows (guarantees termination).
  if (sepIndex === -1) return hardSplitByChars(text, maxChars);

  const separator = separators[sepIndex]!;
  const finer = separators.slice(sepIndex + 1);

  const parts: string[] = [];
  for (const part of text.split(separator)) {
    if (part.length === 0) continue;
    if (estimateTokens(part) <= targetTokens) {
      parts.push(part);
    } else {
      parts.push(...splitRecursive(part, finer, targetTokens));
    }
  }
  return mergeAdjacent(parts, separator, targetTokens);
}

export function recursiveChunker(options: RecursiveChunkerOptions = {}): Chunker {
  const targetTokens = options.targetTokens ?? DEFAULT_TARGET_TOKENS;
  const separators = options.separators ?? DEFAULT_SEPARATORS;

  if (targetTokens <= 0) {
    throw new Error(`[RAG] recursiveChunker: targetTokens must be > 0 (got ${targetTokens})`);
  }

  return {
    name: `recursive(${targetTokens})`,
    chunk(evidence: Evidence): Chunk[] {
      const pieces = splitRecursive(evidence.content, separators, targetTokens);
      return toChunks(evidence, pieces);
    },
  };
}
