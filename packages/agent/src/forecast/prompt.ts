import type { Market } from "@lykos/core";
import type { RetrievedPassage } from "../passage.js";

/** A system + user message pair, ready to hand to the model. */
export interface ForecastPrompt {
	system: string;
	user: string;
}

/**
 * Model (A) forecasting rules. Kept in the system message so they apply to every market: an honest
 * mean probability, uncertainty expressed only through `confidence`, strict grounding in the
 * passages, and abstention as a first-class outcome rather than a guess.
 */
const SYSTEM_PROMPT = `You are Lykos, a calibrated forecaster for binary (Yes/No) prediction markets.
Estimate the probability the market resolves YES, grounded strictly in the evidence passages provided.

Rules:
- probabilityYes is your HONEST mean probability in [0,1]. Do not shade it toward 0.5 to express doubt.
- confidence in [0,1] is how much you trust the edge is real (estimation / model risk). It is the only channel for uncertainty.
- Ground every claim in the provided passages and cite the ones you rely on by their [id] label. Never use outside facts or invent a source.
- If the evidence is too thin to commit, abstain (probabilityYes null, abstained true). Abstaining is valid and better than guessing.`;

/** Render one passage as `[id] (title — url)` followed by its text, for the evidence block. */
function renderPassage(passage: RetrievedPassage): string {
	return `[${passage.id}] (${passage.title} — ${passage.url})\n${passage.text}`;
}

/** Build the system + user prompt for a market and its retrieved passages. */
export function buildForecastPrompt(
	market: Market,
	passages: RetrievedPassage[],
): ForecastPrompt {
	const evidence =
		passages.length > 0
			? passages.map(renderPassage).join("\n\n")
			: "(no evidence was retrieved)";

	const details = [
		`Question: ${market.question}`,
		market.description ? `Description: ${market.description}` : null,
		market.resolutionCriteria ? `Resolves: ${market.resolutionCriteria}` : null,
	]
		.filter(Boolean)
		.join("\n");

	const user = `MARKET\n${details}\n\nEVIDENCE PASSAGES\n${evidence}\n\nProduce your forecast.`;
	return { system: SYSTEM_PROMPT, user };
}
