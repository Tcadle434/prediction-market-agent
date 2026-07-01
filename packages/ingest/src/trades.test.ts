import { describe, expect, it } from "vitest";
import { TradeSchema } from "./trades.js";

/** A raw trade row, shape taken verbatim from the live data-api /trades response. */
function rawTrade(overrides: Record<string, unknown> = {}) {
	return {
		proxyWallet: "0xbbe366c1ebd8fbc85ff0538e1ccb8645ed31dc16",
		side: "BUY",
		asset:
			"94603648636330087039501304492699481091005420017442244191603206509188088089447",
		conditionId:
			"0xcdb1f0400949238a63d3e88243d2ada08cd9c2a71985ced9f0cfd5e66354cf90",
		size: 337.5,
		price: 0.03,
		timestamp: 1782868102,
		title: "Will USA win the 2026 FIFA World Cup?",
		outcome: "Yes",
		outcomeIndex: 0,
		name: "impermanentW",
		transactionHash:
			"0xa88cb8cb45843ddacb809122148405c3af6c2a6396c9da460172972947f43e07",
		...overrides,
	};
}

describe("TradeSchema", () => {
	it("parses a live-shaped trade and strips unmodeled fields", () => {
		const trade = TradeSchema.parse(rawTrade());
		expect(trade.side).toBe("BUY");
		expect(trade.outcome).toBe("Yes");
		expect(trade.size).toBe(337.5);
		expect(trade.price).toBe(0.03);
		expect(trade.timestamp).toBe(1782868102);
		// unmodeled keys (title, icon, name, asset…) are dropped
		expect("title" in trade).toBe(false);
		expect("asset" in trade).toBe(false);
	});

	it("accepts SELL as a valid taker side", () => {
		expect(TradeSchema.parse(rawTrade({ side: "SELL" })).side).toBe("SELL");
	});

	it("rejects an unknown side so a malformed row is skipped by the fetch loop", () => {
		expect(TradeSchema.safeParse(rawTrade({ side: "MINT" })).success).toBe(
			false,
		);
	});

	it("rejects a price outside [0,1]", () => {
		expect(TradeSchema.safeParse(rawTrade({ price: 1.5 })).success).toBe(false);
	});

	it("rejects a row missing required fields", () => {
		expect(TradeSchema.safeParse({ side: "BUY" }).success).toBe(false);
	});
});
