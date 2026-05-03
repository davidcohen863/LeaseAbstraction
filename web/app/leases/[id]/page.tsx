"use client";

import { use, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { api, type LeaseDetail } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { ErrorState } from "@/components/ui/error-state";
import { RowActions } from "@/components/ui/row-actions";
import FieldsPanel from "./FieldsPanel";
import { RightRail } from "./RightRail";

// react-pdf must be client-only — disable SSR via dynamic import.
const PdfViewer = dynamic(() => import("./PdfViewer"), { ssr: false });

export default function LeaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const leaseQ = useApi<LeaseDetail>((opts) => api.getLease(id, opts), [id]);
  const lease = leaseQ.data;
  const error = leaseQ.error;
  const load = leaseQ.refetch;
  const [scrollPage, setScrollPage] = useState<number | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  function startRename() {
    if (!lease) return;
    setRenameDraft(lease.label);
    setRenaming(true);
  }
  async function commitRename() {
    if (!lease) return;
    const trimmed = renameDraft.trim();
    if (!trimmed || trimmed === lease.label) {
      setRenaming(false);
      return;
    }
    try {
      await api.patchLease(lease.id, { label: trimmed });
      toast.success("Lease renamed");
      load();
    } catch (e) {
      toast.error("Couldn't rename", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setRenaming(false);
    }
  }
  async function deleteLease() {
    if (!lease) return;
    const ok = await confirm({
      title: "Delete this lease?",
      description: (
        <>
          <p className="mb-2">
            <span className="font-medium">{lease.label}</span>
          </p>
          <p>
            Removes the lease, every calendar event derived from it, every
            review pack, every reviewer edit, and the original PDF on disk.
            Comparables fed back from settled reviews on this lease are kept.
            The Property record is kept too.
          </p>
          <p className="mt-2 font-medium">Cannot be undone.</p>
        </>
      ),
      confirmLabel: "Delete lease",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.deleteLease(lease.id);
      toast.success("Lease deleted");
      router.push("/leases");
    } catch (e) {
      toast.error("Couldn't delete", { description: e instanceof Error ? e.message : String(e) });
    }
  }

  // Poll while extraction is in progress
  useEffect(() => {
    if (!lease || (lease.status !== "uploaded" && lease.status !== "extracting")) return;
    const interval = setInterval(() => leaseQ.refetch(), 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lease?.status]);

  if (error && !lease) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <ErrorState error={error} onRetry={load} retrying={leaseQ.refetching} />
      </div>
    );
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
          {renaming ? (
            <input
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenaming(false);
              }}
              className="mt-1 w-full rounded border border-neutral-400 bg-white px-2 py-1 text-lg font-semibold focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-500"
              maxLength={255}
            />
          ) : (
            <h1
              className="group mt-1 inline-flex items-center gap-1.5 truncate text-lg font-semibold"
              title={lease.label}
            >
              <span className="truncate">{lease.label}</span>
              <button
                onClick={startRename}
                aria-label="Rename lease"
                className="rounded p-1 text-neutral-400 opacity-0 transition-opacity hover:bg-neutral-100 hover:text-neutral-700 group-hover:opacity-100"
              >
                <Pencil size={13} />
              </button>
            </h1>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {lease.extraction_model && (
            <div className="group relative">
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
          <RowActions
            label="Lease actions"
            actions={[
              { label: "Rename", icon: Pencil, onClick: startRename },
              { label: "Delete lease", icon: Trash2, onClick: deleteLease, destructive: true },
            ]}
          />
        </div>
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
                load();
              }}
              onChanged={async () => { load(); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
