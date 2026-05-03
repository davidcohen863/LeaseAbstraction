"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellRing } from "lucide-react";

/**
 * Stub for now — there is no notification backend yet. Renders the bell,
 * an unread-count badge (always 0 for the moment), and an empty popover.
 * When the backend lands, swap the static empty state for a real list.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const unread = 0; // stub

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
      >
        {unread > 0 ? <BellRing size={18} /> : <Bell size={18} />}
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          className="absolute right-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2 text-sm">
            <span className="font-medium">Notifications</span>
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-neutral-500 hover:text-neutral-800"
            >
              Close
            </button>
          </div>
          <div className="px-4 py-10 text-center text-sm text-neutral-500">
            <Bell size={20} className="mx-auto mb-2 text-neutral-300" />
            You&apos;re all caught up.
          </div>
        </div>
      )}
    </div>
  );
}
