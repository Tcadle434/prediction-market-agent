/**
 * Run the FULL agent loop over a REAL Polymarket market — with an interactive approval prompt.
 *
 * Fetches the top open market by volume (or one you name by id), runs gatherNews → forecast → size,
 * then PAUSES at the approval gate so YOU approve or deny at the terminal; on approval it fills a
 * paper position and writes the audit record.
 *
 *   pnpm --filter @lykos/agent build && pnpm --filter @lykos/ingest build
 *   node --env-file=.env scratchpad/agent-live.mjs [marketId]
 *
 * Needs TAVILY + VOYAGE + ANTHROPIC keys (root .env); Gamma is public.
 */
import { createInterface } from "node:readline/promises";
import {
	approvalCommand,
	buildForecastGraph,
	InMemoryAuditLog,
} from "../packages/agent/dist/index.js";
import { fetchMarkets } from "../packages/ingest/dist/index.js";

const wantedId = process.argv[2];
const markets = await fetchMarkets({
	active: true,
	closed: false,
	order: "volumeNum",
	ascending: false,
	limit: wantedId ? 100 : 1,
});
const market = wantedId ? markets.find((m) => m.id === wantedId) : markets[0];
if (!market) {
	console.error(
		wantedId ? `market ${wantedId} not found` : "no open markets returned",
	);
	process.exit(1);
}

console.log(`market: ${market.question}`);
const yes = market.outcomes.find((o) => o.name.toLowerCase() === "yes");
console.log(
	`market-implied P(yes): ${yes?.price ?? "?"} (ask ${yes?.ask ?? "?"})\n`,
);

const auditLog = new InMemoryAuditLog();
const graph = buildForecastGraph({ log: { sink: auditLog } });
const config = { configurable: { thread_id: `live-${market.id}` } };

console.log("researching + forecasting (Tavily → Voyage → Claude)…\n");
let result = await graph.invoke({ market }, config);

console.log("forecast:", JSON.stringify(result.forecast, null, 2));
console.log("\ndecision:", JSON.stringify(result.decision, null, 2));

if (result.__interrupt__?.length) {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await rl.question("\nApprove this paper bet? (y/n) ");
	rl.close();
	const approved = answer.trim().toLowerCase().startsWith("y");
	console.log(
		approved ? "\n→ approved; filling…\n" : "\n→ denied; no position.\n",
	);
	result = await graph.invoke(approvalCommand(approved), config);
}

console.log("position:", JSON.stringify(result.position, null, 2));
console.log("\naudit trail:");
for (const r of await auditLog.records()) {
	console.log(
		`  #${r.seq} ${r.hash.slice(0, 12)}… side=${r.side} units=${r.units} approved=${r.approved} pos=${r.positionId}`,
	);
}
