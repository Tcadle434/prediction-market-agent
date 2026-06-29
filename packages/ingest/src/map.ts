/**
 * Map a raw Gamma market into our validated domain `Market` (or null if it can't be
 * represented). This is where the wire-format quirks are unwound:
 *   • JSON-encoded `outcomes` / `outcomePrices` strings are parsed and length-matched.
 *   • For binary Yes/No markets, bid/ask are derived from the YES-token book: the No side's
 *     prices are the complement (No ask = 1 − Yes bid, No bid = 1 − Yes ask).
 *   • For a closed market, the winning outcome's price settles to ~1, so we read ground
 *     truth (`resolvedOutcome`) straight off the prices.
 */
import { type Market, MarketSchema } from "@lykos/core";
import type { GammaMarket } from "./gamma.js";

function clamp01(x: number): number {
	return Math.min(1, Math.max(0, x));
}

function parseJsonArray(s: string): unknown[] | null {
	try {
		const v: unknown = JSON.parse(s);
		return Array.isArray(v) ? v : null;
	} catch {
		return null;
	}
}

export function gammaToMarket(raw: GammaMarket): Market | null {
	const names = parseJsonArray(raw.outcomes);
	const priceStrs = parseJsonArray(raw.outcomePrices);
	if (
		!names ||
		!priceStrs ||
		names.length === 0 ||
		names.length !== priceStrs.length
	) {
		return null;
	}

	const prices = priceStrs.map((p) => Number(p));
	if (prices.some((p) => Number.isNaN(p))) return null;

	// Locate Yes/No for the binary bid/ask derivation.
	const lower = names.map((n) => String(n).trim().toLowerCase());
	const yesIdx = lower.indexOf("yes");
	const noIdx = lower.indexOf("no");
	const isBinary = names.length === 2 && yesIdx !== -1 && noIdx !== -1;

	const bestBid = raw.bestBid ?? null; // quoted on the YES token
	const bestAsk = raw.bestAsk ?? null;

	const outcomes = names.map((n, i) => {
		let bid: number | null = null;
		let ask: number | null = null;
		if (isBinary) {
			if (i === yesIdx) {
				bid = bestBid;
				ask = bestAsk;
			} else {
				// No token: the book is the complement of the Yes token's.
				ask = bestBid != null ? clamp01(1 - bestBid) : null;
				bid = bestAsk != null ? clamp01(1 - bestAsk) : null;
			}
		}
		return { name: String(n), price: clamp01(prices[i]!), bid, ask };
	});

	const closed = raw.closed ?? false;
	let resolvedOutcome: string | null = null;
	if (closed) {
		const winner = outcomes.find((o) => o.price >= 0.99);
		resolvedOutcome = winner ? winner.name : null;
	}

	const candidate = {
		id: raw.id,
		question: raw.question,
		description: raw.description ?? "",
		resolutionCriteria: "",
		outcomes,
		status: closed ? "resolved" : "open",
		resolvedOutcome,
		endDate: raw.endDate ?? null,
		url: raw.slug ? `https://polymarket.com/event/${raw.slug}` : null,
		source: "polymarket",
	};

	const result = MarketSchema.safeParse(candidate);
	return result.success ? result.data : null;
}
