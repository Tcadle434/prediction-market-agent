import {
	assembleForecast,
	buildForecastPrompt,
	type ForecastModel,
	liveForecastModel,
} from "../forecast/index.js";
import type { AgentNode } from "../state.js";

export interface ForecastDeps {
	/** Override the forecast model — tests pass a fake; default is the live ChatAnthropic one. */
	model?: ForecastModel;
}

/**
 * forecast node — produce a grounded Forecast for the market from the retrieved news.
 *
 * Build a prompt from the market + passages, ask the model for a draft, then assemble + validate it
 * (resolving citations against the real passages). The model is injectable: the graph uses the live
 * ChatAnthropic-backed one by default; tests pass a fake. The live model is built lazily on first
 * run, so building the graph needs no API key — only running this node does.
 */
export function createForecastNode(deps: ForecastDeps = {}): AgentNode {
	let resolved = deps.model;
	return async (state) => {
		resolved ??= liveForecastModel();
		const prompt = buildForecastPrompt(state.market, state.news);
		const draft = await resolved(prompt);
		const forecast = assembleForecast(state.market, state.news, draft);
		return { forecast };
	};
}
