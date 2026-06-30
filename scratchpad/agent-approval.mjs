/**
 * P2 step 6 demo — the human-in-the-loop approval gate, with NO API keys.
 *
 * Injects fakes for search + the forecast model so the loop reaches a real, sized decision that
 * requires approval, then shows the graph PAUSE at the gate and RESUME once a human approves.
 *
 *   pnpm --filter @lykos/agent build
 *   node scratchpad/agent-approval.mjs
 */
import {
	approvalCommand,
	buildForecastGraph,
	InMemoryAuditLog,
} from "../packages/agent/dist/index.js";

const market = {
	id: "demo-approval",
	question: "Will event X resolve YES by year end?",
	description: "",
	resolutionCriteria: "",
	outcomes: [
		{ name: "Yes", price: 0.4, bid: 0.39, ask: 0.4 },
		{ name: "No", price: 0.6, bid: 0.6, ask: 0.62 },
	],
	status: "open",
	resolvedOutcome: null,
	endDate: null,
	url: null,
	source: "polymarket",
};

// Inject an audit log we can read back after the run.
const auditLog = new InMemoryAuditLog();

// Fakes: skip real search; return a confident forecast so size produces a real (approval-needing) bet.
const graph = buildForecastGraph({
	gatherNews: { search: async () => [] },
	forecast: {
		model: async () => ({
			probabilityYes: 0.7,
			confidence: 0.85,
			abstained: false,
			rationale: "Strong edge versus the 0.40 ask (demo).",
			citedChunkIds: [],
		}),
	},
	log: { sink: auditLog },
});

const config = { configurable: { thread_id: "approval-demo" } };

console.log("running the loop until the approval gate…\n");
let result = await graph.invoke({ market }, config);

const paused = result.__interrupt__?.[0];
if (paused) {
	console.log("⏸  PAUSED — awaiting human approval:");
	console.log(JSON.stringify(paused.value, null, 2));
	console.log("\n→ human approves; resuming…\n");
	result = await graph.invoke(approvalCommand(true), config);
}

console.log("resumed to completion:");
console.log("  side    :", result.decision?.side);
console.log("  units   :", result.decision?.units);
console.log("  approved:", result.decision?.approved);

console.log("\nexecuted position (paper fill):");
console.log("  ", JSON.stringify(result.position));

console.log("\naudit trail:");
for (const record of await auditLog.records()) {
	console.log(
		`  #${record.seq} ${record.hash.slice(0, 12)}… (prev ${record.prevHash.slice(0, 8)}…) side=${record.side} units=${record.units} approved=${record.approved} pos=${record.positionId}`,
	);
}
