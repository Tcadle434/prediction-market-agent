import {
	type Citation,
	type Forecast,
	ForecastSchema,
	type Market,
} from "@lykos/core";
import type { RetrievedPassage } from "../passage.js";
import type { ForecastDraft } from "./draft.js";

/**
 * Resolve the chunk ids the model cited against the passages it was actually given. Keep only ids
 * that match a retrieved passage (dedup'd), and build each Citation entirely from that passage —
 * evidenceId, url, and the verbatim chunk text as the quote. The model only ever names ids, so a
 * citation can only point at real retrieved evidence, and the quote is guaranteed to be the actual
 * passage text rather than a model transcription that might drift.
 */
export function resolveCitations(
	draft: ForecastDraft,
	passages: RetrievedPassage[],
): Citation[] {
	const byId = new Map(passages.map((passage) => [passage.id, passage]));
	const seen = new Set<string>();
	const citations: Citation[] = [];
	for (const chunkId of draft.citedChunkIds) {
		if (seen.has(chunkId)) continue;
		const passage = byId.get(chunkId);
		if (!passage) continue; // invented / stale id — drop it
		seen.add(chunkId);
		citations.push({
			chunkId: passage.id,
			evidenceId: passage.evidenceId,
			url: passage.url,
			quote: passage.text,
		});
	}
	return citations;
}

/**
 * Turn a model draft into a validated Forecast for this market. Abstention is normalized — a null
 * probability and an explicit `abstained` mean the same thing, and an abstaining forecast carries
 * no edge to trust (confidence 0). The result is parsed against the core ForecastSchema before it
 * leaves this function: model output is untrusted until it passes the schema.
 */
export function assembleForecast(
	market: Market,
	passages: RetrievedPassage[],
	draft: ForecastDraft,
): Forecast {
	const abstained = draft.abstained || draft.probabilityYes === null;
	const forecast: Forecast = {
		marketId: market.id,
		probabilityYes: abstained ? null : draft.probabilityYes,
		confidence: abstained ? 0 : draft.confidence,
		rationale: draft.rationale,
		citations: resolveCitations(draft, passages),
		abstained,
	};
	return ForecastSchema.parse(forecast);
}
