# Lykos eval — LangSmith LLM-judge evaluations (Python)

The **LLM-judged half** of Lykos's evaluation. Deterministic metrics (Brier, calibration, PnL in
units) are plain math and live with the TS packages; this Python project handles what genuinely
needs a model to judge. Two judges run today:

- **groundedness** — is a forecast's *rationale* actually grounded in the *evidence* it was given,
  or did it hallucinate?
- **retrieval relevance** — is the retrieved *evidence* actually relevant to the market *question*?
  This scores the retriever itself, independently of the rationale.

Built on **LangSmith** (datasets + experiments + tracing) and **openevals** (prebuilt
LLM-as-judge evaluators). Judge defaults to Claude (Anthropic).

## What this demonstrates (the LangChain eval surface)

- A versioned **LangSmith dataset** of labeled examples (`seed_dataset.py`)
- Two **LLM-as-judge evaluators** via `openevals` `RAG_GROUNDEDNESS_PROMPT` and
  `RAG_RETRIEVAL_RELEVANCE_PROMPT` (`evaluators.py`)
- A tracked **experiment** through `langsmith.evaluate(target, data, evaluators)` (`run_eval.py`)
- A **target** abstraction — today a placeholder; the real forecasting agent plugs in unchanged

## Setup

Python 3.12 (managed by uv) + two keys.

1. `cp .env.example .env` and fill in `LANGSMITH_API_KEY` — free at
   <https://smith.langchain.com> (Settings → API Keys). `ANTHROPIC_API_KEY` (the judge model) is
   inherited from the repo-root `.env`; only set it here to override.
2. `uv sync` — creates `.venv` and installs deps.

The harness loads the repo-root `.env` first (shared keys) then `eval/.env` (overlay), and
**fails fast with a readable message** if a required key is missing — no opaque 401s.

## Run

```bash
cd eval
uv run python -m lykos_eval.seed_dataset   # push/update the dataset in LangSmith
uv run python -m lykos_eval.run_eval       # run the LLM-judge experiment (auto-seeds first)
```

Open the experiment link printed by LangSmith to see each example's **groundedness** and
**retrieval_relevance** scores with the judge's reasoning, side by side with our human `grounded`
label (six examples — three grounded, three with planted hallucinations).

## How it connects to the rest of Lykos

`run_eval.py`'s `echo_target` is a stand-in. When the `agent` package lands, replace it with a
call that takes a market + retrieved evidence and returns a forecast rationale — and this same
harness then scores the real agent. The deterministic Brier/PnL scorecard is a separate, pure
module (no LLM).
