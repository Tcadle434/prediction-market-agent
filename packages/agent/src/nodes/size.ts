import type { AgentNode } from "../state.js";

/**
 * size — STUB (real impl: P2 step 5).
 *
 * Will call the already-built `decideBet(forecast, market, policy, now)` to turn the forecast into
 * a sizing `Decision` (side, units, requiresApproval). Writes `state.decision`. Pass-through for now.
 */
export const size: AgentNode = async (_state) => {
	return {};
};
