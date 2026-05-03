import Link from "next/link";
import type { ComponentType } from "react";

interface Action {
  label: string;
  href?: string;
  onClick?: () => void;
  /** Visual emphasis. "primary" = solid button, "secondary" = outline. */
  variant?: "primary" | "secondary";
}

interface Props {
  /** Lucide icon component (or any 16-px size-prop component). */
  icon?: ComponentType<{ size?: number; className?: string }>;
  /** One short noun-phrase. */
  title: string;
  /** 1–2 sentences. Tell the user what to do, not just what's missing. */
  description?: string;
  /** Up to two actions; render order matters (first = primary). */
  actions?: Action[];
  /** Tighter padding for in-card / in-column placements. */
  compact?: boolean;
  /** Optional "next-step hint" footnote. */
  hint?: string;
}

/**
 * Polished empty state. Used everywhere we'd otherwise just show
 * "No <noun> yet." Always says what's missing AND what to do next.
 *
 * Replaces the per-page bespoke empty cards that drifted in style.
 */
export function EmptyState({ icon: Icon, title, description, actions, compact, hint }: Props) {
  const padCls = compact ? "p-6" : "p-10";
  return (
    <div
      className={`rounded-lg border border-dashed border-neutral-300 bg-white text-center ${padCls}`}
    >
      {Icon && (
        <div className="mx-auto h-10 w-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500">
          <Icon size={18} />
        </div>
      )}
      <p className={`${Icon ? "mt-3" : ""} text-sm font-semibold text-neutral-800`}>{title}</p>
      {description && (
        <p className="mt-1 text-sm text-neutral-500 max-w-md mx-auto">{description}</p>
      )}
      {actions && actions.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {actions.map((a) => {
            const cls =
              a.variant === "secondary"
                ? "rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
                : "rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700";
            if (a.href) {
              return (
                <Link key={a.label} href={a.href} className={cls}>
                  {a.label}
                </Link>
              );
            }
            return (
              <button key={a.label} onClick={a.onClick} className={cls}>
                {a.label}
              </button>
            );
          })}
        </div>
      )}
      {hint && <p className="mt-3 text-[11px] text-neutral-400">{hint}</p>}
    </div>
  );
}
