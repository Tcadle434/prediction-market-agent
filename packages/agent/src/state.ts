/**
 * The typed state that flows through the LangGraph forecast loop.
 *
 * LangGraph models a run as a graph of nodes. Each node receives the current state and returns a
 * PARTIAL update; the framework merges that update into the state using a per-field "reducer".
 * `Annotation.Root({...})` declares those fields — called "channels" — and how each one merges:
 *
 *   - a BARE `Annotation<T>` channel is last-write-wins: a node returning `{ forecast }` simply
 *     replaces the previous value. Right for single results (the market, the forecast, …).
 *   - an `Annotation<T>({ reducer, default })` channel customizes the merge. `news` ACCUMULATES:
 *     each gather step appends its passages, so several evidence sources can contribute over a run
 *     instead of overwriting each other.
 *
 * `default()` is a channel's value before any node has written it (so `news` starts as `[]`, and
 * the result channels start `null`). Keeping `null` explicit — rather than `undefined` — means
 * "ran but produced nothing" and "not yet run" read the same clean way downstream.
 *
 * The domain types (Market, Forecast, …) come from @lykos/core, already Zod-validated at their
 * boundaries — so state merely carries them; it never redefines a shape.
 */
import { Annotation } from "@langchain/langgraph";
import type {
	Decision,
	Forecast,
	Market,
	Position,
	RetrievedChunk,
} from "@lykos/core";

/** Last-write-wins reducer: a node's value replaces the previous one. */
const lastValue = <T>(_current: T, next: T): T => next;

export const AgentState = Annotation.Root({
	/** The market under analysis. Provided as input; the loop reads it but never rewrites it. */
	market: Annotation<Market>,

	/** Retrieved news passages (each carries its citation fields). Accumulates across gather steps. */
	news: Annotation<RetrievedChunk[]>({
		reducer: (current, next) => current.concat(next),
		default: () => [],
	}),

	/** The model's forecast — `null` until `forecast` runs. Abstaining is a non-null Forecast. */
	forecast: Annotation<Forecast | null>({
		reducer: lastValue,
		default: () => null,
	}),

	/** The sizing decision — `null` until `size` runs. */
	decision: Annotation<Decision | null>({
		reducer: lastValue,
		default: () => null,
	}),

	/** The executed paper position — `null` until `execute` runs (and only if we actually bet). */
	position: Annotation<Position | null>({
		reducer: lastValue,
		default: () => null,
	}),
});

/** The full merged state every node receives. */
export type AgentStateType = typeof AgentState.State;

/** A partial update — the shape a node returns. */
export type AgentStateUpdate = typeof AgentState.Update;
