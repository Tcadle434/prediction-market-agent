import type { Market } from "@lykos/core";
import { describe, expect, it } from "vitest";
import { GENESIS_HASH, InMemoryAuditLog } from "../audit/index.js";
import type { AgentStateType } from "../state.js";
import { createLogNode } from "./log.js";

const market: Market = {
	id: "mkt-1",
	question: "Will the Fed cut rates in December?",
	description: "",
	resolutionCriteria: "",
	outcomes: [],
	status: "open",
	resolvedOutcome: null,
	endDate: null,
	url: null,
	source: "polymarket",
};

function state(): AgentStateType {
	return { market, news: [], forecast: null, decision: null, position: null };
}

describe("createLogNode", () => {
	it("appends an audit record anchored to the genesis hash on the first run", async () => {
		const sink = new InMemoryAuditLog();
		const node = createLogNode({ sink, now: () => "2026-06-30T00:00:00.000Z" });

		await node(state());

		const records = await sink.records();
		expect(records).toHaveLength(1);
		expect(records[0]?.prevHash).toBe(GENESIS_HASH);
		expect(records[0]?.seq).toBe(0);
		expect(records[0]?.marketId).toBe("mkt-1");
		expect(records[0]?.hash).toHaveLength(64);
	});

	it("chains each record to the previous one's hash (tamper-evident)", async () => {
		const sink = new InMemoryAuditLog();
		const node = createLogNode({ sink, now: () => "2026-06-30T00:00:00.000Z" });

		await node(state());
		await node(state());

		const records = await sink.records();
		expect(records).toHaveLength(2);
		expect(records[1]?.prevHash).toBe(records[0]?.hash);
		expect(records[1]?.seq).toBe(1);
	});
});
