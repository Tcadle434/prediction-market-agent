import type { ExecuteDeps } from "./nodes/execute.js";
import type { ForecastDeps } from "./nodes/forecast.js";
import type { GatherNewsDeps } from "./nodes/gather-news.js";
import type { LogDeps } from "./nodes/log.js";
import type { SizeDeps } from "./nodes/size.js";

/**
 * Injectable dependencies for the forecast loop, grouped by node. Passed to `buildForecastGraph`,
 * which hands each group to the node that needs it — so the graph runs live by default but tests
 * swap in fakes per node. Grows a group as each later node gains real deps (sizing policy, a clock,
 * the audit sink, …).
 */
export interface AgentDeps {
	/** gatherNews deps: search, vector store, chunker, embed, rerank, topK… */
	gatherNews?: GatherNewsDeps;
	/** forecast deps: the model. */
	forecast?: ForecastDeps;
	/** size deps: the sizing policy + clock. */
	size?: SizeDeps;
	/** execute deps: the fill clock. */
	execute?: ExecuteDeps;
	/** log deps: the audit sink + clock. */
	log?: LogDeps;
}
