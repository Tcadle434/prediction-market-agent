"""Run the groundedness evaluation as a LangSmith experiment.

The *target* is the thing being evaluated. Today it's a placeholder that echoes the candidate
rationale stored on each example; when the forecasting `agent` package lands, swap `echo_target`
for a call that takes (question + retrieved evidence) and returns a real rationale — the rest of
this harness stays the same.
"""

from __future__ import annotations

from dotenv import load_dotenv
from langsmith import evaluate

from .evaluators import groundedness_evaluator
from .seed_dataset import seed


def echo_target(inputs: dict) -> dict:
    """Placeholder forecaster: return the candidate rationale as-is."""
    return {"rationale": inputs["rationale"]}


def main() -> None:
    load_dotenv()
    dataset = seed()  # ensure the dataset exists / is up to date

    results = evaluate(
        echo_target,
        data=dataset,
        evaluators=[groundedness_evaluator],
        experiment_prefix="lykos-groundedness",
        max_concurrency=4,
    )

    print("\nExperiment created — open it in LangSmith to inspect per-example scores + reasoning.")
    try:
        for row in results:
            q = row["example"].inputs.get("question", "")[:48]
            fb = row["evaluation_results"]["results"][0]
            print(f"  {q:48}  groundedness={fb.score}")
    except Exception:
        pass  # local summary is best-effort; the experiment in LangSmith is the source of truth


if __name__ == "__main__":
    main()
