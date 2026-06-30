import type { ForecastModel } from "./forecast/index.js";

/**
 * Injectable dependencies for the forecast loop. Passed to `buildForecastGraph` and handed to the
 * nodes that need them, so the graph runs live by default but tests can swap in fakes. Grows as
 * later nodes gain real deps (the vector store, sizing policy, a clock, …).
 */
export interface AgentDeps {
	/** Override the forecast model — tests pass a fake; default is the live ChatAnthropic one. */
	forecastModel?: ForecastModel;
}
