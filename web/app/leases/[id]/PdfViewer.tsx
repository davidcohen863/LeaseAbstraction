"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// pdf.js worker — self-hosted from /public so we don't depend on a CDN
// matching the exact pdfjs-dist version we installed.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface Props {
  url: string;
  /** 1-indexed page to scroll to when this changes */
  scrollToPage?: number | null;
}

export default function PdfViewer({ url, scrollToPage }: Props) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [width, setWidth] = useState<number>(800);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => setWidth(Math.max(320, el.clientWidth - 24));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!scrollToPage) return;
    const el = pageRefs.current.get(scrollToPage);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [scrollToPage]);

  return (
    <div ref={containerRef} className="h-full overflow-auto bg-neutral-100">
      <Document
        file={url}
        onLoadSuccess={({ numPages: n }) => setNumPages(n)}
        loading={<div className="p-8 text-sm text-neutral-500">Loading PDF…</div>}
        error={<div className="p-8 text-sm text-red-700">Failed to load PDF.</div>}
      >
        {Array.from({ length: numPages ?? 0 }, (_, i) => i + 1).map((pageNum) => (
          <div
            key={pageNum}
            ref={(el) => {
              if (el) pageRefs.current.set(pageNum, el);
            }}
            className="mx-auto my-3 inline-block"
            data-page={pageNum}
          >
            <div className="text-xs text-neutral-500 px-3 pt-2">Page {pageNum}</div>
            <Page pageNumber={pageNum} width={width} renderAnnotationLayer={false} />
          </div>
        ))}
      </Document>
    </div>
  );
}
