import type { AgentNode } from "../state.js";

/**
 * log — STUB (real impl: P2 step 7).
 *
 * Will append a hash-chained audit record (market, forecast, decision, position + run trace id) so
 * every run is tamper-evident and replayable. Writes nothing to state. Pass-through for now.
 */
export const log: AgentNode = async (_state) => {
	return {};
};
