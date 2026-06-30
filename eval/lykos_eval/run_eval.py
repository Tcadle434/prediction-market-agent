"""Run the LLM-judge evaluation as a LangSmith experiment.

Two judges run over each example: **groundedness** (is the rationale supported by the evidence?)
and **retrieval relevance** (is the evidence relevant to the question?). Both attach feedback to
the same experiment run.

The *target* is the thing being evaluated. Today it's a placeholder that echoes the candidate
rationale stored on each example; when the forecasting `agent` package lands, swap `echo_target`
for a call that takes (question + retrieved evidence) and returns a real rationale — the rest of
this harness stays the same.
"""

from __future__ import annotations

from langsmith import evaluate

from .config import load_env
from .evaluators import groundedness_evaluator, retrieval_relevance_evaluator
from .seed_dataset import seed


def echo_target(inputs: dict) -> dict:
    """Placeholder forecaster: return the candidate rationale as-is."""
    return {"rationale": inputs["rationale"]}


def main() -> None:
    load_env()
    dataset = seed()  # ensure the dataset exists / is up to date

    results = evaluate(
        echo_target,
        data=dataset,
        evaluators=[groundedness_evaluator, retrieval_relevance_evaluator],
        experiment_prefix="lykos-llm-judge",
        max_concurrency=4,
    )

    print("\nExperiment created — open it in LangSmith to inspect per-example scores + reasoning.")
    try:
        for row in results:
            q = row["example"].inputs.get("question", "")[:40]
            scores = {fb.key: fb.score for fb in row["evaluation_results"]["results"]}
            grounded = scores.get("groundedness")
            relevance = scores.get("retrieval_relevance")
            print(f"  {q:40}  groundedness={grounded}  retrieval_relevance={relevance}")
    except Exception:
        pass  # local summary is best-effort; the experiment in LangSmith is the source of truth


if __name__ == "__main__":
    main()
