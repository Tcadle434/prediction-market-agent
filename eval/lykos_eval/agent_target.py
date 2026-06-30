"""Live-agent eval target (D6): run the real TS forecasting agent for a market question.

The forecasting agent is TypeScript; this shells out to the Node bridge
(``scratchpad/forecast-bridge.mjs``) and parses its JSON. That lets the same LangSmith experiment
score the *actual* agent — its rationale and the context it retrieved — instead of a stored echo.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

# eval/lykos_eval/agent_target.py -> repo root
REPO_ROOT = Path(__file__).resolve().parents[2]
BRIDGE = "scratchpad/forecast-bridge.mjs"
TIMEOUT_SECONDS = 180


def agent_target(inputs: dict) -> dict:
    """Run the agent for ``inputs['question']`` and return its rationale + retrieved context."""
    question = inputs["question"]
    proc = subprocess.run(
        ["node", "--env-file=.env", BRIDGE, question],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=TIMEOUT_SECONDS,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"forecast bridge failed: {proc.stderr.strip()[:500]}")

    data = json.loads(proc.stdout)
    return {
        "rationale": data["rationale"],
        "context": data["context"],
        "probabilityYes": data.get("probabilityYes"),
        "abstained": data.get("abstained"),
    }
