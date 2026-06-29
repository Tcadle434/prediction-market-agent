/**
 * Local snapshot cache for markets, so we don't re-hit the API on every run and so the eval
 * harness can replay a fixed set. Snapshots are plain JSON under data/cache.
 * Would consider updating this to SQLlite but we just don't need for now.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Market, MarketSchema } from "@lykos/core";

/** Default cache root: <cwd>/data/cache. Apps run from the repo root. */
export function defaultCacheDir(): string {
	return join(process.cwd(), "data", "cache");
}

/** Write markets to <cacheDir>/<name>.json and return the path written. */
export async function writeMarketsCache(
	name: string,
	markets: Market[],
	cacheDir: string = defaultCacheDir(),
): Promise<string> {
	await mkdir(cacheDir, { recursive: true });
	const file = join(cacheDir, `${name}.json`);
	await writeFile(file, JSON.stringify(markets, null, 2), "utf8");
	return file;
}

/** Read a cached snapshot. Returns [] if missing; validates each row against MarketSchema. */
export async function readMarketsCache(
	name: string,
	cacheDir: string = defaultCacheDir(),
): Promise<Market[]> {
	const file = join(cacheDir, `${name}.json`);
	let raw: string;
	try {
		raw = await readFile(file, "utf8");
	} catch {
		return [];
	}
	const data: unknown = JSON.parse(raw);
	if (!Array.isArray(data)) return [];
	const out: Market[] = [];
	for (const row of data) {
		const parsed = MarketSchema.safeParse(row);
		if (parsed.success) out.push(parsed.data);
	}
	return out;
}
