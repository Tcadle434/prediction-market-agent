import type { RetrievedChunk } from "@lykos/core";
import { describe, expect, it } from "vitest";
import { recencyWeight, reorderByRecency } from "./recency.js";

const NOW = Date.parse("2026-06-29T00:00:00Z");
const DAY = 86_400_000;

function isoDaysAgo(days: number): string {
	return new Date(NOW - days * DAY).toISOString();
}

describe("recencyWeight", () => {
	it("returns 1 for a missing date", () => {
		expect(recencyWeight(null, NOW)).toBe(1);
	});

	it("returns 1 for an unparseable date", () => {
		expect(recencyWeight("not a date", NOW)).toBe(1);
	});

	it("returns 1 for a future date", () => {
		expect(recencyWeight(isoDaysAgo(-5), NOW)).toBe(1);
	});

	it("halves at one half-life of age", () => {
		expect(recencyWeight(isoDaysAgo(14), NOW, 14)).toBeCloseTo(0.5, 10);
	});

	it("quarters at two half-lives", () => {
		expect(recencyWeight(isoDaysAgo(28), NOW, 14)).toBeCloseTo(0.25, 10);
	});

	it("decreases as a document ages", () => {
		expect(recencyWeight(isoDaysAgo(1), NOW)).toBeGreaterThan(
			recencyWeight(isoDaysAgo(30), NOW),
		);
	});
});

describe("reorderByRecency", () => {
	function chunk(
		id: string,
		rerankScore: number | null,
		ageDays: number,
	): RetrievedChunk {
		return {
			id,
			evidenceId: "e",
			text: id,
			index: 0,
			tokenCount: 1,
			publishedAt: isoDaysAgo(ageDays),
			similarity: 0.5,
			rerankScore,
		};
	}

	it("ranks a fresh, slightly-less-relevant chunk above a stale, more-relevant one when decay dominates", () => {
		const stale = chunk("stale", 0.9, 60);
		const fresh = chunk("fresh", 0.7, 0);
		expect(reorderByRecency([stale, fresh], NOW, 14)[0]!.id).toBe("fresh");
	});

	it("keeps the more-relevant chunk first when both are equally fresh", () => {
		const out = reorderByRecency(
			[chunk("b", 0.5, 0), chunk("a", 0.9, 0)],
			NOW,
			14,
		);
		expect(out.map((c) => c.id)).toEqual(["a", "b"]);
	});

	it("falls back to similarity when rerankScore is null", () => {
		const a: RetrievedChunk = {
			id: "a",
			evidenceId: "e",
			text: "a",
			index: 0,
			tokenCount: 1,
			publishedAt: null,
			similarity: 0.9,
			rerankScore: null,
		};
		const b: RetrievedChunk = {
			id: "b",
			evidenceId: "e",
			text: "b",
			index: 0,
			tokenCount: 1,
			publishedAt: null,
			similarity: 0.3,
			rerankScore: null,
		};
		expect(reorderByRecency([b, a], NOW).map((c) => c.id)).toEqual(["a", "b"]);
	});

	it("does not mutate the input array", () => {
		const input = [chunk("a", 0.5, 0), chunk("b", 0.9, 0)];
		const snapshot = [...input];
		reorderByRecency(input, NOW);
		expect(input).toEqual(snapshot);
	});
});
