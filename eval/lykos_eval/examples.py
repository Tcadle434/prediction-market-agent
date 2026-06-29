"""Load the seed groundedness examples bundled with the repo."""

from __future__ import annotations

import json
from pathlib import Path

EXAMPLES_PATH = Path(__file__).resolve().parent.parent / "data" / "groundedness_examples.json"


def load_examples() -> list[dict]:
    """Return the list of example dicts (id, question, context, rationale, grounded, note)."""
    with EXAMPLES_PATH.open(encoding="utf-8") as example_file:
        return json.load(example_file)
