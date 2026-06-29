/**
 * The domain model for Lykos.
 *
 * Every schema here is defined ONCE with Zod, and the matching TypeScript type is
 * *inferred* from it (`z.infer<...>`). That gives us a single source of truth that is
 * both a compile-time type AND a runtime validator — so we can trust data coming from
 * the Polymarket API, the LLM, or the database, not just hope it has the right shape.
 *
 * Data flows: Market + Evidence  ->  Chunk  ->  RetrievedChunk  ->  Forecast  ->  Decision
 */
import { z } from "zod";

// ── Markets ───────────────────────────────────────────────────────────────────
// A single tradeable outcome of a market. `price` is the market's price for this
// outcome in [0,1], which we read as the market-implied probability.
export const MarketOutcomeSchema = z.object({
	name: z.string(), // e.g. "Yes" / "No"
	price: z.number().min(0).max(1), // mid / last trade — our implied-probability reading
	bid: z.number().min(0).max(1).nullable().default(null), // best bid (what you'd SELL at)
	ask: z.number().min(0).max(1).nullable().default(null), // best ask (what you'd PAY) — fills + edge
});
export type MarketOutcome = z.infer<typeof MarketOutcomeSchema>;

export const MarketStatusSchema = z.enum(["open", "resolved"]);
export type MarketStatus = z.infer<typeof MarketStatusSchema>;

// A prediction market. When `status` is "resolved", `resolvedOutcome` holds the
// winning outcome name — that is our ground truth for the eval harness.
export const MarketSchema = z.object({
	id: z.string(),
	question: z.string(),
	description: z.string().default(""),
	resolutionCriteria: z.string().default(""),
	outcomes: z.array(MarketOutcomeSchema),
	status: MarketStatusSchema,
	resolvedOutcome: z.string().nullable().default(null),
	endDate: z.string().nullable().default(null), // ISO 8601
	url: z.string().url().nullable().default(null),
	source: z.enum(["polymarket", "kalshi"]).default("polymarket"),
});
export type Market = z.infer<typeof MarketSchema>;

// ── Evidence & chunks ─────────────────────────────────────────────────────────
// A whole source document retrieved by search (one news article, one page, etc.).
export const EvidenceSchema = z.object({
	id: z.string(),
	url: z.string().url(),
	title: z.string(),
	content: z.string(),
	publishedAt: z.string().nullable().default(null), // ISO; powers recency weighting
	source: z.string().default("tavily"),
	searchScore: z.number().nullable().default(null), // relevance score from the search API
});
export type Evidence = z.infer<typeof EvidenceSchema>;

// A piece of an Evidence document after chunking. The embedding vector itself is NOT
// stored here — it lives in the vector store. A Chunk is the human-readable unit;
// the vector is a storage detail behind the VectorStore interface.
export const ChunkSchema = z.object({
	id: z.string(),
	evidenceId: z.string(),
	text: z.string(),
	index: z.number().int(), // position of this chunk within its evidence doc
	tokenCount: z.number().int(),
	publishedAt: z.string().nullable().default(null), // copied down for time-decay at query time
});
export type Chunk = z.infer<typeof ChunkSchema>;

// A Chunk returned by retrieval, annotated with how well it matched the query.
export const RetrievedChunkSchema = ChunkSchema.extend({
	similarity: z.number(), // vector cosine similarity to the query
	rerankScore: z.number().nullable().default(null), // optional cross-encoder rerank score
});
export type RetrievedChunk = z.infer<typeof RetrievedChunkSchema>;

// ── Forecast & decision ───────────────────────────────────────────────────────
// One supporting reference the agent must attach to a claim (grounding).
export const CitationSchema = z.object({
	chunkId: z.string(),
	evidenceId: z.string(),
	url: z.string().url(),
	quote: z.string(), // the exact snippet that supports the claim
});
export type Citation = z.infer<typeof CitationSchema>;

// The agent's forecast for a market. `probabilityYes` is null when it abstains
// (insufficient grounded evidence) — abstention is a first-class outcome, not an error.
//
// MODEL (A) — decided deliberately:
//   • `probabilityYes` (q) is the agent's HONEST best-estimate *mean* probability. The agent
//     must NOT hedge q toward 0.50 to express uncertainty — that is what `confidence` is for.
//   • `confidence` means "how much do I trust this edge is real" (estimation / model risk). It
//     is the ONLY uncertainty channel, and it only ever SHRINKS the bet (stake = λ·confidence·f*).
//     Keeping uncertainty out of q prevents double-counting it in both q and the stake.
export const ForecastSchema = z.object({
	marketId: z.string(),
	probabilityYes: z.number().min(0).max(1).nullable(),
	confidence: z.number().min(0).max(1),
	rationale: z.string(),
	citations: z.array(CitationSchema),
	abstained: z.boolean(),
});
export type Forecast = z.infer<typeof ForecastSchema>;

// A Decision is the *intent*: given a Forecast + the market's prices + a SizingPolicy, which
// side to back and how many units to risk. `side` is null when we don't bet (no edge, or below
// the minimum-edge gate) — that null is how an abstain is represented at the sizing layer.
export const DecisionSchema = z.object({
	marketId: z.string(),
	forecast: ForecastSchema,
	marketProbabilityYes: z.number().min(0).max(1), // mid at decision time (for Brier-vs-market)
	side: z.enum(["yes", "no"]).nullable(), // null = no bet
	entryAsk: z.number().min(0).max(1).nullable(), // the ask we'd PAY for `side` (null if no bet)
	edge: z.number(), // signed edge for the chosen side, vs its ask (0 if no bet)
	kellyFraction: z.number(), // raw full Kelly  f* = edge / (1 - ask)   (0 if no bet)
	stakeFraction: z.number(), // after fractional-Kelly λ + confidence shrink (0 if no bet)
	units: z.number().int().min(0), // 0 .. maxUnits
	suggestedStakeUsd: z.number().min(0),
	suggestedShares: z.number().min(0),
	requiresApproval: z.boolean(), // true when a real position would need human sign-off
	approved: z.boolean().default(false), // a human must approve before any REAL position
	createdAt: z.string(), // ISO timestamp — stamped by the caller, never inside pure code
});
export type Decision = z.infer<typeof DecisionSchema>;

// A Position is what actually happened: the fill, then (once the market resolves) the settlement.
// Tracked in BOTH shares and dollars so the payout math is exact and auditable.
export const PositionSchema = z.object({
	id: z.string(),
	decisionId: z.string(),
	marketId: z.string(),
	side: z.enum(["yes", "no"]),
	// ── fill ──
	entryAsk: z.number().min(0).max(1), // price per share actually paid (best ask at fill time)
	shares: z.number().min(0),
	costUsd: z.number().min(0), // shares * entryAsk + feesUsd
	feesUsd: z.number().min(0).default(0),
	units: z.number().int().min(0), // units risked
	openedAt: z.string(),
	// ── settlement (all null until the market resolves) ──
	resolved: z.boolean().default(false),
	won: z.boolean().nullable().default(null),
	payoutUsd: z.number().min(0).nullable().default(null), // shares * $1 if won, else 0
	pnlUsd: z.number().nullable().default(null), // payoutUsd - costUsd
	returnOnStake: z.number().nullable().default(null), // pnlUsd / costUsd
	unitsPnl: z.number().nullable().default(null), // pnlUsd / unit value — the headline metric
	settledAt: z.string().nullable().default(null),
});
export type Position = z.infer<typeof PositionSchema>;
