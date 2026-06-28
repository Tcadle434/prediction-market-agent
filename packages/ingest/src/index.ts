import type { Market } from "@lykos/core";
import { fetchGammaMarkets, type FetchGammaParams } from "./gamma.js";
import { gammaToMarket } from "./map.js";
import { writeMarketsCache } from "./cache.js";

export * from "./gamma.js";
export * from "./map.js";
export * from "./cache.js";

/**
 * Fetch markets from Gamma and map them into validated domain Markets.
 * Pass `cacheAs` to also write the result to data/cache/<name>.json.
 */
export async function fetchMarkets(
  params: FetchGammaParams = {},
  opts: { baseUrl?: string; cacheAs?: string } = {},
): Promise<Market[]> {
  const raw = await fetchGammaMarkets(params, { baseUrl: opts.baseUrl });
  const markets = raw.map(gammaToMarket).filter((m): m is Market => m !== null);
  if (opts.cacheAs) await writeMarketsCache(opts.cacheAs, markets);
  return markets;
}
