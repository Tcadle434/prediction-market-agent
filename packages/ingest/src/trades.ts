/**
 * The Polymarket data-api /trades feed: on-chain trade history for a market, and a fetch client.
 *
 * This is the agent's SECOND research modality — "order flow". Unlike news (unstructured text
 * that we chunk + embed + retrieve), trades are small, dense, structured records where every
 * number matters, so we fetch them whole and summarize (see @lykos/agent), never RAG them.
 *
 * Shape verified against the live API (GET https://data-api.polymarket.com/trades?market=<cid>):
 *   • Keyed by the market's on-chain `conditionId` (NOT the Gamma numeric id).
 *   • Returns a JSON array, newest-first (monotonic descending `timestamp`); default 100 rows.
 *   • `outcome` is the human-readable side ("Yes" / "No"), so no token-id mapping is needed.
 *   • `side` is the taker's direction: BUY (paid the ask) or SELL (hit the bid).
 *
 * The response has many fields (wallet profile, icons, tx hash); we declare only what the
 * summary uses. Zod strips the rest, and each row is validated independently — a single
 * malformed trade is skipped, never fatal to the batch (same policy as the Gamma fetch).
 */
import { loadConfig } from "@lykos/core";
import { z } from "zod";

export const TradeSchema = z.object({
	side: z.enum(["BUY", "SELL"]), // taker direction
	outcome: z.string(), // "Yes" / "No" (human-readable side)
	price: z.number().min(0).max(1), // fill price in [0,1]
	size: z.number().min(0), // shares filled
	timestamp: z.number().int(), // unix SECONDS
	proxyWallet: z.string(), // trader address — powers holder-concentration signal
	conditionId: z.string(),
	transactionHash: z.string(), // on-chain tx — a stable per-trade id
});
export type Trade = z.infer<typeof TradeSchema>;

export interface FetchTradesParams {
	limit?: number; // how many recent trades to pull (API default 100)
}

/**
 * Fetch recent on-chain trades for a market by its `conditionId`, newest-first. Rows that don't
 * match the schema are skipped rather than throwing, so one malformed trade never sinks the batch.
 */
export async function fetchTrades(
	conditionId: string,
	params: FetchTradesParams = {},
	opts: { baseUrl?: string } = {},
): Promise<Trade[]> {
	if (!conditionId) {
		throw new Error("[INGEST] fetchTrades requires a non-empty conditionId");
	}

	const baseUrl = opts.baseUrl ?? loadConfig().POLYMARKET_DATA_URL;
	const url = new URL("/trades", baseUrl);
	url.searchParams.set("market", conditionId);
	if (params.limit != null) url.searchParams.set("limit", String(params.limit));

	const res = await fetch(url);

	if (!res.ok) {
		throw new Error(
			`[INGEST] data-api /trades failed: ${res.status} ${res.statusText}`,
		);
	}
	const body: unknown = await res.json();

	if (!Array.isArray(body)) {
		throw new Error("[INGEST] data-api /trades did not return an array");
	}

	const trades: Trade[] = [];
	for (const row of body) {
		const parsed = TradeSchema.safeParse(row);
		if (parsed.success) trades.push(parsed.data);
	}
	return trades;
}
