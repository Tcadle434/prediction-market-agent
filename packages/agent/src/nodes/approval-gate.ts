import { Command, interrupt } from "@langchain/langgraph";
import { z } from "zod";
import type { AgentNode } from "../state.js";

/** What the gate surfaces to the human when a real position needs sign-off. */
export interface ApprovalRequest {
	kind: "decision_approval";
	marketId: string;
	question: string;
	side: "yes" | "no" | null;
	units: number;
	suggestedStakeUsd: number;
	probabilityYes: number | null;
	rationale: string;
}

/** The human's reply, resumed back into the graph — validated as untrusted input. */
export const ApprovalResponseSchema = z.object({ approved: z.boolean() });
export type ApprovalResponse = z.infer<typeof ApprovalResponseSchema>;

/**
 * Build the `Command` that resumes a paused run with the human's decision. Typed with `never` for
 * the update/goto generics — a resume-only command carries neither, so this is assignable to any
 * graph's `invoke`, regardless of its node names.
 */
export function approvalCommand(
	approved: boolean,
): Command<unknown, never, never> {
	return new Command({
		resume: { approved } satisfies ApprovalResponse,
	}) as Command<unknown, never, never>;
}

/**
 * approvalGate node — pause for human sign-off before any real position.
 *
 * A no-op unless `decision.requiresApproval` (decideBet sets that for any real bet). When approval
 * is needed, `interrupt()` suspends the run and surfaces an ApprovalRequest; the graph stays parked
 * — its state checkpointed — until it's resumed with `new Command({ resume: { approved } })` (see
 * `approvalCommand`). The `interrupt()` call then returns that value, which we validate and fold
 * into `decision.approved`. Requires the graph to be compiled with a checkpointer.
 */
export const approvalGate: AgentNode = async (state) => {
	const { decision } = state;
	if (!decision?.requiresApproval) return {};

	const request: ApprovalRequest = {
		kind: "decision_approval",
		marketId: decision.marketId,
		question: state.market.question,
		side: decision.side,
		units: decision.units,
		suggestedStakeUsd: decision.suggestedStakeUsd,
		probabilityYes: decision.forecast.probabilityYes,
		rationale: decision.forecast.rationale,
	};

	const response = ApprovalResponseSchema.parse(interrupt(request));
	return { decision: { ...decision, approved: response.approved } };
};
