import { DEFAULT_SIZING_POLICY, type SizingPolicy } from "@lykos/core";
import { decideBet } from "@lykos/sizing";
import type { AgentNode } from "../state.js";

export interface SizeDeps {
	/** Risk knobs for bet sizing. Default: DEFAULT_SIZING_POLICY (quarter Kelly, 4-pt min edge…). */
	policy?: SizingPolicy;
	/** Clock for the decision timestamp — injected so tests are deterministic. Default: wall clock. */
	now?: () => string;
}

/**
 * size node — turn the forecast into a sizing Decision via the already-built `decideBet`.
 *
 * Pure pass-through to the sizing engine: it reads `state.forecast` + `state.market`, applies the
 * policy, and writes `state.decision`. `decideBet` itself returns a no-bet Decision (side null) when
 * the forecast abstains, the edge is below the gate, or the bet rounds to zero units — so this node
 * doesn't second-guess it. Guards the (graph-impossible) null forecast by writing nothing.
 */
export function createSizeNode(deps: SizeDeps = {}): AgentNode {
	const policy = deps.policy ?? DEFAULT_SIZING_POLICY;
	const now = deps.now ?? (() => new Date().toISOString());

	return async (state) => {
		if (!state.forecast) return {};
		const decision = decideBet(state.forecast, state.market, policy, now());
		return { decision };
	};
}
