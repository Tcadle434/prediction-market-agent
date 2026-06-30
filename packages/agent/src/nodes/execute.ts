import { type Position, PositionSchema } from "@lykos/core";
import type { AgentNode } from "../state.js";

export interface ExecuteDeps {
	/** Clock for the fill timestamp — injected so tests are deterministic. Default: wall clock. */
	now?: () => string;
}

/**
 * execute node — fill an approved decision as a paper trade → `Position`.
 *
 * Writes nothing unless there's a real, approved bet to fill: a no-bet decision (side null / zero
 * units) is skipped, and a bet that needed approval but didn't get it is skipped too. The fill is
 * simulated at the decision's `entryAsk` (the best ask we'd pay); Polymarket is fee-free, so
 * feesUsd is 0. The resulting Position is open (unresolved) until the market settles (a later step).
 */
export function createExecuteNode(deps: ExecuteDeps = {}): AgentNode {
	const now = deps.now ?? (() => new Date().toISOString());

	return async (state) => {
		const { decision } = state;
		if (!decision || decision.side === null || decision.units <= 0) return {};
		if (decision.requiresApproval && !decision.approved) return {}; // denied / unapproved
		if (decision.entryAsk === null) return {}; // no price to fill at (defensive)

		const openedAt = now();
		const shares = decision.suggestedShares;
		const feesUsd = 0;

		const position: Position = {
			id: `pos-${decision.marketId}-${openedAt}`,
			decisionId: `dec-${decision.marketId}-${decision.createdAt}`,
			marketId: decision.marketId,
			side: decision.side,
			entryAsk: decision.entryAsk,
			shares,
			costUsd: shares * decision.entryAsk + feesUsd,
			feesUsd,
			units: decision.units,
			openedAt,
			resolved: false,
			won: null,
			payoutUsd: null,
			pnlUsd: null,
			returnOnStake: null,
			unitsPnl: null,
			settledAt: null,
		};
		return { position: PositionSchema.parse(position) };
	};
}
