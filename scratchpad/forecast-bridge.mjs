/**
 * Eval bridge — research + forecast ONE market question, print the result as JSON to stdout.
 *
 * This is the seam the Python eval calls (D6): the eval is Python, the agent is TS, so the target
 * shells out to this and parses stdout. Only JSON goes to stdout; everything else stays on stderr.
 *
 *   node --env-file=.env scratchpad/forecast-bridge.mjs "<market question>"
 *
 * Needs TAVILY + VOYAGE + ANTHROPIC keys (root .env).
 */
import { forecastMarket } from "../packages/agent/dist/index.js";

const question = process.argv[2];
if (!question) {
	process.stderr.write('usage: forecast-bridge.mjs "<question>"\n');
	process.exit(1);
}

// Forecasting only needs the question (+ description/criteria); outcomes/prices are for sizing.
const market = {
	id: "eval",
	question,
	description: "",
	resolutionCriteria: "",
	outcomes: [],
	status: "open",
	resolvedOutcome: null,
	endDate: null,
	url: null,
	source: "polymarket",
};

const { news, forecast } = await forecastMarket(market);

// The "context" the judges score against = the retrieved passages the forecast was grounded in.
const context = news.map((p) => `[${p.id}] ${p.title}\n${p.text}`).join("\n\n");

process.stdout.write(
	JSON.stringify({
		question,
		probabilityYes: forecast?.probabilityYes ?? null,
		confidence: forecast?.confidence ?? 0,
		abstained: forecast?.abstained ?? true,
		rationale: forecast?.rationale ?? "",
		context,
		passageCount: news.length,
	}),
);
