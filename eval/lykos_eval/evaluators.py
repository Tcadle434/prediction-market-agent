"""LLM-as-judge evaluators, built on openevals + LangSmith.

Two judges, both prebuilt openevals RAG prompts, both Claude by default:

- **groundedness** (``RAG_GROUNDEDNESS_PROMPT``) — are the ``outputs`` (the forecast *rationale*)
  supported by the ``context`` (the *evidence*)? Catches hallucination.
- **retrieval relevance** (``RAG_RETRIEVAL_RELEVANCE_PROMPT``) — is the retrieved ``context``
  actually relevant to the ``inputs`` (the market *question*)? Catches a bad retriever. Note this
  judge never looks at the rationale — it scores the evidence against the question alone.

These are the LLM-judged half of the eval harness — the deterministic Brier / PnL scorecard is
plain math elsewhere, and deliberately does NOT use an LLM.
"""

from __future__ import annotations

import os
from functools import lru_cache

from openevals.llm import create_llm_as_judge
from openevals.prompts import RAG_GROUNDEDNESS_PROMPT, RAG_RETRIEVAL_RELEVANCE_PROMPT

DEFAULT_JUDGE_MODEL = os.environ.get("LYKOS_JUDGE_MODEL", "anthropic:claude-haiku-4-5-20251001")


@lru_cache(maxsize=None)
def make_groundedness_judge(model: str = DEFAULT_JUDGE_MODEL):
    """The raw openevals groundedness judge, callable as ``judge(outputs=..., context=...)``.

    Cached per model so we build it once and reuse it across examples.
    """
    return create_llm_as_judge(
        prompt=RAG_GROUNDEDNESS_PROMPT,
        feedback_key="groundedness",
        model=model,
        continuous=True,  # score in [0.0, 1.0] rather than pass/fail
    )


@lru_cache(maxsize=None)
def make_relevance_judge(model: str = DEFAULT_JUDGE_MODEL):
    """The raw openevals retrieval-relevance judge, callable as ``judge(inputs=..., context=...)``.

    Cached per model so we build it once and reuse it across examples.
    """
    return create_llm_as_judge(
        prompt=RAG_RETRIEVAL_RELEVANCE_PROMPT,
        feedback_key="retrieval_relevance",
        model=model,
        continuous=True,
    )


def groundedness_evaluator(inputs: dict, outputs: dict, reference_outputs: dict | None = None):
    """LangSmith-compatible evaluator: is the rationale grounded in the evidence?

    LangSmith calls this with the example ``inputs``, the target's ``outputs``, and the example's
    ``reference_outputs``. Returns the openevals feedback dict ({"key", "score", "comment"}).
    """
    return make_groundedness_judge()(outputs=outputs["rationale"], context=inputs["context"])


def retrieval_relevance_evaluator(inputs: dict, outputs: dict, reference_outputs: dict | None = None):
    """LangSmith-compatible evaluator: is the retrieved evidence relevant to the question?

    Scores ``inputs["context"]`` against ``inputs["question"]`` only — the target's ``outputs`` are
    not used, so this judges the *retriever*, independently of what the forecaster did with it.
    """
    return make_relevance_judge()(inputs=inputs["question"], context=inputs["context"])
