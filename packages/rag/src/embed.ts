/**
 * Voyage embeddings — turn text into vectors (Stage-2 precision of two-stage retrieval).
 *
 * Config (verified against current Voyage docs + voyageai@0.4.0 types — see docs/ROADMAP.md):
 *   • model "voyage-3.5", outputDimension 1024 (matches the pgvector vector(1024) column),
 *     outputDtype "float" → plain number[].
 *   • inputType: stored chunks embed as "document", the forecaster's question as "query" —
 *     Voyage's documented asymmetric-retrieval pattern, so we expose two entry points.
 *   • Voyage's embed endpoint accepts at most 128 inputs per call, so embedTexts batches.
 *   • Voyage vectors are L2-normalized (length 1), so cosine ≡ dot-product downstream.
 *
 * Conventions (mirror search.ts): go through the typed SDK but VALIDATE our own output
 * (one vector per text, non-empty, finite, consistent dimension); throw [RAG]-prefixed on hard
 * failure; read VOYAGE_API_KEY via required() only when the live client is built; the batch-embed
 * function is injectable so tests run fully offline.
 */
import { loadConfig, required } from "@lykos/core";
import { VoyageAIClient } from "voyageai";

/** Voyage's embed endpoint accepts at most 128 inputs per call (SDK EmbedRequest.input cap). */
export const EMBED_MAX_BATCH = 128;
const DEFAULT_EMBED_MODEL = "voyage-3.5";
const DEFAULT_OUTPUT_DIMENSION = 1024;

export type InputType = "query" | "document";

/** Embeds one batch (≤128 texts) of a single input type → one vector per text, in input order. */
export type EmbedBatch = (
	texts: string[],
	inputType: InputType,
) => Promise<number[][]>;

export interface EmbedOptions {
	/** Voyage embedding model. */
	model?: string;
	/** Output vector dimension (must match the pgvector column; 1024 default). */
	outputDimension?: number;
	/** Inject a batch-embed function for offline tests; defaults to the live Voyage client. */
	embed?: EmbedBatch;
}

/** Validate that a set of vectors is usable: non-empty, finite, and all the same dimension. */
function assertValidVectors(vectors: number[][]): void {
	const dim = vectors[0]?.length ?? 0;
	for (const v of vectors) {
		if (v.length === 0)
			throw new Error("[RAG] embedTexts: empty embedding vector");
		if (v.length !== dim) {
			throw new Error(
				`[RAG] embedTexts: inconsistent vector dimension (${v.length} vs ${dim})`,
			);
		}
		if (!v.every((x) => Number.isFinite(x))) {
			throw new Error("[RAG] embedTexts: non-finite value in embedding");
		}
	}
}

/** Build the live batch-embed function. Reads the key only here (not on import). */
function createLiveEmbed(model: string, outputDimension: number): EmbedBatch {
	const apiKey = required(loadConfig().VOYAGE_API_KEY, "VOYAGE_API_KEY");
	const client = new VoyageAIClient({ apiKey });
	return async (texts, inputType) => {
		const res = await client.embed({
			input: texts,
			model,
			inputType,
			outputDimension,
			outputDtype: "float",
			truncation: true,
		});
		const data = res.data ?? [];
		if (data.length !== texts.length) {
			throw new Error(
				`[RAG] Voyage embed: expected ${texts.length} embeddings, got ${data.length}`,
			);
		}
		// Reassemble in input order: each item carries its own index back into `texts`.
		const vectors: number[][] = new Array(texts.length);
		for (const item of data) {
			const i = item.index ?? -1;
			if (i < 0 || i >= texts.length || !item.embedding) {
				throw new Error(
					`[RAG] Voyage embed: malformed item at index ${item.index}`,
				);
			}
			vectors[i] = item.embedding;
		}
		return vectors;
	};
}

/** Embed texts with the given input type, batching to the SDK's 128-input limit. */
export async function embedTexts(
	texts: string[],
	inputType: InputType,
	options: EmbedOptions = {},
): Promise<number[][]> {
	if (texts.length === 0) return [];
	const model = options.model ?? DEFAULT_EMBED_MODEL;
	const outputDimension = options.outputDimension ?? DEFAULT_OUTPUT_DIMENSION;
	const embed = options.embed ?? createLiveEmbed(model, outputDimension);

	const vectors: number[][] = [];
	for (let i = 0; i < texts.length; i += EMBED_MAX_BATCH) {
		const batch = texts.slice(i, i + EMBED_MAX_BATCH);
		const out = await embed(batch, inputType);
		if (out.length !== batch.length) {
			throw new Error(
				`[RAG] embedTexts: batch returned ${out.length} vectors for ${batch.length} texts`,
			);
		}
		vectors.push(...out);
	}
	assertValidVectors(vectors);
	return vectors;
}

/** Embed stored documents/chunks (inputType "document"). */
export function embedDocuments(
	texts: string[],
	options: EmbedOptions = {},
): Promise<number[][]> {
	return embedTexts(texts, "document", options);
}

/** Embed a single query string (inputType "query"). */
export async function embedQuery(
	text: string,
	options: EmbedOptions = {},
): Promise<number[]> {
	const [vector] = await embedTexts([text], "query", options);
	if (!vector) throw new Error("[RAG] embedQuery: no embedding returned");
	return vector;
}
