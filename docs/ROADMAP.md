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
| `packages/agent` | retrieve → forecast → `decideBet` → position | ⬜ todo |
| deterministic evals | Brier / calibration / PnL scorecards | ⬜ todo |
| dashboard / mcp | optional surfaces | ⬜ todo |

## Upcoming phases (the forward plan)

Detail for the not-yet-built packages, so the plan survives a context compaction. These reflect
decisions already made in design discussion — written down here, not re-opened.

### P1 · `packages/rag` — retrieval (the learning centerpiece)
Given a market question, return ranked, grounded evidence chunks.
- **Evidence source:** Tavily search → candidate documents for the question.
- **Chunkers (compare 2–3):** fixed-size, recursive/structure-aware, optional semantic — the
  comparison *is* the learning, and retrieval-recall in evals picks the winner.
- **Embeddings:** Voyage. **Vector store:** Postgres + pgvector via Docker, behind a small
  `VectorStore` interface (swappable).
- **Retrieval:** top-k → reranker, plus a recency / time-decay weighting (fresh news ranks higher).
- **Grounding contract:** chunks carry citations; the agent must cite and may abstain.
- Locked: the `VectorStore` seam; pgvector via Docker; chunker comparison measured, not asserted.

### P2 · `packages/agent` — the forecast loop
retrieve → forecast → size → (approve) → position → log.
- **Forecaster:** Claude (Anthropic SDK) returns a structured `Forecast` (probabilityYes,
  confidence, cited rationale) or abstains — model A: honest mean + separate confidence.
- **Sizing:** `decideBet` (already built) → `Decision`.
- **Policy gate:** `requiresApproval`; human-in-the-loop before any real money.
- **Executor:** paper-trade / sandbox by default, fill at the best ask → `Position`.
- **Observability:** hash-chained audit log + per-run trace (latency / tokens / cost).
- Locked: paper/sandbox default; HITL before real money; timestamps passed in (deterministic).

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

## Decisions (so we don't relitigate them)

- **Model A sizing** — `q` is the honest mean; `confidence` only *shrinks* the bet (fractional Kelly); never overbet full Kelly. Units (1–5) come from edge-aware Kelly, **not** confidence alone.
- **Fills at best ask** — sizing measures edge vs. the ask; the No side's book is the complement of the Yes token's.
- **Two eval halves** — deterministic math (Brier/PnL) stays pure code; LLM judges (LangSmith/openevals) only for what genuinely needs judging (groundedness now, retrieval relevance later).
- **Groundedness, not faithfulness** — one term, matching the openevals prompt we wrap.
- **JSON cache for now** — snapshot replay, small N; SQLite when it grows (see D5).
- **Python + hosted LangSmith** for the LLM-judge evals — ecosystem + interview relevance + a deliberate "I write Python too" signal.
