import { describe, expect, it } from "vitest";
import { GammaMarketSchema } from "./gamma.js";
import { gammaToMarket } from "./map.js";

/** Build a raw Gamma market (shape taken from the live API) with overrides. */
function raw(overrides: Record<string, unknown> = {}) {
	return GammaMarketSchema.parse({
		id: "558961",
		question: "Will South Korea win the 2026 FIFA World Cup?",
		outcomes: '["Yes", "No"]',
		outcomePrices: '["0.0005", "0.9995"]',
		bestBid: null,
		bestAsk: 0.001,
		active: true,
		closed: false,
		endDate: "2026-07-20T00:00:00Z",
		slug: "will-south-korea-win-the-2026-fifa-world-cup",
		...overrides,
	});
}

describe("gammaToMarket", () => {
	it("parses JSON-encoded outcomes/prices and keeps an open market open", () => {
		const m = gammaToMarket(raw())!;
		expect(m.status).toBe("open");
		expect(m.resolvedOutcome).toBeNull();
		expect(m.outcomes.map((o) => o.name)).toEqual(["Yes", "No"]);
		expect(m.outcomes[0]!.price).toBeCloseTo(0.0005);
		expect(m.outcomes[1]!.price).toBeCloseTo(0.9995);
	});

	it("derives Yes bid/ask from the book and the No side as the complement", () => {
		const m = gammaToMarket(raw({ bestBid: 0.3, bestAsk: 0.35 }))!;
		expect(m.outcomes[0]!.bid).toBeCloseTo(0.3);
		expect(m.outcomes[0]!.ask).toBeCloseTo(0.35);
		expect(m.outcomes[1]!.ask).toBeCloseTo(0.7); // 1 − bestBid
		expect(m.outcomes[1]!.bid).toBeCloseTo(0.65); // 1 − bestAsk
	});

	it("leaves the complementary side null when a book value is missing", () => {
		const m = gammaToMarket(raw({ bestBid: null, bestAsk: 0.001 }))!;
		expect(m.outcomes[0]!.bid).toBeNull(); // Yes bid = bestBid = null
		expect(m.outcomes[0]!.ask).toBeCloseTo(0.001);
		expect(m.outcomes[1]!.ask).toBeNull(); // 1 − null
		expect(m.outcomes[1]!.bid).toBeCloseTo(0.999); // 1 − 0.001
	});

	it("infers resolvedOutcome from settled prices on a closed market", () => {
		const m = gammaToMarket(
			raw({ closed: true, outcomePrices: '["1", "0"]' }),
		)!;
		expect(m.status).toBe("resolved");
		expect(m.resolvedOutcome).toBe("Yes");
	});

	it("returns null for unparseable outcomes", () => {
		expect(gammaToMarket(raw({ outcomes: "not json" }))).toBeNull();
	});

	it("returns null when outcomes and prices lengths differ", () => {
		expect(gammaToMarket(raw({ outcomePrices: '["0.5"]' }))).toBeNull();
	});

	it("does not derive bid/ask for non-binary markets", () => {
		const m = gammaToMarket(
			raw({
				outcomes: '["A","B","C"]',
				outcomePrices: '["0.2","0.3","0.5"]',
				bestBid: 0.2,
				bestAsk: 0.25,
			}),
		)!;
		expect(m.outcomes.every((o) => o.bid === null && o.ask === null)).toBe(
			true,
		);
	});
});
