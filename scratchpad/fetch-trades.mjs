/**
 * Live smoke test for the order-flow fetch (P2 step 8a). Pulls the top open market by volume,
 * then fetches its recent on-chain trades and prints a quick sanity summary.
 *
 *   pnpm --filter @lykos/ingest build
 *   node --env-file=.env scratchpad/fetch-trades.mjs [marketId] [limit]
 *
 * data-api is public — no key needed.
 */
import { fetchMarkets, fetchTrades } from "../packages/ingest/dist/index.js";

const wantedId = process.argv[2];
const limit = Number(process.argv[3] ?? 200);

const markets = await fetchMarkets({
	active: true,
	closed: false,
	order: "volumeNum",
	ascending: false,
	limit: wantedId ? 100 : 1,
});
const market = wantedId ? markets.find((m) => m.id === wantedId) : markets[0];
if (!market) {
	console.error(wantedId ? `market ${wantedId} not found` : "no open markets");
	process.exit(1);
}
if (!market.conditionId) {
	console.error(`market ${market.id} has no conditionId`);
	process.exit(1);
}

console.log(`market: ${market.question}`);
console.log(`conditionId: ${market.conditionId}\n`);

const trades = await fetchTrades(market.conditionId, { limit });
console.log(`fetched ${trades.length} trades (limit ${limit})\n`);

// Quick sanity: side/outcome mix + timestamp span, so we can eyeball that the feed is real.
const by = (key) =>
	trades.reduce((acc, t) => {
		acc[t[key]] = (acc[t[key]] ?? 0) + 1;
		return acc;
	}, {});
const ts = trades.map((t) => t.timestamp);
console.log("sides:   ", by("side"));
console.log("outcomes:", by("outcome"));
if (ts.length) {
	const spanH = ((Math.max(...ts) - Math.min(...ts)) / 3600).toFixed(1);
	console.log(`span:     ${spanH}h  (newest-first: ${ts[0] >= ts.at(-1)})`);
}
console.log("\nnewest trade:", JSON.stringify(trades[0], null, 2));
