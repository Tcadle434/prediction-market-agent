"""Groundedness LLM-as-judge, built on openevals + LangSmith.

We use openevals' ``RAG_GROUNDEDNESS_PROMPT``, which judges whether ``outputs`` are supported by
``context``. For Lykos: is the forecast *rationale* grounded in the retrieved *evidence*? This is
the LLM-judged half of the eval harness — the deterministic Brier / PnL scorecard is plain math
elsewhere, and deliberately does NOT use an LLM.
"""

from __future__ import annotations

import os

from openevals.llm import create_llm_as_judge
from openevals.prompts import RAG_GROUNDEDNESS_PROMPT

DEFAULT_JUDGE_MODEL = os.environ.get("LYKOS_JUDGE_MODEL", "anthropic:claude-haiku-4-5-20251001")

# Build the judge once and reuse it across examples (constructing per-call is wasteful).
_judge = None


def make_groundedness_judge(model: str = DEFAULT_JUDGE_MODEL):
    """Create the raw openevals evaluator, callable as ``judge(outputs=..., context=...)``."""
    return create_llm_as_judge(
        prompt=RAG_GROUNDEDNESS_PROMPT,
        feedback_key="groundedness",
        model=model,
        continuous=True,  # score in [0.0, 1.0] rather than pass/fail
    )


def _get_judge():
    global _judge
    if _judge is None:
        _judge = make_groundedness_judge()
    return _judge


def groundedness_evaluator(inputs: dict, outputs: dict, reference_outputs: dict | None = None):
    """LangSmith-compatible evaluator.

    LangSmith calls this with the example ``inputs``, the target's ``outputs``, and the example's
    ``reference_outputs``. We judge the rationale against the evidence and return the openevals
    feedback dict ({"key", "score", "comment"}), which LangSmith records on the run.
    """
    return _get_judge()(outputs=outputs["rationale"], context=inputs["context"])
