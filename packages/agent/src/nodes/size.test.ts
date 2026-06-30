import type { Forecast, Market } from "@lykos/core";
import { describe, expect, it } from "vitest";
import type { AgentStateType } from "../state.js";
import { createSizeNode } from "./size.js";

const CLOCK = "2026-06-30T00:00:00.000Z";

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

function forecast(overrides: Partial<Forecast> = {}): Forecast {
	return {
		marketId: "mkt-1",
		probabilityYes: 0.65,
		confidence: 0.6,
		rationale: "Grounded.",
		citations: [],
		abstained: false,
		...overrides,
	};
}

function state(value: Forecast | null): AgentStateType {
	return { market, news: [], forecast: value, decision: null, position: null };
}

describe("createSizeNode", () => {
	it("sizes a forecast with edge into a yes bet, stamped with the injected clock", async () => {
		const node = createSizeNode({ now: () => CLOCK });

		const update = await node(state(forecast()));

		expect(update.decision?.marketId).toBe("mkt-1");
		expect(update.decision?.side).toBe("yes");
		expect(update.decision?.units).toBeGreaterThan(0);
		expect(update.decision?.createdAt).toBe(CLOCK);
	});

	it("produces a no-bet decision when the forecast abstains", async () => {
		const node = createSizeNode({ now: () => CLOCK });

		const update = await node(
			state(forecast({ abstained: true, probabilityYes: null, confidence: 0 })),
		);

		expect(update.decision?.side).toBeNull();
		expect(update.decision?.units).toBe(0);
	});

	it("writes no decision when there is no forecast", async () => {
		const node = createSizeNode();
		const update = await node(state(null));
		expect(update.decision).toBeUndefined();
	});
});
