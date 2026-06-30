"""Create (or update) the LangSmith dataset of groundedness examples. Idempotent: re-running
only adds examples whose id isn't already present, so you can iterate on the JSON safely.
"""

from __future__ import annotations

import os

from langsmith import Client

from .config import load_env
from .examples import load_examples


def seed(dataset_name: str | None = None) -> str:
    load_env()
    dataset_name = dataset_name or os.environ.get("LYKOS_DATASET", "lykos-groundedness")
    client = Client()

    if client.has_dataset(dataset_name=dataset_name):
        ds = client.read_dataset(dataset_name=dataset_name)
    else:
        ds = client.create_dataset(
            dataset_name,
            description="Lykos groundedness: is a forecast rationale grounded in its evidence?",
        )

    # Dedup on re-run via the example_id we stash in metadata.
    existing = {
        ex.metadata["example_id"]
        for ex in client.list_examples(dataset_id=ds.id)
        if ex.metadata and "example_id" in ex.metadata
    }

    to_add = [e for e in load_examples() if e["id"] not in existing]
    if to_add:
        client.create_examples(
            dataset_id=ds.id,
            examples=[
                {
                    "inputs": {"question": e["question"], "context": e["context"], "rationale": e["rationale"]},
                    "outputs": {"grounded": e["grounded"], "note": e.get("note", "")},
                    "metadata": {"example_id": e["id"]},
                }
                for e in to_add
            ],
        )

    print(f"Dataset '{dataset_name}': {len(existing) + len(to_add)} total, {len(to_add)} newly added.")
    return dataset_name


if __name__ == "__main__":
    seed()
