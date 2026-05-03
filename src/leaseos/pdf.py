"""PDF loading: native text per page + rasterised page images for vision.

We send Claude both: (a) the native text layer when present (cheap, exact) and
(b) the page rendered as an image (handles scans, stamps, handwritten side-notes
and lets the model verify what it's reading). The model reconciles them.
"""

from __future__ import annotations

import base64
import io
from dataclasses import dataclass
from pathlib import Path

import fitz  # pymupdf


# Render at 150 DPI — good enough for OCR-quality reads, keeps image tokens
# manageable. Bump to 200 for very faded scans if accuracy suffers.
RENDER_DPI = 150


@dataclass
class Page:
    number: int  # 1-indexed
    text: str  # native text layer (empty string if scanned)
    image_b64: str  # PNG, base64-encoded
    width: float  # PDF points
    height: float


@dataclass
class LoadedPDF:
    path: Path
    pages: list[Page]
    is_scanned: bool  # True if <50 chars of native text per page on average

    @property
    def page_count(self) -> int:
        return len(self.pages)


def load_pdf(path: Path) -> LoadedPDF:
    doc = fitz.open(path)
    pages: list[Page] = []
    total_text = 0
    zoom = RENDER_DPI / 72.0
    matrix = fitz.Matrix(zoom, zoom)

    for i, page in enumerate(doc, start=1):
        text = page.get_text("text") or ""
        total_text += len(text)
        pix = page.get_pixmap(matrix=matrix, alpha=False)
        image_b64 = base64.standard_b64encode(pix.tobytes("png")).decode("ascii")
        pages.append(
            Page(
                number=i,
                text=text,
                image_b64=image_b64,
                width=page.rect.width,
                height=page.rect.height,
            )
        )

    doc.close()
    avg_text = total_text / max(len(pages), 1)
    return LoadedPDF(path=path, pages=pages, is_scanned=avg_text < 50)
