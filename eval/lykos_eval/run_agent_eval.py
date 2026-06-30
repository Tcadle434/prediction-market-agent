"""Run the LLM-judge eval against the REAL agent over real markets (D6).

Seeds a LangSmith dataset from ``eval/data/live_markets.json`` (real Polymarket questions — produce
it with ``node --env-file=.env scratchpad/fetch-markets.mjs``), then evaluates the live agent
target: both judges score the agent's *actual* rationale and the context it retrieved.

Each example runs the full research+forecast agent (Tavily + Voyage + Claude), so this is slower and
costs API calls — keep the market count and concurrency modest.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from langsmith import Client, evaluate

from .agent_target import agent_target
from .config import load_env
from .evaluators import groundedness_evaluator, retrieval_relevance_evaluator

MARKETS_PATH = Path(__file__).resolve().parent.parent / "data" / "live_markets.json"


def seed_live_markets(dataset_name: str) -> str:
    """Create/update the dataset from live_markets.json. Idempotent on market id."""
    client = Client()
    if client.has_dataset(dataset_name=dataset_name):
        dataset = client.read_dataset(dataset_name=dataset_name)
    else:
        dataset = client.create_dataset(
            dataset_name, description="Real Polymarket questions for the live-agent eval."
        )

    existing = {
        ex.metadata["market_id"]
        for ex in client.list_examples(dataset_id=dataset.id)
        if ex.metadata and "market_id" in ex.metadata
    }
    with MARKETS_PATH.open(encoding="utf-8") as markets_file:
        markets = json.load(markets_file)

    to_add = [m for m in markets if m["id"] not in existing]
    if to_add:
        client.create_examples(
            dataset_id=dataset.id,
            examples=[
                {"inputs": {"question": m["question"]}, "metadata": {"market_id": m["id"]}}
                for m in to_add
            ],
        )
    print(f"Dataset '{dataset_name}': {len(existing) + len(to_add)} total, {len(to_add)} newly added.")
    return dataset_name


def main() -> None:
    load_env()
    if not MARKETS_PATH.exists():
        raise SystemExit(
            f"No {MARKETS_PATH}.\nRun first: node --env-file=.env scratchpad/fetch-markets.mjs"
        )

    dataset = seed_live_markets(os.environ.get("LYKOS_LIVE_DATASET", "lykos-live-markets"))

    results = evaluate(
        agent_target,
        data=dataset,
        evaluators=[groundedness_evaluator, retrieval_relevance_evaluator],
        experiment_prefix="lykos-live-agent",
        max_concurrency=2,  # each example runs the full agent — keep it gentle on the APIs
    )

    print("\nExperiment created — open it in LangSmith for per-market scores + judge reasoning.")
    try:
        for row in results:
            question = row["example"].inputs.get("question", "")[:44]
            scores = {fb.key: fb.score for fb in row["evaluation_results"]["results"]}
            grounded = scores.get("groundedness")
            relevance = scores.get("retrieval_relevance")
            print(f"  {question:44}  grounded={grounded}  relevance={relevance}")
    except Exception:
        pass  # the experiment in LangSmith is the source of truth


if __name__ == "__main__":
    main()
