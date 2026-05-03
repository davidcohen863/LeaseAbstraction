"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { ChevronDown, ChevronUp, Maximize2, Minus, Plus } from "lucide-react";

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
  const [containerWidth, setContainerWidth] = useState<number>(800);
  const [scale, setScale] = useState<number>(1);
  /** "Fit to width" — when true, page width tracks container width. */
  const [fitWidth, setFitWidth] = useState(true);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Track container size for fit-to-width
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => setContainerWidth(Math.max(320, el.clientWidth - 24));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Scroll to requested page when it changes
  useEffect(() => {
    if (!scrollToPage) return;
    const el = pageRefs.current.get(scrollToPage);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setCurrentPage(scrollToPage);
    }
  }, [scrollToPage]);

  // Track current page based on scroll position (intersection observer)
  useEffect(() => {
    if (!containerRef.current || !numPages) return;
    const root = containerRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the entry with greatest intersectionRatio
        let best: { page: number; ratio: number } | null = null;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const page = Number((e.target as HTMLElement).dataset.page);
          if (!best || e.intersectionRatio > best.ratio) {
            best = { page, ratio: e.intersectionRatio };
          }
        }
        if (best) setCurrentPage(best.page);
      },
      { root, threshold: [0.25, 0.5, 0.75] }
    );
    pageRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [numPages]);

  // Effective width passed to <Page>
  const pageWidth = fitWidth ? containerWidth : Math.round(800 * scale);

  function jumpToPage(p: number) {
    const clamped = Math.max(1, Math.min(p, numPages ?? p));
    const el = pageRefs.current.get(clamped);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setCurrentPage(clamped);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-white px-3 py-1.5 text-sm">
        <div className="flex items-center gap-1">
          <button
            onClick={() => jumpToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label="Previous page"
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-40"
          >
            <ChevronUp size={14} />
          </button>
          <PageJump current={currentPage} total={numPages ?? 1} onJump={jumpToPage} />
          <button
            onClick={() => jumpToPage(currentPage + 1)}
            disabled={currentPage >= (numPages ?? 1)}
            aria-label="Next page"
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-40"
          >
            <ChevronDown size={14} />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setFitWidth(false);
              setScale((s) => Math.max(0.5, s - 0.1));
            }}
            aria-label="Zoom out"
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
          >
            <Minus size={14} />
          </button>
          <span className="min-w-[3rem] text-center text-xs tabular-nums text-neutral-500">
            {fitWidth ? "fit" : `${Math.round(scale * 100)}%`}
          </span>
          <button
            onClick={() => {
              setFitWidth(false);
              setScale((s) => Math.min(2.5, s + 0.1));
            }}
            aria-label="Zoom in"
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => {
              setFitWidth(true);
              setScale(1);
            }}
            aria-label="Fit to width"
            className={`rounded p-1 ${
              fitWidth ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
            }`}
            title="Fit to width"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      {/* PDF content */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-neutral-100">
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
              <Page pageNumber={pageNum} width={pageWidth} renderAnnotationLayer={false} />
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}

function PageJump({ current, total, onJump }: { current: number; total: number; onJump: (p: number) => void }) {
  const [draft, setDraft] = useState<string>(String(current));

  // Sync external changes (scroll-driven)
  useEffect(() => {
    setDraft(String(current));
  }, [current]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const n = parseInt(draft, 10);
        if (Number.isFinite(n)) onJump(n);
      }}
      className="flex items-center gap-1"
    >
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = parseInt(draft, 10);
          if (Number.isFinite(n)) onJump(n);
        }}
        aria-label="Jump to page"
        className="w-12 rounded border border-neutral-300 px-1.5 py-0.5 text-center text-xs tabular-nums focus:border-neutral-500 focus:outline-none"
      />
      <span className="text-xs text-neutral-500 tabular-nums">/ {total}</span>
    </form>
  );
}
