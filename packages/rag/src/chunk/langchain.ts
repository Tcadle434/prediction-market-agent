/**
 * LangChain-backed chunkers — the industry-standard splitters, wrapped behind our Chunker
 * interface so the eval can benchmark our hand-rolled fixed/recursive chunkers against the
 * de-facto production defaults.
 *
 * What to learn from this file:
 *
 *  • RecursiveCharacterTextSplitter is THE default splitter in production RAG. It splits on a
 *    separator hierarchy (paragraph → line → sentence → word → char), recurses into pieces
 *    that are still too big, then merges small adjacent pieces back up toward the budget — the
 *    same shape as our recursiveChunker, but battle-tested and (unlike ours) WITH overlap.
 *
 *  • TokenTextSplitter encodes the text to real BPE token IDs and slices on exact token
 *    boundaries — the token-accurate analog of our fixedChunker.
 *
 * Two things make the library versions stronger than our hand-rolled pair, and both are
 * visible right here:
 *
 *  1. REAL tokenization. We hand the recursive splitter a `lengthFunction` backed by
 *     js-tiktoken (OpenAI's cl100k_base BPE) so chunk budgets are measured in TRUE tokens,
 *     not our ~4-chars/token estimate. cl100k is a close proxy for Voyage's tokenizer — far
 *     better than the heuristic; Voyage still reports exact usage at embed time.
 *  2. True overlap in the recursive splitter (ours has overlap only in the fixed chunker).
 *
 * Why our Chunker interface is async: LangChain's `splitText` returns `Promise<string[]>`.
 * It hands back plain strings, so we still run them through our `toChunks` helper to attach
 * ids, evidenceId, publishedAt, and — this time — a REAL token count.
 */
import {
	RecursiveCharacterTextSplitter,
	TokenTextSplitter,
} from "@langchain/textsplitters";
import type { Chunk, Evidence } from "@lykos/core";
import { getEncoding } from "js-tiktoken";
import { toChunks } from "./common.js";
import type { Chunker } from "./types.js";

// One shared encoder for the module. cl100k_base is GPT-3.5/4's BPE vocabulary; getEncoding
// bundles the rank tables, so this is synchronous and works fully offline (no network).
const encoding = getEncoding("cl100k_base");

/** Real BPE token count — used both as LangChain's lengthFunction and to record tokenCount. */
function countTokens(text: string): number {
	return encoding.encode(text).length;
}

export interface LangchainChunkerOptions {
	/** Target chunk size in REAL tokens. */
	targetTokens?: number;
	/** Token overlap carried between adjacent chunks. */
	overlapTokens?: number;
}

const DEFAULT_TARGET_TOKENS = 512;
const DEFAULT_OVERLAP_TOKENS = 64;

/**
 * Resolve + validate options, mirroring the friendly checks our hand-rolled chunkers make.
 * LangChain throws a terse "Cannot have chunkOverlap >= chunkSize"; we catch it earlier with
 * an actionable [RAG] message (e.g. a small targetTokens left with the default overlap).
 */
function resolveOptions(
	options: LangchainChunkerOptions,
	label: string,
): { targetTokens: number; overlapTokens: number } {
	const targetTokens = options.targetTokens ?? DEFAULT_TARGET_TOKENS;
	const overlapTokens = options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;
	if (targetTokens <= 0) {
		throw new Error(
			`[RAG] ${label}: targetTokens must be > 0 (got ${targetTokens})`,
		);
	}
	if (overlapTokens < 0 || overlapTokens >= targetTokens) {
		throw new Error(
			`[RAG] ${label}: overlapTokens must be in [0, targetTokens) (got ${overlapTokens})`,
		);
	}
	return { targetTokens, overlapTokens };
}

/**
 * LangChain's RecursiveCharacterTextSplitter behind our Chunker — structure-aware AND
 * token-accurate (via the tiktoken `lengthFunction`), with real overlap. The library
 * counterpart to our recursiveChunker.
 */
export function langchainRecursiveChunker(
	options: LangchainChunkerOptions = {},
): Chunker {
	const { targetTokens, overlapTokens } = resolveOptions(
		options,
		"langchainRecursiveChunker",
	);
	const splitter = new RecursiveCharacterTextSplitter({
		chunkSize: targetTokens,
		chunkOverlap: overlapTokens,
		lengthFunction: countTokens, // measure budgets in real tokens, not characters
	});
	return {
		name: `langchain-recursive(${targetTokens}/${overlapTokens})`,
		async chunk(evidence: Evidence): Promise<Chunk[]> {
			const pieces = await splitter.splitText(evidence.content);
			return toChunks(evidence, pieces, countTokens);
		},
	};
}

/**
 * LangChain's TokenTextSplitter behind our Chunker — fixed windows on exact BPE token
 * boundaries with overlap. The token-accurate counterpart to our fixedChunker.
 */
export function langchainTokenChunker(
	options: LangchainChunkerOptions = {},
): Chunker {
	const { targetTokens, overlapTokens } = resolveOptions(
		options,
		"langchainTokenChunker",
	);
	const splitter = new TokenTextSplitter({
		encodingName: "cl100k_base",
		chunkSize: targetTokens,
		chunkOverlap: overlapTokens,
	});
	return {
		name: `langchain-token(${targetTokens}/${overlapTokens})`,
		async chunk(evidence: Evidence): Promise<Chunk[]> {
			const pieces = await splitter.splitText(evidence.content);
			return toChunks(evidence, pieces, countTokens);
		},
	};
}
