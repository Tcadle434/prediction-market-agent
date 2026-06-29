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
 * Trust boundary: we go through the typed @tavily/core SDK (not raw fetch), so we trust its
 * response SHAPE and validate our OWN output — every row goes through EvidenceSchema, the
 * boundary downstream chunking/citations actually depend on. The mapper still defends against
 * the field-level realities the SDK type glosses over (publishedDate is typed required but is
 * news-only; rawContent can be absent). Hard failures (the call rejecting) throw with a `[RAG]`
 * prefix; the key is read via `required(loadConfig()...)` only when the live client is built;
 * the Tavily `search` function is injectable so tests run fully offline.
 */
import { createHash } from "node:crypto";
import {
	type Evidence,
	EvidenceSchema,
	loadConfig,
	required,
} from "@lykos/core";
import { type TavilySearchResponse, tavily } from "@tavily/core";

const DEFAULT_MAX_RESULTS = 10;
const DEFAULT_RECENCY_DAYS = 7;
const EVIDENCE_ID_LENGTH = 16;

/**
 * One result from a Tavily search: { title, url, content, rawContent?, score, publishedDate, … }.
 * The SDK exports `TavilySearchResponse` but not its element type, so we derive it by indexing.
 */
export type TavilyResult = TavilySearchResponse["results"][number];

/**
 * A search function: question in, typed Tavily response out. Injected in tests (return a
 * fixture); defaults to a live Tavily client built from TAVILY_API_KEY.
 */
export type TavilySearch = (query: string) => Promise<TavilySearchResponse>;

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
 * Map one Tavily result into our domain Evidence (or null if it can't be represented).
 * Pure and deterministic. Prefers the full `rawContent` (markdown body) and falls back to the
 * short `content` snippet; skips a result with no usable text or a URL that fails EvidenceSchema.
 */
export function tavilyResultToEvidence(raw: TavilyResult): Evidence | null {
	const content = (raw.rawContent ?? raw.content).trim();
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
 * Search the web for Evidence relevant to a question. Returns validated Evidence, skipping any
 * result that can't be mapped; throws `[RAG] ...` if the underlying search call fails.
 */
export async function searchEvidence(
	question: string,
	options: SearchEvidenceOptions = {},
): Promise<Evidence[]> {
	const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
	const days = options.days ?? DEFAULT_RECENCY_DAYS;
	const search = options.search ?? createLiveSearch(maxResults, days);

	let response: TavilySearchResponse;
	try {
		response = await search(question);
	} catch (error: unknown) {
		throw new Error(`[RAG] Tavily search failed: ${getErrorMessage(error)}`);
	}

	const evidence: Evidence[] = [];
	for (const raw of response.results) {
		const mapped = tavilyResultToEvidence(raw);
		if (mapped) evidence.push(mapped);
	}
	return evidence;
}
