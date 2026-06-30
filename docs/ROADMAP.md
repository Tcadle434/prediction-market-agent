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
| `packages/rag` | two-stage retrieval: search → chunk → embed → pgvector → retrieve + rerank | ✅ **built** (P1 — see Current state) |
| tooling | Biome (tabs/format/lint/import-sort) · Docker pgvector · Prisma 7 | ✅ done |
| `eval/` (Python) | LangSmith **groundedness** LLM-judge | ✅ scaffolded — needs API keys to run live |
| `packages/agent` | LangGraph.js loop: multi-modal (news + order flow) → forecast → `decideBet` → position | ⬜ todo (P2 — next major step) |
| on-chain order flow | Polymarket trade data + `getOrderFlow` tool | ⬜ todo |
| deterministic evals | Brier / calibration / PnL scorecards | ⬜ todo |
| dashboard / mcp | optional surfaces | ⬜ todo |

## Current state — P1 `packages/rag` is built ✅

The full two-stage retrieval loop is implemented and tested (**93 tests**; offline suite green, the
DB/API tests gated on a reachable Postgres / real API keys). Build order, all committed:

1. **`VectorStore` seam + `InMemoryVectorStore`** — swappable storage interface (`upsert`/`query`/`clear`/`count`) + cosine-KNN reference impl that the pgvector store must match.
2. **Chunkers** — `fixedChunker` + `recursiveChunker` (hand-rolled) **and** `langchainRecursiveChunker` + `langchainTokenChunker` (library baselines) behind one **async** `Chunker` interface. Real tokenization (js-tiktoken) in the LangChain pair; chars/4 heuristic in ours (the comparison measures both).
3. **Tavily recall** — `searchEvidence(question)` → `Evidence[]` via `@tavily/core` (topic=news, advanced, markdown, days=7); typed-SDK boundary, validates `Evidence` output.
4. **Voyage embed + rerank** — `embedTexts`/`embedDocuments`/`embedQuery` (128-batch, output-validated) + `rerank()` → `RetrievedChunk[]` (voyage-3.5 / rerank-2.5; input_type document vs query).
5. **pgvector store** — `PgVectorStore` on **Prisma 7 + `@prisma/adapter-pg`** over **Docker Postgres 17 + pgvector** (`lykos-db`, host **:5433**). `$executeRaw` upsert + `$queryRaw` cosine KNN + hand-added HNSW index. Same contract tests as in-memory, **verified live**.
6. **Retrieval** — `recency.ts` (exponential time-decay) + `retrieve(question, { store, … })` (embed query → over-fetch candidateK → rerank → recency-reorder → topK).
7. **Pipeline** — `indexEvidence(evidence, { store, chunker, … })` (chunk → embed → upsert) completes `searchEvidence → indexEvidence → retrieve`.

**Pending in P1:**
- ⏳ **Live end-to-end demo** — `scratchpad/demo.mjs` runs the whole pipeline on a real market question (Tavily → chunk → Voyage → pgvector → retrieve). Verified through search+chunk live; **blocked on Voyage rate-limit propagation** (free tier 3 RPM / 10K TPM → standard, takes minutes after adding a payment method). **Re-run when the limits lift.**
- ⬜ **D1 retrieval-relevance eval** — wire the openevals retrieval-relevance judge into `eval/` now that `rag` produces real retrieved contexts (see D1). This is the last P1 item.
- ⬜ **D14 boilerplate strip** + **D15 embed hardening** — quality/robustness items surfaced this build (see deferred).

**Next major step → P2 `packages/agent`** — the LangGraph.js forecast loop that consumes `retrieve()` (news) + a new `getOrderFlow` tool (on-chain order flow), produces a structured `Forecast`, sizes it with the already-built `decideBet`, and gates on human approval. Detail in P2 below.

## Upcoming phases (the forward plan)

Detail for the not-yet-built packages, so the plan survives a context compaction. These reflect
decisions already made in design discussion — written down here, not re-opened.

### P1 · `packages/rag` — retrieval (the learning centerpiece) — ✅ BUILT (see Current state)
The design rationale below is kept for the writeup; the code is done.

**Two-stage retrieval** of the *news* modality: Tavily for web-scale recall, our own embeddings for
passage-level precision. (Tavily already retrieves — the embedding layer earns its place via
passage citations, dedup, and cross-market reuse, *not* by replacing Tavily.)
- **Stage 1 — recall:** Tavily search → candidate documents for the market question.
- **Stage 2 — precision:** chunk those documents, embed the **chunks** (not the question), store in
  pgvector; embed the question at query time to retrieve the best passages.
  - **Why embed at all:** passage-level `Citation`/`chunkId` for the groundedness eval, semantic
    **dedup** of syndicated news, and a reusable **cross-market corpus**.
- **Chunkers (compare):** our hand-rolled `fixed` + `recursive`, **plus** LangChain's
  `RecursiveCharacterTextSplitter` and `TokenTextSplitter` as library baselines — the
  comparison *is* the learning, and retrieval-recall in evals picks the winner. (See the
  chunker decision below for why we add LangChain alongside rather than replacing.)
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

### D14 · Source content cleaning (boilerplate strip)
- **What:** strip non-article chrome from Tavily `rawContent` before chunking — nav menus,
  "About / Advertise / Login" link lists, footers, cookie banners. (Confirmed in a live smoke
  test: the first chunk of a real news page was the site nav, not article text.)
- **Why deferred:** the two-stage design is partly self-defending — a nav-menu chunk won't
  match a question embedding, so it rarely surfaces in top-k. So it's a corpus-quality +
  embedding-spend issue, not a correctness blocker.
- **Trigger:** when we wire Evidence → chunks in the pipeline step.
- **Where:** a light cleaning pass between `searchEvidence` (search.ts) and the chunkers —
  drop markdown link-list / nav lines and very short lines; escalate to a readability/extract
  pass only if eval recall demands it.

### D15 · Embedding rate-limit hardening (token-aware batching + 429 backoff)
- **What:** `embed.ts` batches by the SDK's 128-input *count* cap but not by a *token* budget, and
  doesn't retry on `429`. Add (a) token-aware batching — accumulate `Chunk.tokenCount` and flush a
  batch before the model's per-request token cap (320K for voyage-3.5) — and (b) retry-with-backoff
  on `429`/transient errors.
- **Why deferred:** surfaced when the live demo embedded 5 full articles at once and hit Voyage's
  *free-tier* cap (3 RPM / 10K TPM). The 128-count batching is correct for normal chunk sizes; this
  is a robustness/production-readiness improvement, not a correctness bug.
- **Trigger:** before running the pipeline at volume, or if `429`s recur on a paid tier.
- **Where:** `packages/rag/src/embed.ts` (the batching loop in `embedTexts` + the live `createLiveEmbed`).

### D16 · Source-quality filtering (drop junk / parked-domain results)
- **What:** reject low-quality Evidence *before* indexing — parked "domain for sale" pages, link
  farms, and other non-article junk Tavily can return. (Live demo: a parked-domain page
  "predict.info — Premium Domain For Sale, USD 200,000" ranked #1 for a Fed-rates query — keyword-
  adjacent junk that boilerplate cleaning can't fix.)
- **Why deferred / distinct from D14:** D14 strips chrome *within* real articles; this is rejecting
  whole junk *sources*. The core retrieval works on real sources, so one junk doc is a quality
  issue, not a correctness blocker.
- **Trigger:** before relying on retrieval quality for live forecasts, or when junk sources recur.
- **Where:** a filter in/after `searchEvidence` — content-signal heuristics (domain-sale phrases, a
  too-short cleaned body) and/or Tavily `excludeDomains` + a small blocklist; source-authority
  scoring later.

## Decisions (so we don't relitigate them)

- **Model A sizing** — `q` is the honest mean; `confidence` only *shrinks* the bet (fractional Kelly); never overbet full Kelly. Units (1–5) come from edge-aware Kelly, **not** confidence alone.
- **Fills at best ask** — sizing measures edge vs. the ask; the No side's book is the complement of the Yes token's.
- **Two eval halves** — deterministic math (Brier/PnL) stays pure code; LLM judges (LangSmith/openevals) only for what genuinely needs judging (groundedness now, retrieval relevance later).
- **Groundedness, not faithfulness** — one term, matching the openevals prompt we wrap.
- **JSON cache for now** — snapshot replay, small N; SQLite when it grows (see D5).
- **Python + hosted LangSmith** for the LLM-judge evals — ecosystem + interview relevance + a deliberate "I write Python too" signal.
- **Two-stage retrieval** — Tavily for recall, pgvector for passage precision; embed document *chunks*, not the question. The embedding layer is justified by passage citations, dedup, and cross-market reuse (Tavily alone would be simpler but loses those).
- **Embeddings + pgvector op class** — default `voyage-3.5` at **1024 dims** (matches the planned `vector(1024)` column), `outputDtype: float` → `number[]`; embed chunks with `input_type: "document"` and the question with `"query"` (Voyage's asymmetric-retrieval pattern). Voyage vectors are **L2-normalized (length 1)**, so cosine ≡ dot-product ranking — for the pgvector index (step 5) use `vector_cosine_ops` / `<=>` as the safe, model-agnostic default; inner-product (`vector_ip_ops` / `<#>`) is a valid micro-optimization given the unit norm. The model name is a config constant; `voyage-4` may now be GA (the research agents disagreed) — verify the exact name before switching. Embed batches cap at **128 inputs/call** (the SDK limit).
- **Chunkers: hand-rolled + LangChain baselines (add-alongside)** — we keep our own `fixed`/`recursive` chunkers (the from-scratch learning artifact) **and** add LangChain's `RecursiveCharacterTextSplitter` + `TokenTextSplitter` behind the same `Chunker` interface, so the eval benchmarks our splitters *against* the industry standard instead of replacing them. Surveyed the field first: LangChain.js is the de-facto default (its recursive splitter is what ours reimplements), LlamaIndex.TS is archived, benbrandt's `text-splitter` has no JS binding, Chonkie-js is pre-1.0 — none drop cleanly into our sync/pure/ESM contract, and recursive-512 is the production default that beats semantic chunking in benchmarks. Consequences: `Chunker.chunk` is **async** (LangChain's `splitText` returns a Promise). **Real tokenization** (js-tiktoken `cl100k_base`) lives in the LangChain chunkers via `lengthFunction`; our hand-rolled pair keep the `~4 chars/token` heuristic as a deliberate, documented baseline — so the comparison also measures *heuristic vs. real tokenizer*. `tokenCount` on a Chunk is recorded with whichever counter that chunker uses (see the `countTokens` seam in `chunk/common.ts`).
- **Multi-modal evidence** — the agent forecasts from *news* (RAG) **and** *on-chain order flow* (a `getOrderFlow` tool, tool-first); the rationale must be grounded in both. Order flow explains *who* moved a price, so the agent can update without news and separate informed money from noise.
- **Sequencing** — ship the core news + on-chain forecast loop first; the additional evidence modalities (D10–D13: cross-venue consensus, resolution scrutiny, category quant, order-book depth) come *after* the core loop works end-to-end.
- **Agent runtime = TS + LangGraph.js + LangSmith** — the loop is a LangGraph.js `StateGraph` (typed state; `interrupt()` for the HITL approval gate) with LangSmith tracing; keeps the runtime in TS so it reuses `decideBet`/schemas/ingest with no re-port. Evals stay Python; **both trace to one LangSmith project**. (LangGraph is slightly heavy for the v1 linear loop but pays off with the HITL interrupt and the D10–D13 fan-out.)
- **Vector store = Prisma 7 + driver adapter + Docker pgvector** — Postgres 17 + pgvector in Docker (`docker-compose.yml`, container `lykos-db`, host **port 5433** so it coexists with other local Postgres). Prisma 7 (engine-free) with **`@prisma/adapter-pg`** (the v7 client requires a driver adapter); the connection URL lives in `prisma.config.ts`, not the schema. The `embedding` column is `Unsupported("vector(1024)")` (Prisma has no native vector type) → **read/written only via `$queryRaw`/`$executeRaw`**; `CREATE EXTENSION vector` + the **HNSW `vector_cosine_ops`** index are hand-added to the migration (Prisma can't express either). The generated client (`prisma-client` generator, ESM) emits to `src/generated/` and is gitignored; `build`/`typecheck` run `prisma generate` first. The `VectorStore` interface means callers swap `InMemoryVectorStore` ↔ `PgVectorStore` with no code change. (We deliberately upgraded 6 → 7 to match current tooling.)
- **Recency weighting** — exponential time-decay: a passage halves its weight every **14 days** (configurable `halfLifeDays`); a missing/unparseable/future `publishedAt` gets weight **1** (don't punish unknown dates). Final rank = `relevance × recencyWeight`, where relevance is the rerank score (or vector similarity if not reranked). Applied to the **full reranked candidate set before the topK cut**, so freshness can change which passages make it, not just their order. `nowMs` is passed in → deterministic.
