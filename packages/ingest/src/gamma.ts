/**
 * The Polymarket Gamma /markets API: the raw wire shape we depend on, plus a fetch client.
 *
 * Two quirks the schema captures faithfully (verified against the live API):
 *   • `outcomes`, `outcomePrices`, `clobTokenIds` arrive as JSON-ENCODED STRINGS,
 *     e.g. outcomes = '["Yes", "No"]'. They are parsed in map.ts, not here.
 *   • `bestBid` / `bestAsk` are quoted on the YES token only (and may be null).
 *
 * The response has ~80 fields; we declare only the ones we use. Zod strips the rest, and
 * most are optional so a slightly-different market doesn't fail the whole batch.
 */
import { z } from "zod";
import { loadConfig } from "@lykos/core";

export const GammaMarketSchema = z.object({
	id: z.union([z.string(), z.number()]).transform((v) => String(v)),
	question: z.string(),
	description: z.string().optional().default(""),
	slug: z.string().optional(),
	outcomes: z.string(), // JSON-encoded string array
	outcomePrices: z.string(), // JSON-encoded string array of numeric strings
	clobTokenIds: z.string().optional(),
	bestBid: z.number().nullable().optional(), // YES-token best bid
	bestAsk: z.number().nullable().optional(), // YES-token best ask
	active: z.boolean().optional().default(false),
	closed: z.boolean().optional().default(false),
	endDate: z.string().nullable().optional(),
	volumeNum: z.number().nullable().optional(),
	liquidityNum: z.number().nullable().optional(),
});
export type GammaMarket = z.infer<typeof GammaMarketSchema>;

export interface FetchGammaParams {
	limit?: number;
	offset?: number;
	closed?: boolean;
	active?: boolean;
	order?: string; // e.g. "volumeNum"
	ascending?: boolean;
}

function setParam(q: URLSearchParams, key: string, value: unknown) {
	if (value != null) q.set(key, String(value));
}

/**
 * Fetch raw markets from Gamma and validate each row. Rows that don't match the schema are
 * skipped rather than throwing, so one malformed market never sinks the whole fetch.
 */
export async function fetchGammaMarkets(
	params: FetchGammaParams = {},
	opts: { baseUrl?: string } = {},
): Promise<GammaMarket[]> {
	const baseUrl = opts.baseUrl ?? loadConfig().POLYMARKET_GAMMA_URL;
	const url = new URL("/markets", baseUrl);
	const queryParams = url.searchParams;

	setParam(queryParams, "limit", params.limit);
	setParam(queryParams, "offset", params.offset);
	setParam(queryParams, "closed", params.closed);
	setParam(queryParams, "active", params.active);
	setParam(queryParams, "order", params.order);
	setParam(queryParams, "ascending", params.ascending);

	const res = await fetch(url);

	if (!res.ok) {
		throw new Error(`[INGEST] Gamma /markets failed: ${res.status} ${res.statusText}`);
	}
	const body: unknown = await res.json();

	if (!Array.isArray(body)) {
		throw new Error("[INGEST] Gamma /markets did not return an array");
	}

	const markets: GammaMarket[] = [];
	for (const row of body) {
		const parsed = GammaMarketSchema.safeParse(row);
		if (parsed.success) markets.push(parsed.data);
	}
	return markets;
}
