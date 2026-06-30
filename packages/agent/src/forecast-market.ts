import type { Forecast, Market } from "@lykos/core";
import { createForecastNode, type ForecastDeps } from "./nodes/forecast.js";
import {
	createGatherNewsNode,
	type GatherNewsDeps,
} from "./nodes/gather-news.js";
import type { RetrievedPassage } from "./passage.js";
import type { AgentStateType } from "./state.js";

export interface ForecastMarketDeps {
	gatherNews?: GatherNewsDeps;
	forecast?: ForecastDeps;
}

export interface ForecastMarketResult {
	news: RetrievedPassage[];
	forecast: Forecast | null;
}

/**
 * Research + forecast a market — just `gatherNews → forecast`, skipping sizing / approval /
 * execution. The lightweight entry point for "give me a grounded probability + its evidence":
 * used by the eval bridge (which needs the rationale and the retrieved context) and anywhere a
 * forecast is wanted without the betting machinery. The full loop is `buildForecastGraph`.
 */
export async function forecastMarket(
	market: Market,
	deps: ForecastMarketDeps = {},
): Promise<ForecastMarketResult> {
	const gather = createGatherNewsNode(deps.gatherNews);
	const forecast = createForecastNode(deps.forecast);

	const base: AgentStateType = {
		market,
		news: [],
		forecast: null,
		decision: null,
		position: null,
	};
	const gathered = { ...base, ...(await gather(base)) };
	const forecasted = { ...gathered, ...(await forecast(gathered)) };

	return { news: forecasted.news, forecast: forecasted.forecast };
}
