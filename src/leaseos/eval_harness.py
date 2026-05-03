"""Eval harness — run extraction across a corpus and score per-field accuracy.

Each lease in `leases/<name>.pdf` has a paired ground-truth YAML at
`eval/ground_truth/<name>.yaml`. Only the fields present in the YAML are
scored — start small, grow over time.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from rich.console import Console
from rich.table import Table

from .extract import extract
from .pdf import load_pdf


PRIORITY_FIELDS = [
    "premises_address",
    "landlord",
    "tenant",
    "guarantor",
    "term_start",
    "term_length_years",
    "term_expiry",
    "initial_rent_gbp",
    "rent_frequency",
    "rent_review",
    "tenant_break",
    "landlord_break",
    "repair",
    "permitted_use",
    "alienation",
    "service_charge",
]


@dataclass
class LeaseScore:
    name: str
    correct: int = 0
    incorrect: int = 0
    missing: int = 0
    detail: dict[str, str] = field(default_factory=dict)

    @property
    def total(self) -> int:
        return self.correct + self.incorrect + self.missing

    @property
    def accuracy(self) -> float:
        return self.correct / self.total if self.total else 0.0


def _flatten_value(v: Any) -> Any:
    """Pull the comparable value out of an extracted-field-style dict."""
    if isinstance(v, dict) and "value" in v:
        return v["value"]
    return v


def _equal(expected: Any, actual: Any) -> bool:
    if expected is None and actual is None:
        return True
    if expected is None or actual is None:
        return False
    if isinstance(expected, str) and isinstance(actual, str):
        return expected.strip().lower() == actual.strip().lower()
    return expected == actual


def score_lease(name: str, extracted: dict, ground_truth: dict) -> LeaseScore:
    score = LeaseScore(name=name)
    for field_path, expected in ground_truth.items():
        actual = _resolve(extracted, field_path)
        actual_v = _flatten_value(actual) if not isinstance(expected, dict) else actual
        if _equal(expected, actual_v):
            score.correct += 1
            score.detail[field_path] = "ok"
        elif actual is None:
            score.missing += 1
            score.detail[field_path] = f"missing (expected {expected!r})"
        else:
            score.incorrect += 1
            score.detail[field_path] = f"got {actual_v!r}, expected {expected!r}"
    return score


def _resolve(d: dict, path: str) -> Any:
    """Resolve a dotted path like 'rent_review.basis' against a nested dict."""
    cur: Any = d
    for part in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def run_eval(corpus_dir: Path, leases_dir: Path, console: Console) -> None:
    yamls = sorted(corpus_dir.glob("*.yaml"))
    if not yamls:
        console.print(f"[yellow]No ground-truth YAMLs found in {corpus_dir}[/yellow]")
        return

    overall = LeaseScore(name="OVERALL")
    table = Table(title="LeaseOS eval", show_lines=False)
    table.add_column("Lease")
    table.add_column("Correct", justify="right")
    table.add_column("Wrong", justify="right")
    table.add_column("Missing", justify="right")
    table.add_column("Accuracy", justify="right")

    for yaml_path in yamls:
        name = yaml_path.stem
        pdf_path = leases_dir / f"{name}.pdf"
        if not pdf_path.exists():
            console.print(f"[yellow]Skipping {name}: no PDF at {pdf_path}[/yellow]")
            continue

        ground_truth = yaml.safe_load(yaml_path.read_text())
        with console.status(f"Extracting {name}…", spinner="dots"):
            result = extract(load_pdf(pdf_path))

        score = score_lease(name, result.record.model_dump(mode="json"), ground_truth)
        overall.correct += score.correct
        overall.incorrect += score.incorrect
        overall.missing += score.missing

        table.add_row(
            name,
            str(score.correct),
            str(score.incorrect),
            str(score.missing),
            f"{score.accuracy:.0%}",
        )

    table.add_section()
    table.add_row(
        "[bold]OVERALL[/bold]",
        str(overall.correct),
        str(overall.incorrect),
        str(overall.missing),
        f"[bold]{overall.accuracy:.1%}[/bold]",
    )
    console.print(table)
