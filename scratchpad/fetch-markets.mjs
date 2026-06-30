/**
 * Fetch real, open Polymarket markets (by volume) and write their questions for the eval dataset.
 * Gamma is a public API — no key, just POLYMARKET_GAMMA_URL from .env.
 *
 *   node --env-file=.env scratchpad/fetch-markets.mjs [count]   # default 10
 *
 * Writes eval/data/live_markets.json: [{ id, question }] — what run_agent_eval.py seeds.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fetchMarkets } from "../packages/ingest/dist/index.js";

const count = Number(process.argv[2] ?? 10);

const markets = await fetchMarkets({
	active: true,
	closed: false,
	order: "volumeNum",
	ascending: false,
	limit: count,
});

const rows = markets.map((m) => ({ id: m.id, question: m.question }));
const outPath = fileURLToPath(
	new URL("../eval/data/live_markets.json", import.meta.url),
);
await writeFile(outPath, `${JSON.stringify(rows, null, 2)}\n`);

console.log(`wrote ${rows.length} real markets → eval/data/live_markets.json`);
for (const row of rows) console.log(`  - ${row.question}`);
