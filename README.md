# Lykos — a prediction-market research agent

An AI agent that researches an open prediction market, **retrieves and grounds evidence** with a
RAG pipeline, **forecasts the outcome probability** with cited reasoning, and — behind a
human-approval gate — **takes a (paper) position**. It ships with an **eval harness** that scores
the agent against *already-resolved* markets and against the market price itself.

> Status: **the core loop is built and runs end to end** —
> `research → forecast → size → human approval → execute (paper) → audit log` — with a two-stage
> RAG pipeline, LLM-judge evals over live markets, and **146 passing tests**. In progress:
> on-chain order flow as a second evidence modality, then the deterministic Brier/calibration and
> PnL scorecards. [docs/ROADMAP.md](docs/ROADMAP.md) tracks every step and decision.

---

## Why this project exists

Agent demos are easy; agents you can *measure* are rare. Most LLM agents have no ground truth to
score against, so "it works" means "the demo looked good." Prediction markets fix that: **every
market eventually resolves**, so every forecast gets a real grade — and the market price itself is
a strong baseline the agent has to beat. That makes this a testbed for the full reliability loop
production agents need:

1. **A real workflow agent** — not a chatbot. It does a task end-to-end and takes a gated action.
2. **A grounded RAG pipeline** — retrieval, chunking, embeddings, reranking, and citations the
   forecast must actually use (or it abstains).
3. **An eval harness** — LLM judges for what genuinely needs judging (groundedness, retrieval
   relevance) and deterministic math for what doesn't (Brier/calibration vs. the market baseline).

Built in public — partly as deliberate practice with real-world AI engineering, end to end. The
full decision log, including the roads not taken, lives in [docs/ROADMAP.md](docs/ROADMAP.md).

## What works today

- **End-to-end forecast loop** (LangGraph.js `StateGraph`):
  `gatherNews → forecast → size → approvalGate → execute → log`, every node traced in LangSmith.
- **Two-stage RAG** — Tavily search (recall) → chunk → Voyage embeddings → pgvector → retrieve →
  Voyage rerank → recency decay (precision). Hand-rolled *and* LangChain chunkers behind one
  interface, so the evals can benchmark them against each other.
- **Cited, structured forecasts** — Claude returns `P(yes)` + confidence + a rationale with
  verbatim passage citations, validated against the retrieved evidence; the agent may abstain.
- **Edge-aware sizing** — fractional Kelly on `edge = q − ask`; confidence only ever *shrinks* a
  bet; hard-capped at 5 units.
- **Human-in-the-loop approval** — LangGraph `interrupt()` + checkpointer: the graph pauses on any
  decision that requires approval and resumes only on an explicit human command.
- **Paper execution + hash-chained audit log** — approved bets fill at the ask into a `Position`;
  every run appends a sha256 hash-chained, genesis-anchored audit record.
- **LLM-judge evals over live markets** — LangSmith + openevals judges for groundedness and
  retrieval relevance, scoring the *real* agent on real Polymarket questions via a TS↔Python
  bridge (plus a golden-set regression suite for the judges themselves).
- **Order-flow ingestion** — validated on-chain trade feed per market (the first half of the
  second evidence modality).

Try the human-approval demo with **no API keys**:

```bash
pnpm install && pnpm build
node scratchpad/agent-approval.mjs   # watch the graph pause at the gate, then resume on approval
```

## How it works (data flow)

```
                    ┌─────────────┐
   open market ───► │   ingest    │  fetch market + on-chain trades (Polymarket) + news (Tavily)
                    └──────┬──────┘
                           ▼
                    ┌─────────────┐
                    │     rag     │  chunk → embed → store (pgvector) → retrieve → rerank
                    └──────┬──────┘
                           ▼
                    ┌─────────────┐
                    │    agent    │  estimate P(yes) + cited rationale → edge vs. market
                    │             │  → policy gate (caps, min-edge, human approval) → act → audit log
                    └──────┬──────┘
                           ▼
                    ┌─────────────┐
   resolved markets │    evals    │  groundedness + retrieval relevance (LLM judges, live);
       (truth) ───► │             │  Brier / calibration / PnL vs. market baseline (next)
                    └─────────────┘
```

## Repository layout

A pnpm **monorepo**. Each concern is its own package so it can be built, tested, and reasoned
about in isolation — and so the eval harness imports the exact same code the agent runs.

| Package | Responsibility | Status |
| --- | --- | --- |
| `packages/core` | Shared domain types (`Market`, `Evidence`, `Chunk`, `Forecast`…) + config | ✅ |
| `packages/sizing` | Model-A bet sizing (`decideBet`): fractional Kelly, min-edge, unit caps | ✅ |
| `packages/ingest` | Polymarket markets + on-chain trade feed; JSON snapshot cache | ✅ |
| `packages/rag` | Two-stage retrieval: search → chunk → embed → pgvector → retrieve → rerank | ✅ |
| `packages/agent` | LangGraph.js loop: RAG → forecast → size → approval → execute → audit | ✅ core loop |
| `eval/` (Python) | LangSmith LLM judges (groundedness, retrieval relevance) + live-agent target | ✅ |
| `getOrderFlow` tool | Order flow as a second evidence modality inside the agent | 🔨 in progress |
| deterministic evals | Brier / calibration / PnL scorecards vs. the market baseline | ⬜ next |
| dashboard / MCP | Next.js calibration view · the agent as an MCP server | ⬜ planned |

## Tech decisions (and why)

- **pnpm workspaces monorepo** — many small packages with a shared toolchain; the eval harness
  imports the real agent/rag code instead of re-implementing it.
- **TypeScript, ESM, `NodeNext`** — strict settings catch bugs early.
- **LangGraph.js + LangSmith** — the loop is a typed `StateGraph`; `interrupt()` gives a real
  checkpointer-backed human-approval gate, and every node call is traced.
- **Claude (Anthropic SDK)** — the agent's reasoning and the LLM-as-judge grader.
- **Voyage** — embeddings + reranking for retrieval quality.
- **Postgres 17 + pgvector via Docker, Prisma 7** — vector store behind a swappable `VectorStore`
  interface (in-memory ↔ pgvector with no code change); runs locally, no cloud account.
- **Python for the eval harness** — LangSmith/openevals judges and (next) the Brier/calibration
  stats, where the ecosystem is strongest — and a deliberate "I write Python too" signal.
- **Polymarket Gamma + data-api** — read-only market data, resolved outcomes (our ground truth),
  and the on-chain trade feed. No keys required.
- **Tavily** — web/news search that feeds the RAG corpus.

## Safety

This is a **research tool**. It defaults to **paper-trading**, and **any position requires
explicit human approval** at the interrupt gate. It never auto-moves real money.

## Sizing & scoring (the economic model)

Forecast *accuracy* and *profitability* are different axes — an agent can be right 90% of the
time and still lose money — so we measure both.

**Sizing — edge-aware fractional Kelly, expressed in units.** A forecast becomes a bet only when
it beats the *price you'd actually pay* (the best ask), not merely when confidence is high:

- `edge = q − ask` per side; skip if below `minEdge`
- Kelly fraction `f* = edge / (1 − ask)`; stake fraction = `λ · confidence · f*` (quarter-Kelly)
- discretized to **1–5 units** (1 unit = 1% of bankroll), hard-capped at 5

Model (A): `confidence` only ever *shrinks* the bet. `q` is the honest mean probability;
uncertainty lives in `confidence`, never double-counted inside `q`.

**Two scorecards in the evals:**
- *Forecast quality* — Brier score, calibration curve, and Brier-vs-market (does it beat the price?)
- *Economic* — PnL / ROI from filling at the best ask, reported in **units** (e.g. "+18 units over
  120 bets"), plus a risk-adjusted figure.

## Build roadmap

Status, the deferred-work backlog (each item with a **trigger** and **where it plugs in**), and
the design decisions live in **[docs/ROADMAP.md](docs/ROADMAP.md)** — the single source of truth,
so this README doesn't drift.

Phases: `core` ✅ → `sizing` ✅ → `ingest` ✅ → LLM-judge evals ✅ → `rag` ✅ → `agent` core loop ✅
→ order-flow modality 🔨 → deterministic evals ⬜ → dashboard ⬜.

## Getting started

```bash
nvm use            # Node 22+ (24 is fine)
corepack enable    # makes the pinned pnpm available
pnpm install
pnpm build && pnpm test            # 146 tests — no keys, no DB needed
node scratchpad/agent-approval.mjs # keyless demo: the human-approval gate pausing + resuming
```

For a **live run** against a real Polymarket market (real retrieval, a real forecast, and a
terminal approval prompt):

```bash
cp .env.example .env               # add ANTHROPIC_API_KEY, VOYAGE_API_KEY, TAVILY_API_KEY
node --env-file=.env scratchpad/agent-live.mjs            # top open market by volume
node --env-file=.env scratchpad/agent-live.mjs <marketId> # or a specific market
```

Optional: `docker compose up -d` starts local Postgres + pgvector (host port **5433**) for the
persistent vector store; the live demo defaults to an in-memory store, so it isn't required.
