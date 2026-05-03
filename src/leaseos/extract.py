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
from .prompts import SYSTEM_PROMPT, USER_PRIMER
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


def extract(pdf: LoadedPDF, *, model: str | None = None, max_tokens: int = 8000) -> ExtractionResult:
    """Run a single-pass extraction. Returns a validated LeaseRecord."""
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
                "text": SYSTEM_PROMPT,
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
