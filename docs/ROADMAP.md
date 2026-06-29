# Lykos — roadmap, backlog & decisions

Living tracker. The README is the quick map; **this** is the source of truth for status, the
**deferred work we've consciously postponed** (so it doesn't get lost), and the **decisions**
behind the design.

## Status

| Package | What it is | State |
|---|---|---|
| `packages/core` | domain types + config + sizing policy | ✅ done |
| `packages/sizing` | model-A bet sizing (`decideBet`) + tests | ✅ done |
| `packages/ingest` | Polymarket fetch → `Market` + JSON cache + tests | ✅ done |
| `eval/` (Python) | LangSmith **groundedness** LLM-judge | ✅ scaffolded — needs API keys to run live |
| `packages/rag` | chunk → embed → pgvector → retrieve + rerank | ⬜ todo |
| `packages/agent` | LangGraph.js loop: multi-modal (news + order flow) → forecast → `decideBet` → position | ⬜ todo |
| on-chain order flow | Polymarket trade data + `getOrderFlow` tool | ⬜ todo |
| deterministic evals | Brier / calibration / PnL scorecards | ⬜ todo |
| dashboard / mcp | optional surfaces | ⬜ todo |

## Upcoming phases (the forward plan)

Detail for the not-yet-built packages, so the plan survives a context compaction. These reflect
decisions already made in design discussion — written down here, not re-opened.

### P1 · `packages/rag` — retrieval (the learning centerpiece)
**Two-stage retrieval** of the *news* modality: Tavily for web-scale recall, our own embeddings for
passage-level precision. (Tavily already retrieves — the embedding layer earns its place via
passage citations, dedup, and cross-market reuse, *not* by replacing Tavily.)
- **Stage 1 — recall:** Tavily search → candidate documents for the market question.
- **Stage 2 — precision:** chunk those documents, embed the **chunks** (not the question), store in
  pgvector; embed the question at query time to retrieve the best passages.
  - **Why embed at all:** passage-level `Citation`/`chunkId` for the groundedness eval, semantic
    **dedup** of syndicated news, and a reusable **cross-market corpus**.
- **Chunkers (compare 2–3):** fixed-size, recursive/structure-aware, optional semantic — the
  comparison *is* the learning, and retrieval-recall in evals picks the winner.
- **Embeddings:** Voyage. **Vector store:** Postgres + pgvector via Docker, behind a small
  `VectorStore` interface (swappable).
- **Retrieval:** top-k → reranker, plus a recency / time-decay weighting (fresh news ranks higher).
- **Grounding contract:** chunks carry citations; the agent must cite and may abstain.
- Locked: two-stage (Tavily recall → pgvector precision); embed chunks not the question; the
  `VectorStore` seam; chunker comparison measured, not asserted.

### P2 · `packages/agent` — the multi-modal forecast loop (LangGraph.js)
Orchestrated as a **LangGraph.js `StateGraph`** with a typed `AgentState`; **LangSmith** traces every
run + node (env-driven: `LANGSMITH_TRACING=true`). Runtime stays TS so it reuses our tested `decideBet`
/ schemas / ingest directly. Stack: `@langchain/langgraph`, `@langchain/anthropic` (auto-traced model
calls), `langsmith`.
- **State:** `AgentState { market, evidence[] (news + order flow), forecast, decision, position }`,
  with reducers accumulating evidence across nodes.
- **Nodes:**
  - `gatherNews` — P1 RAG retrieval (grounded passages + citations).
  - `gatherOrderFlow` — `getOrderFlow(market)` tool over Polymarket on-chain trade data (data API /
    subgraph, endpoints probed at build time): large trades, net buy/sell flow, concentration (did one
    wallet move the price?), velocity spikes. Updates even with no news; separates informed money from
    noise. Backed by an ingest-side fetcher.
  - `forecast` — Claude (`@langchain/anthropic`) → structured `Forecast` (probabilityYes, confidence,
    cited rationale) or abstain (model A); rationale grounded in **both** modalities.
  - `size` — `decideBet` (already built) → `Decision`.
  - `approvalGate` — LangGraph **`interrupt()`** when `requiresApproval`: pause, surface the decision,
    resume on human approval (checkpointer-backed).
  - `execute` — paper-trade / sandbox, fill at the best ask → `Position`.
  - `log` — hash-chained audit log + per-run trace metadata.
- Locked: TS + LangGraph.js + LangSmith; multi-modal evidence (news + order flow), order flow tool-
  first; HITL via `interrupt`; paper/sandbox default; timestamps passed in (deterministic).

### P3 · Deterministic evals + harness wiring
- Brier / calibration scorecard (D2) and PnL-in-units scorecard (D3) — Python stats.
- Build the resolved-market **golden set** (ingest closed markets; `resolvedOutcome` already works).
- Wire D1 (retrieval relevance) and D6 (swap `echo` → real agent) into the LangSmith harness;
  add the CI gate (D8).

### P4 · Surfaces + writeup (optional but high-value)
- Next.js dashboard: forecasts vs. market, calibration plot, trace / audit view.
- Optional MCP server exposing the agent.
- The **writeup** (chunking-strategy comparison with real eval numbers) — the portfolio artifact.

## Deferred work — must come back to

Each item lists **what**, **why deferred**, the **trigger** to do it, and **where** it plugs in.

### D1 · Retrieval-relevance evaluator (openevals)
- **What:** a second openevals LLM-judge — are retrieved evidence chunks actually relevant to the market question? (`RAG_RETRIEVAL_RELEVANCE_PROMPT`; compares context ↔ question).
- **Why deferred:** there's no retriever yet — current eval examples hand us the context, so there's nothing *retrieved* to score.
- **Trigger:** when `rag` produces real retrieved contexts.
- **Where:** `eval/lykos_eval/evaluators.py` (add `retrieval_relevance_evaluator` next to groundedness) → wire into `run_eval.py`.

### D2 · Deterministic correctness scorecard (Brier / calibration) — NOT an LLM judge
- **What:** forecast-quality metrics — Brier score, calibration curve / reliability diagram, and Brier-vs-market baseline, using resolved outcomes as ground truth.
- **Why not openevals "correctness":** the ground truth is numeric (resolved Yes/No), so math beats an LLM judge — exact, cheap, reproducible.
- **Trigger:** once we have forecasts + a resolved-market golden set (after `agent`).
- **Where:** a deterministic evals module (Python stats + matplotlib reliability diagram), separate from the LLM-judge `eval/`.

### D3 · Economic scorecard (PnL in units)
- **What:** simulate filling at the best ask, settle against resolved outcomes, report PnL/ROI in **units** plus a risk-adjusted figure.
- **Trigger:** after `agent` produces `Decision` → `Position` records and we have resolved markets.
- **Where:** deterministic evals module; consumes `Position` records.

### D4 · Helpfulness evaluator — decided AGAINST (recorded so we don't re-add it)
- Weak fit for a probabilistic forecaster; its value = accuracy + groundedness, already covered. Skip unless the output format changes.

### D5 · SQLite cache upgrade
- **What:** swap the JSON market cache for SQLite.
- **Trigger:** the cache "grows out of control" — many snapshots, a need to query/dedupe the golden set, or concurrent writes.
- **Where:** `packages/ingest/src/cache.ts` — the read/write interface stays; only the backend changes.

### D6 · Real eval target (swap the echo)
- **What:** replace `echo_target` in `eval/lykos_eval/run_eval.py` with a call into the forecasting agent, so the harness scores the real agent.
- **Trigger:** when `agent` exists.

### D7 · Positions/decisions ledger storage
- **What:** decide where `Decision` + `Position` records live — they mutate on settlement and get queried for the PnL scorecard. Likely Postgres, not JSON.
- **Trigger:** when `agent` starts producing them.

### D8 · CI eval gate
- **What:** a GitHub Action that fails the build when groundedness / Brier regress below a threshold.
- **Trigger:** once the eval suites are real (post-agent).

### D9 · Smart-money sub-agent
- **What:** a sub-agent that profiles wallets by historical P&L to label informed-vs-noise money and
  trace who caused a specific move — the open-ended escalation from the `getOrderFlow` tool.
- **Trigger:** after the order-flow tool works and we want deeper wallet-reputation analysis.
- **Where:** `packages/agent` (sub-agent invoked by the loop).

> **Evidence-modality expansions** — build the core news + on-chain loop (P1–P2) first, then add
> these. Ordered roughly by value-per-effort.

### D10 · Cross-venue price consensus
- **What:** compare the Polymarket price to the same event on other venues (Kalshi, Betfair,
  sportsbooks via the-odds-api, Metaculus, poll aggregators); aggregate their implied probabilities
  and treat cross-venue disagreement as signal (and potential arb).
- **Why deferred:** the top *expansion*, but the core loop comes first. Likely the biggest single
  accuracy gain.
- **Trigger:** after the core forecast loop (P2) works end-to-end.
- **Where:** a `getCrossVenueOdds(event)` tool (ingest-side fetchers per venue); event-matching
  sub-agent later.

### D11 · Resolution-criteria scrutiny
- **What:** a sub-agent that reads `description` + `resolutionCriteria` + `umaResolutionStatuses` /
  `resolvedBy` (already ingested) to flag resolution traps — date technicalities, edge cases, source
  ambiguity — a common source of mispricing.
- **Why deferred:** core loop first, but near-free to add since the fields already live on `Market`.
- **Trigger:** after P2; high value-per-effort, so probably the first expansion.
- **Where:** `packages/agent` sub-agent; no new data source.

### D12 · Category-specific quant feed (router → specialist sub-agents)
- **What:** classify the market's domain, then call the right quantitative source — options/futures
  implied probabilities (finance/crypto), sportsbook lines + team/injury data (sports), polling
  aggregates (politics), NWS (weather). Often beats news outright.
- **Why deferred:** highest ceiling but most build (a router + a sub-agent fleet); needs the core
  loop and the multi-tool synthesis pattern in place first.
- **Trigger:** after P2 and at least one expansion (D10/D11) proves multi-tool synthesis works.
- **Where:** a category router in `packages/agent` → specialist sub-agents (macro, sports, …), each
  with its own data tool.

### D13 · Order-book depth / liquidity
- **What:** pull book depth (Polymarket CLOB book endpoint); a thin book means the displayed price is
  noisy and the effective spread wider.
- **Why deferred:** core loop first; cheap to add.
- **Trigger:** after P2.
- **Where:** an ingest-side fetch + a tool; **feeds the sizing model** — thin liquidity should lower
  `confidence` and shrink the bet in `decideBet`.

## Decisions (so we don't relitigate them)

- **Model A sizing** — `q` is the honest mean; `confidence` only *shrinks* the bet (fractional Kelly); never overbet full Kelly. Units (1–5) come from edge-aware Kelly, **not** confidence alone.
- **Fills at best ask** — sizing measures edge vs. the ask; the No side's book is the complement of the Yes token's.
- **Two eval halves** — deterministic math (Brier/PnL) stays pure code; LLM judges (LangSmith/openevals) only for what genuinely needs judging (groundedness now, retrieval relevance later).
- **Groundedness, not faithfulness** — one term, matching the openevals prompt we wrap.
- **JSON cache for now** — snapshot replay, small N; SQLite when it grows (see D5).
- **Python + hosted LangSmith** for the LLM-judge evals — ecosystem + interview relevance + a deliberate "I write Python too" signal.
- **Two-stage retrieval** — Tavily for recall, pgvector for passage precision; embed document *chunks*, not the question. The embedding layer is justified by passage citations, dedup, and cross-market reuse (Tavily alone would be simpler but loses those).
- **Multi-modal evidence** — the agent forecasts from *news* (RAG) **and** *on-chain order flow* (a `getOrderFlow` tool, tool-first); the rationale must be grounded in both. Order flow explains *who* moved a price, so the agent can update without news and separate informed money from noise.
- **Sequencing** — ship the core news + on-chain forecast loop first; the additional evidence modalities (D10–D13: cross-venue consensus, resolution scrutiny, category quant, order-book depth) come *after* the core loop works end-to-end.
- **Agent runtime = TS + LangGraph.js + LangSmith** — the loop is a LangGraph.js `StateGraph` (typed state; `interrupt()` for the HITL approval gate) with LangSmith tracing; keeps the runtime in TS so it reuses `decideBet`/schemas/ingest with no re-port. Evals stay Python; **both trace to one LangSmith project**. (LangGraph is slightly heavy for the v1 linear loop but pays off with the HITL interrupt and the D10–D13 fan-out.)
