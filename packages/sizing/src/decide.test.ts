import { describe, it, expect } from "vitest";
import { MarketSchema, ForecastSchema, DEFAULT_SIZING_POLICY } from "@lykos/core";
import type { Market, Forecast } from "@lykos/core";
import { decideBet, kellyFraction, unitValueUsd } from "./decide.js";

const NOW = "2026-01-01T00:00:00.000Z";

/** Build a binary market. `opts.yesAsk`/`opts.noAsk` set the price you'd pay per side. */
function market(
  yesPrice: number,
  opts: { yesAsk?: number; noAsk?: number; noPrice?: number } = {},
): Market {
  return MarketSchema.parse({
    id: "m1",
    question: "Will it rain tomorrow?",
    outcomes: [
      { name: "Yes", price: yesPrice, ask: opts.yesAsk ?? null },
      { name: "No", price: opts.noPrice ?? 1 - yesPrice, ask: opts.noAsk ?? null },
    ],
    status: "open",
  });
}

function forecast(probabilityYes: number | null, confidence: number): Forecast {
  return ForecastSchema.parse({
    marketId: "m1",
    probabilityYes,
    confidence,
    rationale: "test",
    citations: [],
    abstained: probabilityYes === null,
  });
}

describe("decideBet — model (A) sizing", () => {
  it("does NOT bet when confidence is high but the edge is below the gate (92% conf @ 0.90 ask)", () => {
    const d = decideBet(forecast(0.92, 0.9), market(0.9, { yesAsk: 0.9, noAsk: 0.1 }), DEFAULT_SIZING_POLICY, NOW);
    expect(d.side).toBeNull();
    expect(d.units).toBe(0);
    expect(d.suggestedStakeUsd).toBe(0);
  });

  it("bets max units on a strong edge, capped at maxUnits (65% conf @ 0.50 ask)", () => {
    const d = decideBet(forecast(0.65, 1.0), market(0.5, { yesAsk: 0.5, noAsk: 0.5 }), DEFAULT_SIZING_POLICY, NOW);
    expect(d.side).toBe("yes");
    expect(d.units).toBe(5);
    expect(d.entryAsk).toBe(0.5);
    expect(d.suggestedStakeUsd).toBe(50); // 5 units × $10
    expect(d.suggestedShares).toBe(100); // $50 / 0.50
    expect(d.edge).toBeCloseTo(0.15);
  });

  it("backs the No side when the agent's probability is below the price", () => {
    const d = decideBet(forecast(0.42, 1.0), market(0.5, { yesAsk: 0.5, noAsk: 0.5 }), DEFAULT_SIZING_POLICY, NOW);
    expect(d.side).toBe("no");
    expect(d.units).toBe(4);
    expect(d.entryAsk).toBe(0.5);
    expect(d.edge).toBeCloseTo(0.08);
  });

  it("uses the ask, not the mid — the spread can erase an apparent edge", () => {
    // +5pts vs the 0.50 mid, but only +1pt vs the 0.54 ask → below the gate → no bet
    const d = decideBet(forecast(0.55, 1.0), market(0.5, { yesAsk: 0.54, noAsk: 0.54 }), DEFAULT_SIZING_POLICY, NOW);
    expect(d.side).toBeNull();
    expect(d.units).toBe(0);
  });

  it("confidence only shrinks: lower confidence → fewer or zero units on the same edge", () => {
    const m = market(0.5, { yesAsk: 0.5, noAsk: 0.5 });
    const full = decideBet(forecast(0.65, 1.0), m, DEFAULT_SIZING_POLICY, NOW);
    const low = decideBet(forecast(0.65, 0.1), m, DEFAULT_SIZING_POLICY, NOW);
    const tiny = decideBet(forecast(0.65, 0.02), m, DEFAULT_SIZING_POLICY, NOW);
    expect(full.units).toBe(5);
    expect(low.units).toBe(1);
    expect(low.units).toBeLessThan(full.units);
    expect(tiny.units).toBe(0); // shrunk all the way to no bet
    expect(tiny.side).toBeNull();
  });

  it("stakeFraction never exceeds full Kelly f* (λ and confidence only shrink)", () => {
    const d = decideBet(forecast(0.65, 1.0), market(0.5, { yesAsk: 0.5, noAsk: 0.5 }), DEFAULT_SIZING_POLICY, NOW);
    expect(d.stakeFraction).toBeLessThanOrEqual(d.kellyFraction);
  });

  it("abstains → no bet", () => {
    const d = decideBet(forecast(null, 0.9), market(0.5, { yesAsk: 0.5, noAsk: 0.5 }), DEFAULT_SIZING_POLICY, NOW);
    expect(d.side).toBeNull();
    expect(d.units).toBe(0);
  });

  it("requires approval whenever a position is taken, and not otherwise", () => {
    const bet = decideBet(forecast(0.65, 1.0), market(0.5, { yesAsk: 0.5, noAsk: 0.5 }), DEFAULT_SIZING_POLICY, NOW);
    const skip = decideBet(forecast(0.92, 0.9), market(0.9, { yesAsk: 0.9, noAsk: 0.1 }), DEFAULT_SIZING_POLICY, NOW);
    expect(bet.requiresApproval).toBe(true);
    expect(skip.requiresApproval).toBe(false);
  });
});

describe("sizing helpers", () => {
  it("kellyFraction = edge / (1 - ask)", () => {
    expect(kellyFraction(0.15, 0.5)).toBeCloseTo(0.3);
    expect(kellyFraction(0.1, 0.8)).toBeCloseTo(0.5);
  });

  it("kellyFraction guards against ask ≥ 1", () => {
    expect(kellyFraction(0.1, 1)).toBe(0);
    expect(kellyFraction(0.1, 1.2)).toBe(0);
  });

  it("unitValueUsd = bankroll × unitFraction", () => {
    expect(unitValueUsd(DEFAULT_SIZING_POLICY)).toBe(10); // 1000 × 0.01
  });
});
