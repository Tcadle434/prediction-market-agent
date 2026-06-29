import { type Evidence, EvidenceSchema } from "@lykos/core";
import { describe, expect, it } from "vitest";
import {
	searchEvidence,
	type TavilyResult,
	tavilyResultToEvidence,
} from "./search.js";

/** A raw Tavily result fixture; override fields per test. */
function raw(overrides: Partial<TavilyResult> = {}): TavilyResult {
	return {
		title: "Incumbent leads in latest poll",
		url: "https://example.com/poll-update",
		content: "Short snippet from the search index.",
		rawContent:
			"Full markdown article body about the election outcome and the latest numbers.",
		score: 0.91,
		publishedDate: "Mon, 25 Mar 2024 12:00:00 GMT",
		...overrides,
	};
}

/** A fake search function returning a canned response — keeps tests fully offline. */
function fakeSearch(results: unknown[]): (query: string) => Promise<unknown> {
	return async () => ({ results });
}

describe("tavilyResultToEvidence", () => {
	it("maps a full result into validated Evidence", () => {
		// Act
		const evidence = tavilyResultToEvidence(raw());

		// Assert
		expect(evidence).not.toBeNull();
		const ev = evidence as Evidence;
		expect(ev.url).toBe("https://example.com/poll-update");
		expect(ev.title).toBe("Incumbent leads in latest poll");
		expect(ev.content).toContain("Full markdown article body");
		expect(ev.source).toBe("tavily");
		expect(ev.searchScore).toBe(0.91);
		expect(ev.publishedAt).toBe("2024-03-25T12:00:00.000Z");
		expect(() => EvidenceSchema.parse(ev)).not.toThrow();
	});

	it("falls back to the snippet when rawContent is missing", () => {
		const ev = tavilyResultToEvidence(raw({ rawContent: null }));
		expect(ev?.content).toBe("Short snippet from the search index.");
	});

	it("returns null when there is no usable text", () => {
		expect(
			tavilyResultToEvidence(raw({ rawContent: null, content: "   " })),
		).toBeNull();
	});

	it("returns null for a non-URL", () => {
		expect(tavilyResultToEvidence(raw({ url: "not a url" }))).toBeNull();
	});

	it("leaves publishedAt null when the date is absent or unparseable", () => {
		expect(
			tavilyResultToEvidence(raw({ publishedDate: undefined }))?.publishedAt,
		).toBeNull();
		expect(
			tavilyResultToEvidence(raw({ publishedDate: "not a date" }))?.publishedAt,
		).toBeNull();
	});

	it("derives a stable id from the URL", () => {
		const a = tavilyResultToEvidence(raw());
		const b = tavilyResultToEvidence(
			raw({ title: "different title, same url" }),
		);
		expect(a?.id).toBe(b?.id);
		// Different URL → different id
		const c = tavilyResultToEvidence(raw({ url: "https://example.com/other" }));
		expect(c?.id).not.toBe(a?.id);
	});
});

describe("searchEvidence", () => {
	it("returns mapped Evidence for each valid result", async () => {
		const search = fakeSearch([
			raw({ url: "https://example.com/a" }),
			raw({ url: "https://example.com/b" }),
		]);

		const evidence = await searchEvidence("Will the incumbent win?", {
			search,
		});

		expect(evidence).toHaveLength(2);
		expect(evidence.map((e) => e.url)).toEqual([
			"https://example.com/a",
			"https://example.com/b",
		]);
	});

	it("skips malformed results but keeps the valid ones", async () => {
		const search = fakeSearch([
			raw({ url: "https://example.com/good" }), // valid
			raw({ url: "not-a-url" }), // bad URL → mapper rejects
			raw({ rawContent: null, content: "  " }), // blank text → mapper rejects
			{ title: "no score field", url: "https://example.com/x", content: "hi" }, // raw-schema reject
		]);

		const evidence = await searchEvidence("q", { search });

		expect(evidence).toHaveLength(1);
		expect(evidence[0]!.url).toBe("https://example.com/good");
	});

	it("throws a [RAG] error when the response has no results array", async () => {
		const search = async () => ({ notResults: [] });
		await expect(searchEvidence("q", { search })).rejects.toThrow(
			/\[RAG\].*results array/,
		);
	});

	it("throws a [RAG] error when the search call rejects", async () => {
		const search = async () => {
			throw new Error("network down");
		};
		await expect(searchEvidence("q", { search })).rejects.toThrow(
			/\[RAG\] Tavily search failed/,
		);
	});

	// Live smoke test — only runs when a real key is present.
	it.skipIf(!process.env.TAVILY_API_KEY)(
		"fetches real evidence from Tavily",
		async () => {
			const evidence = await searchEvidence(
				"US presidential election 2024 result",
				{
					maxResults: 3,
				},
			);
			expect(evidence.length).toBeGreaterThan(0);
			for (const ev of evidence) {
				expect(() => EvidenceSchema.parse(ev)).not.toThrow();
			}
		},
		30_000,
	);
});
