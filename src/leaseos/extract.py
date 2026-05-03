"""Anthropic extraction call.

Sends the lease (native text + page images) to Claude with a forced tool-use
that conforms to LeaseRecord. Uses prompt caching on the system prompt and
the tool definition so dev-time iteration on a single lease is cheap.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path

from anthropic import Anthropic
from pydantic import ValidationError

from .pdf import LoadedPDF
from .prompts import (
    SIDE_LETTER_SUMMARY_PROMPT,
    SYSTEM_PROMPT,
    SYSTEM_PROMPT_SKEPTICAL,
    USER_PRIMER,
)
from .schema import LeaseRecord, lease_record_json_schema


DEFAULT_MODEL = os.getenv("LEASEOS_MODEL", "claude-sonnet-4-6")
DEFAULT_LONG_MODEL = os.getenv("LEASEOS_LONG_MODEL", "claude-opus-4-7")
LONG_LEASE_PAGE_THRESHOLD = 120
TOOL_NAME = "record_lease"


@dataclass
class ExtractionResult:
    record: LeaseRecord
    raw_tool_input: dict
    model: str
    elapsed_seconds: float
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int
    cache_write_tokens: int


def _build_user_content(pdf: LoadedPDF) -> list[dict]:
    """One PDF → a list of content blocks: primer, then per-page (text + image).

    The last image gets a cache_control marker so re-extracting the same lease
    during development hits the cache.
    """
    blocks: list[dict] = [{"type": "text", "text": USER_PRIMER}]

    for page in pdf.pages:
        # Native text layer (skipped for fully scanned pages)
        if page.text.strip():
            blocks.append(
                {
                    "type": "text",
                    "text": f"--- Page {page.number} (native text) ---\n{page.text}",
                }
            )
        # Page image — Claude reads stamps, signatures, manual annotations
        blocks.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": page.image_b64,
                },
            }
        )

    # Cache the entire user content for cheap re-runs of the same lease
    if blocks:
        last = blocks[-1]
        last["cache_control"] = {"type": "ephemeral"}
    return blocks


def _build_tool() -> dict:
    return {
        "name": TOOL_NAME,
        "description": (
            "Record the structured abstraction of the UK commercial lease. "
            "Call this exactly once with the complete extracted record. Every "
            "field must include a citation (page, clause reference, verbatim "
            "quote)."
        ),
        "input_schema": lease_record_json_schema(),
        "cache_control": {"type": "ephemeral"},
    }


def pick_model(pdf: LoadedPDF, override: str | None = None) -> str:
    if override:
        return override
    if pdf.page_count >= LONG_LEASE_PAGE_THRESHOLD:
        return DEFAULT_LONG_MODEL
    return DEFAULT_MODEL


def extract(
    pdf: LoadedPDF,
    *,
    model: str | None = None,
    max_tokens: int = 8000,
    system_prompt: str | None = None,
) -> ExtractionResult:
    """Run a single-pass extraction. Returns a validated LeaseRecord.

    `system_prompt` overrides the default neutral SYSTEM_PROMPT — used by
    `extract_two_pass()` for the "skeptical" second pass.
    """
    client = Anthropic()
    chosen_model = pick_model(pdf, override=model)

    user_content = _build_user_content(pdf)
    tool = _build_tool()

    started = time.monotonic()
    response = client.messages.create(
        model=chosen_model,
        max_tokens=max_tokens,
        system=[
            {
                "type": "text",
                "text": system_prompt or SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        tools=[tool],
        tool_choice={"type": "tool", "name": TOOL_NAME},
        messages=[{"role": "user", "content": user_content}],
    )
    elapsed = time.monotonic() - started

    tool_input = _extract_tool_input(response)
    try:
        record = LeaseRecord.model_validate(tool_input)
    except ValidationError as exc:
        raise RuntimeError(
            f"Model returned a tool input that does not conform to LeaseRecord:\n{exc}\n\n"
            f"Raw input:\n{json.dumps(tool_input, indent=2, default=str)[:2000]}"
        ) from exc

    record.source_document_filename = pdf.path.name
    record.extraction_model = chosen_model
    record.extraction_seconds = round(elapsed, 2)

    usage = response.usage
    return ExtractionResult(
        record=record,
        raw_tool_input=tool_input,
        model=chosen_model,
        elapsed_seconds=elapsed,
        input_tokens=getattr(usage, "input_tokens", 0),
        output_tokens=getattr(usage, "output_tokens", 0),
        cache_read_tokens=getattr(usage, "cache_read_input_tokens", 0) or 0,
        cache_write_tokens=getattr(usage, "cache_creation_input_tokens", 0) or 0,
    )


def _extract_tool_input(response) -> dict:
    for block in response.content:
        if getattr(block, "type", None) == "tool_use" and block.name == TOOL_NAME:
            return block.input
    raise RuntimeError(
        f"Model did not call the {TOOL_NAME!r} tool. Stop reason: {response.stop_reason}. "
        f"Content blocks: {[getattr(b, 'type', '?') for b in response.content]}"
    )


# ---- Two-pass extraction (week-2 PRD quality lift) -----------------------

# Cost: pass 2 reuses the cached lease content (~90% cheaper for the lease
# tokens) but pays full price for its own system prompt. Roughly 1.3-1.5x
# the cost of a single pass, not 2x. Worth it for high-stakes leases — the
# `confidence` flag becomes signal not noise.
#
# Latency: ~2x — both passes run sequentially. Could parallelise later if
# the BackgroundTasks wait becomes annoying.

META_KEYS_FOR_DIFF = {"citation", "confidence", "notes"}
TWO_PASS_NOTE_PREFIX = "[two-pass disagreement]"


def extract_two_pass(
    pdf: LoadedPDF,
    *,
    model: str | None = None,
    max_tokens: int = 8000,
) -> ExtractionResult:
    """Run extraction twice with deliberately different framings, merge with
    disagreement-based confidence. The merged record's `confidence` flags
    are calibrated by *agreement between two independent reads*, not the
    model's self-reported confidence (which is well-known to be miscalibrated).
    """
    pass1 = extract(pdf, model=model, max_tokens=max_tokens, system_prompt=SYSTEM_PROMPT)
    pass2 = extract(pdf, model=model, max_tokens=max_tokens, system_prompt=SYSTEM_PROMPT_SKEPTICAL)

    merged_record, disagreement_count = _merge_records(pass1.record, pass2.record)

    # Aggregate metrics across both passes
    return ExtractionResult(
        record=merged_record,
        raw_tool_input=pass1.raw_tool_input,
        model=f"{pass1.model} (2-pass; {disagreement_count} disagreements)",
        elapsed_seconds=pass1.elapsed_seconds + pass2.elapsed_seconds,
        input_tokens=pass1.input_tokens + pass2.input_tokens,
        output_tokens=pass1.output_tokens + pass2.output_tokens,
        cache_read_tokens=pass1.cache_read_tokens + pass2.cache_read_tokens,
        cache_write_tokens=pass1.cache_write_tokens + pass2.cache_write_tokens,
    )


def _merge_records(p1: LeaseRecord, p2: LeaseRecord) -> tuple[LeaseRecord, int]:
    """Merge two LeaseRecord readings into one, downgrading confidence where
    they disagree on substantive content. Returns (merged, disagreement_count).

    Strategy:
    - Take pass 1 as the canonical record.
    - For each top-level field, strip metadata (citation/confidence/notes —
      the wording legitimately varies between passes) and JSON-compare what's
      left.
    - If different: clone the field, set confidence="low", append a note
      flagging the two-pass disagreement.
    - Pass 1 wins on the actual value — we don't try to pick a "better" one
      because both readings are equally informed; the surveyor must verify.
    """
    a = p1.model_dump(mode="json")
    b = p2.model_dump(mode="json")

    disagreements = 0
    merged: dict[str, object] = {}

    for key, va in a.items():
        if not isinstance(va, dict):
            # Engine metadata fields — keep pass 1's
            merged[key] = va
            continue
        vb = b.get(key) if isinstance(b, dict) else None
        if _strip_meta(va) == _strip_meta(vb):
            merged[key] = va
            continue
        # Disagreement — clone with downgraded confidence + appended note
        disagreements += 1
        cloned = dict(va)
        if "confidence" in cloned:
            cloned["confidence"] = "low"
        existing_notes = (cloned.get("notes") or "").strip()
        new_note = f"{TWO_PASS_NOTE_PREFIX} the second-pass reading differed; verify before sending."
        cloned["notes"] = (
            f"{existing_notes} {new_note}".strip() if existing_notes else new_note
        )
        merged[key] = cloned

    return LeaseRecord.model_validate(merged), disagreements


def _strip_meta(v):
    """Remove citation / confidence / notes recursively from a dict-like
    value so we can compare substantive content across two passes."""
    if v is None:
        return None
    if isinstance(v, dict):
        return {k: _strip_meta(val) for k, val in v.items() if k not in META_KEYS_FOR_DIFF}
    if isinstance(v, list):
        return [_strip_meta(x) for x in v]
    return v


# ---- Side-letter / variation / licence summarisation -------------------


@dataclass
class SummaryResult:
    markdown: str
    model: str
    elapsed_seconds: float
    input_tokens: int
    output_tokens: int


def summarise_ancillary_doc(
    pdf: LoadedPDF,
    *,
    parent_lease_summary: str | None = None,
    model: str | None = None,
    max_tokens: int = 2000,
) -> SummaryResult:
    """Produce a structured markdown summary of an ancillary document
    (side-letter, deed of variation, licence to alter etc.) attached to a
    principal lease.

    `parent_lease_summary` is an optional 1-2 sentence summary of the parent
    lease so the model can frame the side-letter relative to it.

    Returns prose markdown — does NOT call any tool. Cheap (~£0.02/doc since
    side-letters are typically 1-3 pages).
    """
    client = Anthropic()
    chosen_model = model or DEFAULT_MODEL

    user_blocks: list[dict] = []
    if parent_lease_summary:
        user_blocks.append({
            "type": "text",
            "text": f"# Context — the principal lease\n\n{parent_lease_summary}\n\n# The ancillary document follows",
        })
    else:
        user_blocks.append({
            "type": "text",
            "text": "# The ancillary document follows. Summarise it relative to the lease it modifies.",
        })

    for page in pdf.pages:
        if page.text.strip():
            user_blocks.append({
                "type": "text",
                "text": f"--- Page {page.number} (native text) ---\n{page.text}",
            })
        user_blocks.append({
            "type": "image",
            "source": {"type": "base64", "media_type": "image/png", "data": page.image_b64},
        })
    if user_blocks:
        user_blocks[-1]["cache_control"] = {"type": "ephemeral"}

    started = time.monotonic()
    response = client.messages.create(
        model=chosen_model,
        max_tokens=max_tokens,
        system=[{
            "type": "text",
            "text": SIDE_LETTER_SUMMARY_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": user_blocks}],
    )
    elapsed = time.monotonic() - started

    # Concatenate any text blocks the model returned
    parts: list[str] = []
    for block in response.content:
        if getattr(block, "type", None) == "text":
            parts.append(block.text)
    markdown = "\n\n".join(parts).strip() or "(model returned no summary text)"

    usage = response.usage
    return SummaryResult(
        markdown=markdown,
        model=chosen_model,
        elapsed_seconds=elapsed,
        input_tokens=getattr(usage, "input_tokens", 0),
        output_tokens=getattr(usage, "output_tokens", 0),
    )
