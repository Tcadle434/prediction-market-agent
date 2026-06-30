"""Environment loading + a fail-fast preflight for the keys this harness needs.

Loads two files explicitly rather than letting ``load_dotenv()`` walk up the tree and silently
grab whatever ``.env`` it finds first (which is how a missing LangSmith key turned into an opaque
401 instead of a clear message):

- the **repo-root** ``.env`` — shared secrets the whole project uses (``ANTHROPIC_API_KEY``, …);
- ``eval/.env`` — eval-specific secrets layered on top (the LangSmith key), overriding root.

Then it verifies the keys the harness can't run without and exits with a readable message if any
are missing.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# config.py → lykos_eval/ → eval/ → repo root
EVAL_ENV = Path(__file__).resolve().parents[1] / ".env"
ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"

# Key → how to get it. Both are required to run a live experiment.
REQUIRED_KEYS: dict[str, str] = {
    "LANGSMITH_API_KEY": "LangSmith (free): https://smith.langchain.com → Settings → API Keys → eval/.env",
    "ANTHROPIC_API_KEY": "Anthropic (judge model): https://console.anthropic.com/settings/keys",
}


def load_env() -> None:
    """Load root + eval env files, then fail fast if a required key is missing."""
    load_dotenv(dotenv_path=ROOT_ENV)  # shared base (ANTHROPIC, etc.)
    load_dotenv(dotenv_path=EVAL_ENV, override=True)  # eval-specific overlay (LangSmith)

    missing = [key for key in REQUIRED_KEYS if not os.environ.get(key)]
    if not missing:
        return

    details = "\n".join(f"  - {key}: {REQUIRED_KEYS[key]}" for key in missing)
    hint = (
        ""
        if EVAL_ENV.exists()
        else f"\n\n  (No {EVAL_ENV} yet — copy eval/.env.example to eval/.env and fill it in.)"
    )
    raise SystemExit(
        f"\nMissing required env var(s) for the eval harness:\n{details}{hint}\n"
    )
