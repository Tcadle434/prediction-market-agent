import {
	type Citation,
	type Forecast,
	ForecastSchema,
	type Market,
} from "@lykos/core";
import type { RetrievedPassage } from "../passage.js";
import type { ForecastDraft } from "./draft.js";

/**
 * Resolve the model's draft citations against the passages it was actually given. Keep only the
 * ones whose `chunkId` matches a retrieved passage, and backfill `evidenceId` + `url` from that
 * passage. Anything the model invented (a stale or made-up id) is dropped — the model never gets to
 * author ids or urls, so a citation can only point at real, retrieved evidence.
 */
export function resolveCitations(
	draft: ForecastDraft,
	passages: RetrievedPassage[],
): Citation[] {
	const byId = new Map(passages.map((passage) => [passage.id, passage]));
	const citations: Citation[] = [];
	for (const cited of draft.citations) {
		const passage = byId.get(cited.chunkId);
		if (!passage) continue; // invented / stale id — drop it
		citations.push({
			chunkId: passage.id,
			evidenceId: passage.evidenceId,
			url: passage.url,
			quote: cited.quote,
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
