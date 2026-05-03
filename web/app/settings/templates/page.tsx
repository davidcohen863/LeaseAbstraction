"use client";

import { useRef, useState } from "react";
import { Check, Download, FileBadge, Trash2, Upload } from "lucide-react";
import { api, type TemplateInfo } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";

const KIND_DESCRIPTIONS: Record<string, string> = {
  landlord_memo: "1-page summary for the landlord with opening recommendation and settlement range.",
  comparables_schedule: "Tabular ranking of nearby evidence by similarity.",
  itza_analysis: "Quantitative + qualitative £-per-sq-ft commentary.",
  trigger_letter: "Letter to the tenant citing the lease's exact review clause.",
};

export default function TemplatesPage() {
  const { data: templates, loading, refetching, error, refetch } = useApi<TemplateInfo[]>(
    (opts) => api.listTemplates(opts),
  );

  return (
    <div>
      <header className="mb-4">
        <h2 className="text-lg font-semibold">Templates</h2>
        <p className="text-sm text-neutral-500 mt-0.5">
          Upload a Word template per pack-document kind. The generator will preserve
          your letterhead, logo, fonts, and any boilerplate, and append the AI
          content below them. Without an uploaded template the LeaseOS default
          (Calibri 11pt) is used.
        </p>
      </header>

      {error && (
        <div className="mb-3">
          <ErrorState error={error} onRetry={refetch} retrying={refetching} compact />
        </div>
      )}

      {loading ? (
        <div className="text-sm text-neutral-500">Loading…</div>
      ) : templates === null ? null : (
        <div className="space-y-3">
          {templates.map((t) => (
            <TemplateCard key={t.kind} template={t} onChanged={refetch} />
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-neutral-500">
        Tip: download an existing pack's .docx, edit the styles + letterhead,
        save, then upload here. Future pack generations will inherit those
        styles. Max 10 MB per template; .docx only.
      </p>
    </div>
  );
}

function TemplateCard({ template, onChanged }: { template: TemplateInfo; onChanged: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"idle" | "uploading" | "deleting">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function onFile(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.name.toLowerCase().endsWith(".docx")) {
      setErr("Template must be a .docx file");
      return;
    }
    setBusy("uploading");
    setErr(null);
    try {
      await api.uploadTemplate(template.kind, file);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("idle");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onDelete() {
    if (!confirm(`Revert ${template.label} to the LeaseOS default style?`)) return;
    setBusy("deleting");
    setErr(null);
    try {
      await api.deleteTemplate(template.kind);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("idle");
    }
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className={`rounded-md p-2 shrink-0 ${
              template.uploaded ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"
            }`}
          >
            <FileBadge size={16} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium">{template.label}</span>
              {template.uploaded ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                  <Check size={11} /> Custom template active
                </span>
              ) : (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                  Default style
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-neutral-600">{KIND_DESCRIPTIONS[template.kind]}</p>
            {template.uploaded && (
              <p className="mt-1 text-xs text-neutral-500 truncate">
                {template.original_filename ?? "uploaded.docx"}
                {template.size_bytes != null && (
                  <span> · {formatBytes(template.size_bytes)}</span>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <label
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm cursor-pointer ${
              busy !== "idle"
                ? "border-neutral-200 bg-neutral-50 text-neutral-400 cursor-not-allowed"
                : "border-neutral-300 bg-white hover:bg-neutral-50"
            }`}
          >
            <Upload size={13} />
            {busy === "uploading"
              ? "Uploading…"
              : template.uploaded
                ? "Replace"
                : "Upload .docx"}
            <input
              ref={fileRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={busy !== "idle"}
              className="hidden"
              onChange={(e) => onFile(e.target.files)}
            />
          </label>
          {template.uploaded && (
            <div className="flex items-center gap-1">
              <a
                href={api.templateDownloadUrl(template.kind)}
                target="_blank"
                rel="noreferrer"
                title="Download current template"
                className="rounded-md border border-neutral-300 bg-white p-1.5 text-neutral-600 hover:bg-neutral-50"
              >
                <Download size={12} />
              </a>
              <button
                onClick={onDelete}
                disabled={busy !== "idle"}
                title="Revert to LeaseOS default"
                className="rounded-md border border-neutral-300 bg-white p-1.5 text-neutral-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>
      </div>
      {err && (
        <p className="mt-3 rounded bg-red-50 p-2 text-xs text-red-800">{err}</p>
      )}
    </div>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
