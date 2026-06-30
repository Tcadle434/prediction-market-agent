/**
 * P2 step 2 demo — run the skeleton forecast graph end to end on a fake market.
 *
 * Every node is a stub, so this needs NO API keys or DB: it proves the graph compiles, runs each
 * node in order, and threads state through with the reducers/defaults applied.
 *
 *   pnpm --filter @lykos/agent build   # produce dist/
 *   node scratchpad/agent-skeleton.mjs
 */
import { buildForecastGraph } from "../packages/agent/dist/index.js";

// A minimal, shape-valid Market (Yes/No binary). It just flows through the stubs.
const market = {
	id: "demo-fed-dec",
	question: "Will the Fed cut rates at the December meeting?",
	description: "",
	resolutionCriteria: "",
	outcomes: [
		{ name: "Yes", price: 0.32, bid: 0.31, ask: 0.33 },
		{ name: "No", price: 0.68, bid: 0.67, ask: 0.69 },
	],
	status: "open",
	resolvedOutcome: null,
	endDate: null,
	url: null,
	source: "polymarket",
};

const graph = buildForecastGraph();

// The graph is compiled with a checkpointer, so every run needs a thread_id.
console.log("running the skeleton graph on a fake market…\n");
for await (const step of await graph.stream(
	{ market },
	{ streamMode: "updates", configurable: { thread_id: "skeleton-stream" } },
)) {
	const [node, update] = Object.entries(step)[0];
	console.log(`▶ ${node.padEnd(13)} → ${JSON.stringify(update)}`);
}

const finalState = await graph.invoke(
	{ market },
	{ configurable: { thread_id: "skeleton-invoke" } },
);
console.log("\nfinal state:");
console.log("  market  :", finalState.market.id);
console.log("  news    :", finalState.news.length, "passages");
console.log("  forecast:", finalState.forecast);
console.log("  decision:", finalState.decision);
console.log("  position:", finalState.position);
