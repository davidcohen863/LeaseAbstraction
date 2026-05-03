"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import type { ComponentType } from "react";

export interface RowAction {
  label: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  onClick: () => void | Promise<void>;
  /** Renders the row in red — use for delete-style actions. */
  destructive?: boolean;
  /** Disabled rows still render but can't be clicked; used for "Mark as sent
   * (already sent)" etc. */
  disabled?: boolean;
}

/**
 * Three-dot row-action menu. Shared so every list table looks the same and
 * the keyboard / focus / dismiss behaviour is consistent.
 *
 *   <RowActions actions={[
 *     { label: "Rename",  icon: Pencil, onClick: openRename },
 *     { label: "Delete",  icon: Trash2, onClick: askDelete, destructive: true },
 *   ]} />
 */
export function RowActions({ actions, label = "Row actions" }: { actions: RowAction[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label={label}
        aria-expanded={open}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-300"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-md border border-neutral-200 bg-white py-1 text-sm shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {actions.map((a, i) => {
            const Icon = a.icon;
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={a.disabled}
                onClick={async () => {
                  setOpen(false);
                  await a.onClick();
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                  a.destructive
                    ? "text-red-700 hover:bg-red-50"
                    : "text-neutral-800 hover:bg-neutral-100"
                } ${a.disabled ? "opacity-40 cursor-not-allowed hover:bg-transparent" : ""}`}
              >
                {Icon && <Icon size={14} className={a.destructive ? "text-red-600" : "text-neutral-500"} />}
                <span>{a.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
