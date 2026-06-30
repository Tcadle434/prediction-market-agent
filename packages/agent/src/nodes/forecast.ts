import type { AgentNode } from "../state.js";

/**
 * forecast — STUB (real impl: P2 step 3).
 *
 * Will call Claude (@langchain/anthropic, structured output) over `state.news` to produce a
 * grounded `Forecast` — probabilityYes + confidence + cited rationale — or an abstain. Writes
 * `state.forecast`. Pass-through for now.
 */
export const forecast: AgentNode = async (_state) => {
	return {};
};
