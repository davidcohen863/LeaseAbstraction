"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { CommandPalette } from "@/components/ui/command-palette";
import { NotificationBell } from "@/components/nav/notification-bell";
import { clerkEnabled } from "@/lib/clerk";

export function Topbar() {
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Cmd/Ctrl + K opens the palette
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-neutral-200 bg-white/80 backdrop-blur px-4">
        {/* Search trigger — also available via cmd+K */}
        <button
          onClick={() => setPaletteOpen(true)}
          className="group flex w-full max-w-xl items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-500 hover:bg-white hover:border-neutral-300"
        >
          <Search size={16} className="text-neutral-400" />
          <span className="flex-1 text-left">Search leases, comparables, packs…</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[11px] font-mono text-neutral-500">
            <span>⌘</span>
            <span>K</span>
          </kbd>
        </button>

        <div className="flex items-center gap-1">
          <NotificationBell />
          {clerkEnabled ? (
            <>
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <button className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:text-neutral-900">
                    Sign in
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700">
                    Sign up
                  </button>
                </SignUpButton>
              </Show>
              <Show when="signed-in">
                <UserButton />
              </Show>
            </>
          ) : (
            <span className="ml-2 hidden text-xs text-neutral-400 md:inline">dev mode · auth disabled</span>
          )}
        </div>
      </header>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}

