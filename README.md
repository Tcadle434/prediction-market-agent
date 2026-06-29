# Lykos — a prediction-market research agent

An AI agent that researches an open prediction market, **retrieves and grounds evidence** with a
RAG pipeline, **forecasts the outcome probability** with cited reasoning, and — behind a
human-approval gate — **takes a position**. It ships with an **eval harness** that scores the
agent's calibration against *already-resolved* markets and against the market price itself.

> Status: **Step 1 — foundation only.** No application code yet. This README is the map.

---

## Why this project exists

It's a portfolio piece for AI/Forward-Deployed-Engineer roles. It deliberately demonstrates the
three things those roles screen hardest for:

1. **A real workflow agent** — not a chatbot. It does a task end-to-end and takes a real action.
2. **A RAG pipeline** — retrieval, chunking, embeddings, reranking, grounding with citations.
3. **An eval harness** — the rarest signal. Because prediction markets *resolve*, we get ground
   truth for free and can measure **calibration (Brier score)** vs. the market baseline.

## How it works (data flow)

```
                    ┌─────────────┐
   open market ───► │   ingest    │  fetch market (Polymarket) + evidence (Tavily search)
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
   resolved markets │    evals    │  Brier / calibration, market baseline, faithfulness (LLM-judge),
       (truth) ───► │             │  retrieval recall, abstention — gated in CI
                    └─────────────┘
```

## Repository layout (planned)

A pnpm **monorepo**. Each concern is its own package so it can be built, tested, and reasoned about
in isolation — and so the eval harness can import the exact same code the agent runs.

| Package | Responsibility | Status |
| --- | --- | --- |
| `packages/core` | Shared domain types (`Market`, `Evidence`, `Chunk`, `Forecast`…) + config loading | ⬜ next |
| `packages/ingest` | Fetch markets (Polymarket Gamma) and evidence (Tavily); cache to `data/` | ⬜ |
| `packages/rag` | Chunkers (fixed / recursive / semantic), embeddings, pgvector store, retriever + reranker | ⬜ |
| `packages/agent` | Forecast loop: retrieve → estimate → edge calc → policy gate → (paper) trade → audit log | ⬜ |
| `packages/evals` | Golden set + Brier/calibration + market baseline + faithfulness judge + CI gate | ⬜ |
| `packages/mcp` | (optional) expose the agent as an MCP server | ⬜ |
| `apps/dashboard` | (optional) Next.js view: forecasts vs. market, calibration plot, trace log | ⬜ |

## Tech decisions (and why)

- **pnpm workspaces monorepo** — many small packages with a shared toolchain; the eval harness
  imports the real agent/rag code instead of re-implementing it.
- **TypeScript, ESM, `NodeNext`** — the stack these roles use; strict settings catch bugs early.
- **Python for the eval *stats*** (later) — Brier/calibration math and the reliability-diagram plot
  are cleaner in Python, and it's a deliberate "I write Python too" signal.
- **Claude (Anthropic SDK)** — the agent's reasoning and the LLM-as-judge grader.
- **Voyage** — embeddings + reranking for retrieval quality.
- **Postgres + pgvector (local, via Docker)** — vector store; runs in a container, no cloud account.
- **Polymarket Gamma** — read-only market data + resolved outcomes (our ground truth). No key.
- **Tavily** — web/news search that feeds the RAG corpus.

## Safety

This is a **research tool**. It defaults to **paper-trading / Kalshi sandbox**, and **any real
position requires explicit human approval**. It never auto-moves real money.

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

**Two scorecards in `evals`:**
- *Forecast quality* — Brier score, calibration curve, and Brier-vs-market (does it beat the price?)
- *Economic* — PnL / ROI from filling at the best ask, reported in **units** (e.g. "+18 units over
  120 bets"), plus a risk-adjusted figure.

## Build roadmap

Status, the deferred-work backlog (each item with a **trigger** and **where it plugs in**), and
the design decisions live in **[docs/ROADMAP.md](docs/ROADMAP.md)** — the single source of truth,
so this README doesn't drift.

Phases: `core` ✅ → `sizing` ✅ → `ingest` ✅ → `eval` (LLM-judge) ✅ → `rag` → `agent` → deterministic evals → dashboard.

## Getting started (placeholder)

```bash
nvm use            # Node 22+ (24 is fine)
corepack enable    # makes the pinned pnpm available
pnpm install       # nothing to install yet — no packages declared
cp .env.example .env
```
