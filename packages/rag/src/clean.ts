/**
 * Light content cleaning for Tavily `rawContent` before chunking (roadmap D14).
 *
 * Tavily's markdown includes whole-page chrome — nav menus, "About / Login" link lists, footers.
 * A live demo showed this rides into otherwise-relevant chunks and can even rank #1 after
 * reranking, polluting passages and citations. This is a deliberately LIGHT pass: drop lines that
 * are mostly markdown links (nav/link lists) and very short non-sentence lines (button/label text),
 * while keeping headings and real prose. It is NOT a full readability extraction.
 */

const MARKDOWN_LINK = /\[[^\]]*\]\([^)]*\)/g;
const MIN_CONTENT_CHARS = 25;
const MAX_LINKLIST_RESIDUE = 20;

/** A line that is ≥2 markdown links with almost no prose between them — i.e. a nav/link list. */
function isLinkList(line: string): boolean {
	const links = line.match(MARKDOWN_LINK);
	if (!links || links.length < 2) return false;
	const residue = line
		.replace(MARKDOWN_LINK, "")
		.replace(/[*\-•|]/g, "")
		.trim();
	return residue.length < MAX_LINKLIST_RESIDUE;
}

/** Whether to keep a single line of markdown content. */
function isContentLine(line: string): boolean {
	const trimmed = line.trim();
	if (trimmed.length === 0) return true; // keep blanks so paragraph structure survives
	if (trimmed.startsWith("#")) return true; // keep headings
	if (isLinkList(trimmed)) return false;
	// drop short label/nav lines that aren't a sentence (no terminal punctuation)
	if (trimmed.length < MIN_CONTENT_CHARS && !/[.!?:]$/.test(trimmed))
		return false;
	return true;
}

/** Strip a leading run of ≥2 markdown nav links from a line (a nav prefix sharing a content line). */
function stripLeadingNav(line: string): string {
	return line
		.replace(/^(\s*[*\-•]?\s*\[[^\]]*\]\([^)]*\)\s*){2,}/, "")
		.trimStart();
}

/** Strip page boilerplate (nav/link lists, leading nav prefixes, short labels); keep prose + headings. */
export function cleanMarkdown(content: string): string {
	return content
		.split("\n")
		.filter(isContentLine)
		.map(stripLeadingNav)
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}
