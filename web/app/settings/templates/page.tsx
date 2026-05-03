import { FileBadge, Upload } from "lucide-react";

// Placeholder until per-firm Word .docx upload lands.
// Renderer in pack_generator.render_docx() applies a sensible default style today.
export default function TemplatesPage() {
  return (
    <div>
      <header className="mb-4">
        <h2 className="text-lg font-semibold">Templates</h2>
        <p className="text-sm text-neutral-500 mt-0.5">
          House-style for the four documents in every rent-review pack.
        </p>
      </header>

      <div className="space-y-3">
        {[
          { name: "Landlord cover memo", body: "1-page summary with opening recommendation and settlement range." },
          { name: "Comparables schedule", body: "Tabular ranking of nearby evidence by similarity." },
          { name: "ITZA / £-per-sq-ft analysis", body: "Quantitative + qualitative commentary." },
          { name: "Trigger letter", body: "Addressed to tenant, citing the lease's exact review clause." },
        ].map((tpl) => (
          <div key={tpl.name} className="rounded-lg border border-neutral-200 bg-white p-4 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="rounded-md bg-amber-100 p-2 text-amber-700 shrink-0">
                <FileBadge size={16} />
              </div>
              <div>
                <div className="font-medium">{tpl.name}</div>
                <p className="text-sm text-neutral-600 mt-0.5">{tpl.body}</p>
                <p className="text-xs text-neutral-500 mt-1">Default LeaseOS template active.</p>
              </div>
            </div>
            <button
              disabled
              title="Custom Word template upload — coming in a follow-up"
              className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-400 cursor-not-allowed"
            >
              <Upload size={13} /> Upload
            </button>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-neutral-500">
        Want your firm logo and signature block on these? Per-firm template
        upload is on the next milestone — flag it in your pilot feedback.
      </p>
    </div>
  );
}
