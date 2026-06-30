import type { AgentNode } from "../state.js";

/**
 * approvalGate — STUB (real impl: P2 step 6).
 *
 * Will call LangGraph's `interrupt()` when `state.decision.requiresApproval` is true: pause the
 * run, surface the decision for human sign-off, and resume (checkpointer-backed) only once a human
 * approves. Pass-through for now. No-op when no approval is needed.
 */
export const approvalGate: AgentNode = async (_state) => {
	return {};
};
