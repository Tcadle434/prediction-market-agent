import { ChatAnthropic } from "@langchain/anthropic";
import { type ForecastDraft, ForecastDraftSchema } from "./draft.js";
import type { ForecastPrompt } from "./prompt.js";

/**
 * The model seam: turn a prompt into a structured draft. The node depends on this function type,
 * not on any SDK — so tests inject a fake that returns a canned draft, and nothing offline touches
 * the network (same pattern as P1's embed / rerank seams).
 */
export type ForecastModel = (prompt: ForecastPrompt) => Promise<ForecastDraft>;

const DEFAULT_MODEL = process.env.LYKOS_FORECAST_MODEL ?? "claude-sonnet-4-6";

export interface LiveForecastModelOptions {
	/** Anthropic model id. Defaults to `$LYKOS_FORECAST_MODEL` or claude-sonnet-4-6. */
	model?: string;
	/** Sampling temperature. Defaults to 0 — forecasting wants consistency, not variety. */
	temperature?: number;
}

/**
 * The live ForecastModel: ChatAnthropic constrained to the draft schema via `withStructuredOutput`,
 * which makes the model emit a tool call matching the schema instead of free text. Auto-traced to
 * LangSmith when `LANGSMITH_TRACING=true`. We re-parse the result with Zod as a boundary check —
 * model output is untrusted until it validates.
 */
export function liveForecastModel(
	options: LiveForecastModelOptions = {},
): ForecastModel {
	const llm = new ChatAnthropic({
		model: options.model ?? DEFAULT_MODEL,
		temperature: options.temperature ?? 0,
	});
	const structured = llm.withStructuredOutput(ForecastDraftSchema, {
		name: "forecast",
	});

	return async (prompt) => {
		const draft = await structured.invoke([
			["system", prompt.system],
			["human", prompt.user],
		]);
		return ForecastDraftSchema.parse(draft);
	};
}
