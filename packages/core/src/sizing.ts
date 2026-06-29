/**
 * Bet-sizing policy: the risk knobs that turn a forecast into a number of units.
 *
 * This file holds only the POLICY (the parameters) and sensible defaults. The pure function
 * that applies it — forecast + market + policy -> Decision — lives in @lykos/sizing's
 * decide.ts, which is also the canonical home for the full sizing formula.
 */
import { z } from "zod";

export const SizingPolicySchema = z.object({
	bankrollUsd: z.number().positive(),
	unitFraction: z.number().positive(), // bankroll fraction per unit, e.g. 0.01 = 1%
	kellyFraction: z.number().positive().max(1), // λ — fractional Kelly, e.g. 0.25 (quarter)
	minEdge: z.number().min(0).max(1), // skip bets with edge below this, e.g. 0.04 (4 pts)
	maxUnits: z.number().int().positive(), // hard cap on units per market, e.g. 5
	feeRate: z.number().min(0).default(0), // proportional trading fee (0 for Polymarket)
});
export type SizingPolicy = z.infer<typeof SizingPolicySchema>;

export const DEFAULT_SIZING_POLICY: SizingPolicy = {
	bankrollUsd: 1000,
	unitFraction: 0.01, // bankroll fraction per unit (dollar value = bankrollUsd × unitFraction)
	kellyFraction: 0.25, // quarter Kelly — full Kelly is too swingy
	minEdge: 0.04, // need a 4-point edge to bet into the spread
	maxUnits: 5, // hard cap per market (as a bankroll fraction: maxUnits × unitFraction)
	feeRate: 0,
};
