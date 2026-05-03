"use client";

import { use, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { api, type LeaseDetail } from "@/lib/api";
import FieldsPanel from "./FieldsPanel";
import { RightRail } from "./RightRail";

// react-pdf must be client-only — disable SSR via dynamic import.
const PdfViewer = dynamic(() => import("./PdfViewer"), { ssr: false });

export default function LeaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [lease, setLease] = useState<LeaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scrollPage, setScrollPage] = useState<number | null>(null);

  const load = () =>
    api
      .getLease(id)
      .then(setLease)
      .catch((e) => setError(String(e)));

  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      setLease((prev) => {
        if (prev && (prev.status === "uploaded" || prev.status === "extracting")) {
          void load();
        }
        return prev;
      });
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) {
    return <div className="p-8 text-sm text-red-700">{error}</div>;
  }
  if (!lease) {
    return <div className="p-8 text-sm text-neutral-500">Loading…</div>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
        <div className="min-w-0">
          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-neutral-500">
            <Link href="/today" className="hover:text-neutral-800">Home</Link>
            <span aria-hidden>›</span>
            {lease.property_id ? (
              <>
                <Link href="/properties" className="hover:text-neutral-800">Properties</Link>
                <span aria-hidden>›</span>
                <Link
                  href={`/properties/${lease.property_id}`}
                  className="hover:text-neutral-800 truncate max-w-[28ch]"
                  title={lease.property_address ?? lease.label}
                >
                  {lease.property_address ?? lease.label}
                </Link>
                <span aria-hidden>›</span>
                <span className="text-neutral-800 truncate max-w-[20ch]">Lease</span>
              </>
            ) : (
              <>
                <Link href="/leases" className="hover:text-neutral-800">Leases</Link>
                <span aria-hidden>›</span>
                <span className="text-neutral-800 truncate max-w-[40ch]" title={lease.label}>
                  {lease.label}
                </span>
              </>
            )}
          </nav>
          <h1 className="text-lg font-semibold mt-1 truncate" title={lease.label}>{lease.label}</h1>
        </div>
        {lease.extraction_model && (
          <div className="shrink-0 group relative">
            <span
              className="cursor-help text-xs text-neutral-400 hover:text-neutral-600"
              aria-describedby="extraction-meta"
              title={`Extracted by ${lease.extraction_model} in ${lease.extraction_seconds?.toFixed(1)}s`}
            >
              ⓘ
            </span>
            <span
              id="extraction-meta"
              role="tooltip"
              className="pointer-events-none absolute right-0 top-full mt-1 hidden whitespace-nowrap rounded bg-neutral-900 px-2 py-1 text-xs text-white shadow group-hover:block"
            >
              {lease.extraction_model} · {lease.extraction_seconds?.toFixed(1)}s
            </span>
          </div>
        )}
      </div>

      {lease.status === "extracting" || lease.status === "uploaded" ? (
        <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
          Extracting lease…
        </div>
      ) : lease.status === "failed" ? (
        <div className="m-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800 whitespace-pre-wrap">
          <div className="font-medium mb-1">Extraction failed</div>
          {lease.extraction_error}
        </div>
      ) : !lease.record_json ? (
        <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
          No record available.
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_1fr_280px] overflow-hidden">
          <div className="border-r border-neutral-200 overflow-hidden">
            <PdfViewer url={api.documentUrl(id)} scrollToPage={scrollPage} />
          </div>
          <div className="overflow-hidden border-r border-neutral-200">
            <FieldsPanel
              leaseId={id}
              record={lease.record_json}
              onJumpToPage={(p) => setScrollPage(p)}
            />
          </div>
          <div className="overflow-hidden">
            <RightRail
              lease={lease}
              onApprove={async () => {
                await api.approve(id);
                await load();
              }}
              onChanged={load}
            />
          </div>
        </div>
      )}
    </div>
  );
}
