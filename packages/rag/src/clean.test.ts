import { describe, expect, it } from "vitest";
import { cleanMarkdown } from "./clean.js";

describe("cleanMarkdown", () => {
	it("drops a nav / link-list line but keeps the article", () => {
		const input = [
			"* [About](/about) * [Advertisement](/ads) * [Login / Join](/login)",
			"",
			"The Federal Reserve held interest rates steady on Tuesday, defying market bets.",
		].join("\n");

		const out = cleanMarkdown(input);

		expect(out).not.toContain("[About]");
		expect(out).toContain("Federal Reserve held interest rates steady");
	});

	it("keeps a paragraph that contains a single inline link", () => {
		const input =
			"Markets moved after [the announcement](https://x.com/a) landed late on Tuesday.";
		expect(cleanMarkdown(input)).toBe(input);
	});

	it("keeps markdown headings", () => {
		expect(cleanMarkdown("## Fed decision")).toBe("## Fed decision");
	});

	it("drops short label lines but keeps short sentences", () => {
		expect(cleanMarkdown("Read more")).toBe("");
		expect(cleanMarkdown("Rates held.")).toBe("Rates held."); // terminal punctuation → kept
	});

	it("collapses blank-line runs and trims", () => {
		expect(
			cleanMarkdown("\n\nThe Fed stayed put this week, analysts said.\n\n\n\n"),
		).toBe("The Fed stayed put this week, analysts said.");
	});

	it("returns empty for boilerplate-only / blank content", () => {
		expect(cleanMarkdown("   ")).toBe("");
		expect(cleanMarkdown("* [A](/a) * [B](/b)\n* [C](/c) * [D](/d)")).toBe("");
	});
});
