import {
	type AuditPayload,
	type AuditSink,
	chainHash,
	GENESIS_HASH,
	InMemoryAuditLog,
} from "../audit/index.js";
import type { AgentNode } from "../state.js";

export interface LogDeps {
	/** Where audit records are appended. Default: a fresh in-memory log for this graph instance. */
	sink?: AuditSink;
	/** Clock for the record timestamp — injected so tests are deterministic. Default: wall clock. */
	now?: () => string;
}

/**
 * log node — append a hash-chained audit record for the run. Writes nothing to graph state; the
 * trail lives in the sink (inject your own to read it back). Each record chains to the previous
 * one's hash, so the whole log is tamper-evident: edit or reorder any entry and every later hash
 * breaks. Captures the decided outcome (probability, side, units, approval, position) — the full
 * reasoning lives in the LangSmith trace.
 */
export function createLogNode(deps: LogDeps = {}): AgentNode {
	const sink = deps.sink ?? new InMemoryAuditLog();
	const now = deps.now ?? (() => new Date().toISOString());

	return async (state) => {
		const { market, forecast, decision, position } = state;
		const prior = await sink.records();
		const prevHash = prior.at(-1)?.hash ?? GENESIS_HASH;

		const payload: AuditPayload = {
			seq: prior.length,
			at: now(),
			marketId: market.id,
			question: market.question,
			probabilityYes: forecast?.probabilityYes ?? null,
			abstained: forecast?.abstained ?? true,
			side: decision?.side ?? null,
			units: decision?.units ?? 0,
			approved: decision?.approved ?? false,
			positionId: position?.id ?? null,
		};

		await sink.append({
			...payload,
			prevHash,
			hash: chainHash(prevHash, payload),
		});
		return {};
	};
}
