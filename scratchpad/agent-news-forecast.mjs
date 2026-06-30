/**
 * P2 step 4 live demo — run the graph's first two real nodes end to end on a real market:
 *   gatherNews (Tavily → Voyage → in-memory store → retrieve) → forecast (Claude).
 * The remaining nodes are still stubs, so the run flows straight through them.
 *
 *   pnpm --filter @lykos/agent build
 *   node --env-file=.env scratchpad/agent-news-forecast.mjs   # needs TAVILY + VOYAGE + ANTHROPIC keys
 */
import {
	approvalCommand,
	buildForecastGraph,
} from "../packages/agent/dist/index.js";

const market = {
	id: "fed-dec-2026",
	question:
		"Will the U.S. Federal Reserve cut interest rates at its December 2026 meeting?",
	description:
		"Resolves YES if the FOMC lowers the federal funds target range at its December 2026 meeting.",
	resolutionCriteria: "",
	outcomes: [
		{ name: "Yes", price: 0.3, bid: 0.29, ask: 0.31 },
		{ name: "No", price: 0.7, bid: 0.69, ask: 0.71 },
	],
	status: "open",
	resolvedOutcome: null,
	endDate: null,
	url: null,
	source: "polymarket",
};

const graph = buildForecastGraph(); // all-live defaults
const config = { configurable: { thread_id: "fed-dec-2026" } };

console.log("running gatherNews → forecast on a real market…\n");
let result = await graph.invoke({ market }, config);

console.log(`news: ${result.news.length} passages retrieved`);
for (const passage of result.news) {
	console.log(`  - [${passage.id}] ${passage.title} (${passage.url})`);
}
console.log("\nforecast:");
console.log(JSON.stringify(result.forecast, null, 2));

// A real bet trips the approval gate; auto-approve here to run to completion.
if (result.__interrupt__?.length) {
	console.log(
		"\n⏸  approval gate paused the run; auto-approving for the demo…",
	);
	result = await graph.invoke(approvalCommand(true), config);
}
console.log("\ndecision:", JSON.stringify(result.decision, null, 2));
