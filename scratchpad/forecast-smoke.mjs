/**
 * P2 step 3 live smoke — run the real forecast node against Claude on a fake market + passages.
 * Verifies the ChatAnthropic + structured-output path end to end (and citation resolution).
 *
 *   pnpm --filter @lykos/agent build
 *   node --env-file=.env scratchpad/forecast-smoke.mjs     # needs ANTHROPIC_API_KEY (root .env)
 */
import { createForecastNode } from "../packages/agent/dist/index.js";

const market = {
	id: "demo-fed-dec",
	question: "Will the Fed cut rates at the December meeting?",
	description:
		"Resolves YES if the FOMC lowers the target range at its December meeting.",
	resolutionCriteria: "",
	outcomes: [
		{ name: "Yes", price: 0.22, bid: 0.21, ask: 0.23 },
		{ name: "No", price: 0.78, bid: 0.77, ask: 0.79 },
	],
	status: "open",
	resolvedOutcome: null,
	endDate: null,
	url: null,
	source: "polymarket",
};

const news = [
	{
		id: "fed-hold#0",
		evidenceId: "fed-hold",
		text: "The Federal Reserve held its benchmark rate steady at the October meeting and Chair Powell said the committee is in no hurry to cut, citing inflation that remains above the 2% target.",
		index: 0,
		tokenCount: 38,
		publishedAt: "2026-06-12",
		similarity: 0.91,
		rerankScore: 0.86,
		url: "https://example.com/fed-october",
		title: "Fed holds rates, signals patience",
	},
	{
		id: "cpi-hot#0",
		evidenceId: "cpi-hot",
		text: "After a hotter-than-expected CPI print, prediction markets trimmed the odds of a December cut to roughly 20%, with traders citing sticky services inflation.",
		index: 0,
		tokenCount: 30,
		publishedAt: "2026-06-18",
		similarity: 0.89,
		rerankScore: 0.83,
		url: "https://example.com/cpi-june",
		title: "Hot CPI cools rate-cut bets",
	},
];

const node = createForecastNode(); // live ChatAnthropic model
const state = { market, news, forecast: null, decision: null, position: null };

console.log("asking Claude to forecast…\n");
const update = await node(state);
console.log(JSON.stringify(update.forecast, null, 2));
