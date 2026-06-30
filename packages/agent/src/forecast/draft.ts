import { z } from "zod";

/**
 * Anthropic tool-use occasionally serializes an array field as a JSON *string* instead of a real
 * array. Coerce it back before validation; if it isn't valid JSON, pass it through unchanged so Zod
 * surfaces a clean error rather than this helper swallowing it. We keep the array elements plain
 * strings (chunk ids) precisely so this round-trip is safe — free text with embedded quotes would
 * produce malformed JSON that can't be recovered.
 */
function coerceJsonArray(value: unknown): unknown {
	if (typeof value !== "string") return value;
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

/**
 * What the model returns (its structured output) — a DRAFT, not a Forecast.
 *
 * The model judges the market and cites passages by id + exact quote, but it deliberately does NOT
 * author `marketId`, `evidenceId`, or urls: those are resolved from the retrieved passages so the
 * model can't fabricate a source. See `assembleForecast`. Each `.describe()` becomes part of the
 * JSON schema the model is handed, so the field instructions travel with the tool definition.
 */
export const ForecastDraftSchema = z.object({
	probabilityYes: z
		.number()
		.min(0)
		.max(1)
		.nullable()
		.describe(
			"Your honest best-estimate MEAN probability the market resolves YES, in [0,1]. Use null ONLY when abstaining. Do not shade this toward 0.5 to express doubt — that is what confidence is for.",
		),
	confidence: z
		.number()
		.min(0)
		.max(1)
		.describe(
			"How much you trust this edge is real, in [0,1] (estimation / model risk). This is the ONLY place uncertainty belongs: it shrinks the eventual bet, it does not move the probability.",
		),
	abstained: z
		.boolean()
		.describe(
			"true when the provided evidence is too thin to commit to a probability.",
		),
	rationale: z
		.string()
		.describe(
			"2–4 sentences explaining the estimate, grounded ONLY in the provided passages.",
		),
	citedChunkIds: z
		.preprocess(coerceJsonArray, z.array(z.string()))
		.describe(
			"The ids (the [id] labels) of the passages you actually relied on. Cite only provided passages; never invent one. We attach the exact passage text as the quote.",
		),
});
export type ForecastDraft = z.infer<typeof ForecastDraftSchema>;
