/**
 * Stage-1 recall: turn a market question into candidate Evidence documents via Tavily
 * web search. This is the FIRST half of two-stage retrieval — Tavily casts a wide net for
 * relevant documents; the embedding/pgvector layer (Stage 2) later picks the best passages.
 *
 * Search config (deliberate — see docs/ROADMAP.md):
 *   • topic "news"          — forecasting "Will X by Y?" lives on fresh events; news also
 *                             attaches publishedDate, which feeds Evidence.publishedAt (recency).
 *   • searchDepth "advanced"— maximum relevance for narrowly-scoped resolution questions.
 *   • includeRawContent     — "markdown": we need the FULL article body to chunk, not a snippet.
 *   • maxResults 10, days 7 — enough independent documents to corroborate; recent by default.
 *
 * Conventions mirror packages/ingest/gamma.ts: validate every external row with Zod and SKIP
 * invalid ones (one bad result never sinks the batch); THROW with a `[RAG]` prefix on a hard
 * failure (the call rejecting, or no results array); never read process.env directly — pull the
 * key via `required(loadConfig()...)` only when the live client is built. The Tavily `search`
 * function is injectable so tests run fully offline.
 */
import { createHash } from "node:crypto";
import {
	type Evidence,
	EvidenceSchema,
	loadConfig,
	required,
} from "@lykos/core";
import { tavily } from "@tavily/core";
import { z } from "zod";

const DEFAULT_MAX_RESULTS = 10;
const DEFAULT_RECENCY_DAYS = 7;
const EVIDENCE_ID_LENGTH = 16;

/** The raw shape we depend on from a Tavily search result (camelCase, per @tavily/core). */
const TavilyResultSchema = z.object({
	title: z.string(),
	url: z.string(),
	content: z.string().default(""),
	rawContent: z.string().nullable().optional(),
	score: z.number(),
	publishedDate: z.string().optional(),
});
export type TavilyResult = z.infer<typeof TavilyResultSchema>;

/** A Tavily response only needs to carry a `results` array for us; the rest is ignored. */
const TavilyResponseSchema = z.object({ results: z.array(z.unknown()) });

/**
 * A search function: question in, raw Tavily response out. Injected in tests (return a
 * fixture); defaults to a live Tavily client built from TAVILY_API_KEY.
 */
export type TavilySearch = (query: string) => Promise<unknown>;

export interface SearchEvidenceOptions {
	/** Max results to request. Tavily caps this at 20. */
	maxResults?: number;
	/** Recency window in days (news topic). */
	days?: number;
	/** Inject a search function for offline tests; defaults to the live Tavily client. */
	search?: TavilySearch;
}

/** Stable, unique id for a document — a short hash of its URL, so chunk ids never collide. */
function evidenceId(url: string): string {
	return createHash("sha256")
		.update(url)
		.digest("hex")
		.slice(0, EVIDENCE_ID_LENGTH);
}

/** Parse a Tavily publishedDate into an ISO string, or null if absent/unparseable. */
function toIsoOrNull(value: string | undefined | null): string | null {
	if (!value) return null;
	const ms = Date.parse(value);
	return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Map one validated Tavily result into our domain Evidence (or null if it can't be
 * represented). Pure and deterministic. Prefers the full `rawContent` (markdown body) and
 * falls back to the short `content` snippet; skips a result with no usable text or a bad URL.
 */
export function tavilyResultToEvidence(raw: TavilyResult): Evidence | null {
	const content = (raw.rawContent ?? raw.content ?? "").trim();
	if (content.length === 0) return null;

	const candidate = {
		id: evidenceId(raw.url),
		url: raw.url,
		title: raw.title,
		content,
		publishedAt: toIsoOrNull(raw.publishedDate),
		source: "tavily",
		searchScore: raw.score,
	};

	const result = EvidenceSchema.safeParse(candidate);
	return result.success ? result.data : null;
}

/** Build the live Tavily search function. Reads the key only here (not on import). */
function createLiveSearch(maxResults: number, days: number): TavilySearch {
	const apiKey = required(loadConfig().TAVILY_API_KEY, "TAVILY_API_KEY");
	const client = tavily({ apiKey });
	return (query) =>
		client.search(query, {
			topic: "news",
			searchDepth: "advanced",
			includeRawContent: "markdown",
			maxResults,
			days,
		});
}

/**
 * Search the web for Evidence relevant to a question. Returns validated Evidence, skipping
 * any malformed result; throws `[RAG] ...` if the search call fails or returns no results array.
 */
export async function searchEvidence(
	question: string,
	options: SearchEvidenceOptions = {},
): Promise<Evidence[]> {
	const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
	const days = options.days ?? DEFAULT_RECENCY_DAYS;
	const search = options.search ?? createLiveSearch(maxResults, days);

	let response: unknown;
	try {
		response = await search(question);
	} catch (error: unknown) {
		throw new Error(`[RAG] Tavily search failed: ${getErrorMessage(error)}`);
	}

	const parsed = TavilyResponseSchema.safeParse(response);
	if (!parsed.success) {
		throw new Error("[RAG] Tavily search returned no results array");
	}

	const evidence: Evidence[] = [];
	for (const row of parsed.data.results) {
		const rawResult = TavilyResultSchema.safeParse(row);
		if (!rawResult.success) continue; // skip a malformed result, keep the batch
		const mapped = tavilyResultToEvidence(rawResult.data);
		if (mapped) evidence.push(mapped);
	}
	return evidence;
}
