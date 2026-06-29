/**
 * The bet-sizing decision — model (A), pure and deterministic.
 *
 *   edge      = q - ask              (per side; q is the honest mean probability)
 *   f*        = edge / (1 - ask)     (full Kelly)
 *   fraction  = kellyFraction * confidence * f*   (fractional Kelly; confidence only shrinks)
 *   units     = clamp(round(fraction / unitFraction), 0, maxUnits)
 *
 * `now` (an ISO timestamp) is passed in, never read from the clock here, so the same inputs
 * always produce the same Decision — which is what lets the eval harness replay decisions.
 */
import type {
	Decision,
	Forecast,
	Market,
	MarketOutcome,
	SizingPolicy,
} from "@lykos/core";

/** The price you'd PAY to buy this outcome: the ask, falling back to the mid if no book is present. */
export function askPrice(outcome: MarketOutcome): number {
	return outcome.ask ?? outcome.price;
}

/** Full-Kelly fraction of bankroll for a bet with the given `edge` bought at `ask`. */
export function kellyFraction(edge: number, ask: number): number {
	const denom = 1 - ask;
	if (denom <= 0) return 0; // ask at/above 1 → no usable odds
	return edge / denom;
}

/** Dollar value of one unit = bankroll × unit fraction. */
export function unitValueUsd(policy: SizingPolicy): number {
	return policy.bankrollUsd * policy.unitFraction;
}

function clamp(x: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, x));
}

function findOutcome(
	market: Market,
	name: "yes" | "no",
): MarketOutcome | undefined {
	return market.outcomes.find((o) => o.name.trim().toLowerCase() === name);
}

/** A Decision representing "we are not betting this market." */
function noBet(forecast: Forecast, market: Market, now: string): Decision {
	const yes = findOutcome(market, "yes");
	return {
		marketId: market.id,
		forecast,
		marketProbabilityYes: yes?.price ?? 0.5,
		side: null,
		entryAsk: null,
		edge: 0,
		kellyFraction: 0,
		stakeFraction: 0,
		units: 0,
		suggestedStakeUsd: 0,
		suggestedShares: 0,
		requiresApproval: false,
		approved: false,
		createdAt: now,
	};
}

/**
 * Turn a forecast into a sizing decision under model (A).
 * Returns a no-bet Decision when there's no usable probability, the market isn't a binary
 * yes/no, the edge is below the gate, or the bet rounds down to zero units.
 */
export function decideBet(
	forecast: Forecast,
	market: Market,
	policy: SizingPolicy,
	now: string,
): Decision {
	const q = forecast.probabilityYes;
	if (forecast.abstained || q === null) return noBet(forecast, market, now);

	const yes = findOutcome(market, "yes");
	const no = findOutcome(market, "no");
	if (!yes || !no) return noBet(forecast, market, now); // not a binary yes/no market

	const askYes = askPrice(yes);
	const askNo = askPrice(no);

	// Edge per side, measured against the price you'd actually pay (the ask).
	const edgeYes = q - askYes;
	const edgeNo = 1 - q - askNo;

	const betYes = edgeYes >= edgeNo;
	const side = betYes ? "yes" : "no";
	const edge = betYes ? edgeYes : edgeNo;
	const ask = betYes ? askYes : askNo;

	// Gate: not enough edge to bet into the spread.
	if (edge < policy.minEdge) return noBet(forecast, market, now);

	// Edge-aware fractional Kelly, shrunk by confidence (model A: confidence only shrinks).
	const fStar = kellyFraction(edge, ask);
	const stakeFraction = policy.kellyFraction * forecast.confidence * fStar;

	// Discretize to whole units, capped.
	const units = clamp(
		Math.round(stakeFraction / policy.unitFraction),
		0,
		policy.maxUnits,
	);
	if (units === 0) return noBet(forecast, market, now); // rounded down to nothing

	const stakeUsd = units * unitValueUsd(policy);
	const shares = stakeUsd / ask;

	return {
		marketId: market.id,
		forecast,
		marketProbabilityYes: yes.price,
		side,
		entryAsk: ask,
		edge,
		kellyFraction: fStar,
		stakeFraction,
		units,
		suggestedStakeUsd: stakeUsd,
		suggestedShares: shares,
		requiresApproval: true, // any real position needs human sign-off
		approved: false,
		createdAt: now,
	};
}
