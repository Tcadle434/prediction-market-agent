import type { Decision, Forecast } from "@lykos/core";
import { describe, expect, it } from "vitest";
import type { AgentStateType } from "../state.js";
import { createExecuteNode } from "./execute.js";

const CLOCK = "2026-06-30T00:00:00.000Z";

const forecast: Forecast = {
	marketId: "mkt-1",
	probabilityYes: 0.65,
	confidence: 0.6,
	rationale: "Grounded.",
	citations: [],
	abstained: false,
};

function decision(overrides: Partial<Decision> = {}): Decision {
	return {
		marketId: "mkt-1",
		forecast,
		marketProbabilityYes: 0.31,
		side: "yes",
		entryAsk: 0.4,
		edge: 0.25,
		kellyFraction: 0.4,
		stakeFraction: 0.05,
		units: 5,
		suggestedStakeUsd: 50,
		suggestedShares: 125,
		requiresApproval: true,
		approved: true,
		createdAt: CLOCK,
		...overrides,
	};
}

// Only `decision` matters to execute; the rest of the state is filler.
function state(value: Decision | null): AgentStateType {
	return {
		market: {
			id: "mkt-1",
			question: "Q?",
			description: "",
			resolutionCriteria: "",
			outcomes: [],
			status: "open",
			resolvedOutcome: null,
			endDate: null,
			url: null,
			source: "polymarket",
		},
		news: [],
		forecast,
		decision: value,
		position: null,
	};
}

describe("createExecuteNode", () => {
	it("fills an approved bet at the ask into an open Position", async () => {
		const node = createExecuteNode({ now: () => CLOCK });

		const update = await node(state(decision()));

		expect(update.position).toBeDefined();
		expect(update.position).toMatchObject({
			marketId: "mkt-1",
			side: "yes",
			entryAsk: 0.4,
			shares: 125,
			costUsd: 50, // 125 × 0.40
			units: 5,
			resolved: false,
			openedAt: CLOCK,
		});
	});

	it("does not fill when approval was required but not granted", async () => {
		const node = createExecuteNode({ now: () => CLOCK });
		const update = await node(state(decision({ approved: false })));
		expect(update.position).toBeUndefined();
	});

	it("does not fill a no-bet decision", async () => {
		const node = createExecuteNode({ now: () => CLOCK });
		const update = await node(
			state(
				decision({
					side: null,
					units: 0,
					entryAsk: null,
					requiresApproval: false,
					approved: false,
				}),
			),
		);
		expect(update.position).toBeUndefined();
	});
});
