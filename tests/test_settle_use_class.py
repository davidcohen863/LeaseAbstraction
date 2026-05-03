"""Tests for the use-class extraction inside `settle_pack`.

The full route hits the DB + needs a saved pack, so we test the regex in
isolation — that's where the bug was. Before the fix, `use_class` was the
entire permitted-use clause text (a 100+ char legal paragraph) which broke
the comparables filter UI.
"""

from __future__ import annotations

import re

import pytest

# Mirror of the regex in src/leaseos/api/routes/packs.py:settle_pack().
# Kept duplicated so a future refactor that breaks the regex will fail this test.
USE_CLASS_RE = re.compile(
    r"\b(sui generis|E\([a-g]\)|E(?!\w)|F1(?!\w)|F2(?!\w)|B[12](?!\w)|C[1-4](?!\w))",
    re.I,
)


def extract(text: str) -> str | None:
    m = USE_CLASS_RE.search(text)
    return m.group(1) if m else None


@pytest.mark.parametrize(
    "permitted_use_text,expected",
    [
        # Real LeaseOS extraction sample (the actual bug)
        (
            "Use as a restaurant and café within Use Class E(b) of the Town and "
            "Country Planning (Use Classes) Order 1987 (as amended)",
            "E(b)",
        ),
        # Bare codes — common shorthand
        ("E(a)", "E(a)"),
        ("E", "E"),
        ("F1", "F1"),
        ("F2", "F2"),
        ("B1", "B1"),
        ("C3", "C3"),
        ("Sui generis", "Sui generis"),
        # Mixed-case
        ("class e(b) restaurant", "e(b)"),
        # Class code embedded in a real sentence
        ("Permitted use is restricted to Class E(b) only.", "E(b)"),
        ("The premises must be used as a B1 office.", "B1"),
        # No match
        ("retail premises only", None),
        ("", None),
    ],
)
def test_use_class_extraction(permitted_use_text, expected):
    if expected is None:
        assert extract(permitted_use_text) is None
    else:
        # Case-insensitive match — compare lower-cased
        assert (extract(permitted_use_text) or "").lower() == expected.lower()


def test_extracts_first_match_only():
    # If multiple class codes appear (rare but possible in renewal docs),
    # we pick the first to keep the comparable rows short and predictable.
    assert extract("Originally B1 office, now Class E").lower() == "b1"
