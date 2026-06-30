import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import type { Decision, Forecast, Market } from "@lykos/core";
import { describe, expect, it } from "vitest";
import { AgentState } from "../state.js";
import {
	type ApprovalRequest,
	approvalCommand,
	approvalGate,
} from "./approval-gate.js";

const market: Market = {
	id: "mkt-1",
	question: "Will the Fed cut rates in December?",
	description: "",
	resolutionCriteria: "",
	outcomes: [
		{ name: "Yes", price: 0.31, bid: 0.3, ask: 0.31 },
		{ name: "No", price: 0.69, bid: 0.69, ask: 0.71 },
	],
	status: "open",
	resolvedOutcome: null,
	endDate: null,
	url: null,
	source: "polymarket",
};

const forecast: Forecast = {
	marketId: "mkt-1",
	probabilityYes: 0.65,
	confidence: 0.6,
	rationale: "Grounded in the evidence.",
	citations: [],
	abstained: false,
};

function decision(overrides: Partial<Decision> = {}): Decision {
	return {
		marketId: "mkt-1",
		forecast,
		marketProbabilityYes: 0.31,
		side: "yes",
		entryAsk: 0.31,
		edge: 0.34,
		kellyFraction: 0.49,
		stakeFraction: 0.07,
		units: 5,
		suggestedStakeUsd: 50,
		suggestedShares: 161,
		requiresApproval: true,
		approved: false,
		createdAt: "2026-06-30T00:00:00.000Z",
		...overrides,
	};
}

/** A minimal graph that runs only the approvalGate, so we exercise interrupt/resume in isolation. */
function gateGraph() {
	return new StateGraph(AgentState)
		.addNode("approvalGate", approvalGate)
		.addEdge(START, "approvalGate")
		.addEdge("approvalGate", END)
		.compile({ checkpointer: new MemorySaver() });
}

/** Read LangGraph's interrupt marker off an invoke result (not in the typed state shape). */
function interruptOf(result: unknown): { value: ApprovalRequest } | undefined {
	return (result as { __interrupt__?: Array<{ value: ApprovalRequest }> })
		.__interrupt__?.[0];
}

describe("approvalGate", () => {
	it("pauses when approval is required, surfacing the decision for review", async () => {
		const graph = gateGraph();
		const config = { configurable: { thread_id: "needs-approval" } };

		const result = await graph.invoke({ market, decision: decision() }, config);

		const paused = interruptOf(result);
		expect(paused).toBeDefined();
		expect(paused?.value).toMatchObject({
			kind: "decision_approval",
			side: "yes",
			units: 5,
		});
	});

	it("records approval when the human approves on resume", async () => {
		const graph = gateGraph();
		const config = { configurable: { thread_id: "approve" } };

		await graph.invoke({ market, decision: decision() }, config);
		const resumed = await graph.invoke(approvalCommand(true), config);

		expect(resumed.decision?.approved).toBe(true);
	});

	it("records rejection when the human declines on resume", async () => {
		const graph = gateGraph();
		const config = { configurable: { thread_id: "reject" } };

		await graph.invoke({ market, decision: decision() }, config);
		const resumed = await graph.invoke(approvalCommand(false), config);

		expect(resumed.decision?.approved).toBe(false);
	});

	it("passes straight through (no pause) when approval is not required", async () => {
		const graph = gateGraph();
		const config = { configurable: { thread_id: "no-approval" } };

		const result = await graph.invoke(
			{
				market,
				decision: decision({ requiresApproval: false, side: null, units: 0 }),
			},
			config,
		);

		expect(interruptOf(result)).toBeUndefined();
		expect(result.decision?.approved).toBe(false);
	});

	it("passes through when there is no decision", async () => {
		const graph = gateGraph();
		const config = { configurable: { thread_id: "no-decision" } };

		const result = await graph.invoke({ market }, config);

		expect(interruptOf(result)).toBeUndefined();
		expect(result.decision).toBeNull();
	});
});
