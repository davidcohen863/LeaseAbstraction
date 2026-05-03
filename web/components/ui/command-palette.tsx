"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  CalendarDays,
  FileText,
  Home,
  Package,
  BarChart3,
  Plug,
  Upload,
  Building2,
} from "lucide-react";
import { api, type LeaseSummary, type Comparable, type PackSummary, type PropertySummary } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface IndexState {
  leases: LeaseSummary[];
  comparables: Comparable[];
  packs: PackSummary[];
  properties: PropertySummary[];
  loading: boolean;
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<IndexState>({
    leases: [],
    comparables: [],
    packs: [],
    properties: [],
    loading: false,
  });

  // Lazy-load the index the first time the palette opens
  useEffect(() => {
    if (!open || index.leases.length || index.properties.length || index.loading) return;
    setIndex((s) => ({ ...s, loading: true }));
    Promise.all([
      api.listLeases().catch(() => []),
      api.listComparables().catch(() => []),
      api.listPacks().catch(() => []),
      api.listProperties().catch(() => []),
    ]).then(([leases, comparables, packs, properties]) => {
      setIndex({ leases, comparables, packs, properties, loading: false });
    });
  }, [open, index.leases.length, index.properties.length, index.loading]);

  // Reset query when closed
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[15vh] px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <Command
        label="Global search"
        loop
        className="w-full max-w-xl overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl"
      >
        <div className="border-b border-neutral-200">
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Search leases, comparables, packs… or jump to a page"
            className="w-full bg-transparent px-4 py-3.5 text-sm placeholder:text-neutral-400 focus:outline-none"
            autoFocus
          />
        </div>
        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-8 text-center text-sm text-neutral-500">
            {index.loading ? "Loading…" : "Nothing matches that. Try a different keyword."}
          </Command.Empty>

          {/* Quick actions */}
          <Command.Group heading="Jump to" className="text-xs text-neutral-400 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
            <NavItem icon={Home} label="Today" onSelect={() => go("/today")} />
            <NavItem icon={Building2} label="Properties" onSelect={() => go("/properties")} />
            <NavItem icon={FileText} label="Leases" onSelect={() => go("/leases")} />
            <NavItem icon={CalendarDays} label="Calendar" onSelect={() => go("/calendar")} />
            <NavItem icon={BarChart3} label="Comparables" onSelect={() => go("/comparables")} />
            <NavItem icon={Package} label="Review packs" onSelect={() => go("/packs")} />
            <NavItem icon={Plug} label="Integrations" onSelect={() => go("/integrations")} />
            <NavItem icon={Upload} label="Upload new lease" onSelect={() => go("/leases")} />
          </Command.Group>

          {/* Properties */}
          {index.properties.length > 0 && (
            <Command.Group heading={`Properties (${index.properties.length})`} className="mt-2 text-xs text-neutral-400 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
              {index.properties.slice(0, 10).map((p) => (
                <Command.Item
                  key={p.id}
                  value={`property ${p.address} ${p.landlord_client ?? ""}`}
                  onSelect={() => go(`/properties/${p.id}`)}
                  className="flex items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-neutral-100 cursor-pointer"
                >
                  <Building2 size={16} className="text-neutral-400" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-neutral-900">{p.address}</div>
                    <div className="text-xs text-neutral-400">
                      {p.lease_count} lease{p.lease_count === 1 ? "" : "s"}
                      {p.landlord_client ? ` · ${p.landlord_client}` : ""}
                    </div>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* Leases */}
          {index.leases.length > 0 && (
            <Command.Group heading={`Leases (${index.leases.length})`} className="mt-2 text-xs text-neutral-400 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
              {index.leases.slice(0, 12).map((l) => (
                <Command.Item
                  key={l.id}
                  value={`lease ${l.label} ${l.status}`}
                  onSelect={() => go(`/leases/${l.id}`)}
                  className="flex items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-neutral-100 cursor-pointer"
                >
                  <FileText size={16} className="text-neutral-400" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-neutral-900">{l.label}</div>
                    <div className="text-xs text-neutral-400">{l.status.replace(/_/g, " ")}</div>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* Comparables */}
          {index.comparables.length > 0 && (
            <Command.Group heading={`Comparables (${index.comparables.length})`} className="mt-2 text-xs text-neutral-400 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
              {index.comparables.slice(0, 8).map((c) => (
                <Command.Item
                  key={c.id}
                  value={`comparable ${c.address}`}
                  onSelect={() => go("/comparables")}
                  className="flex items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-neutral-100 cursor-pointer"
                >
                  <BarChart3 size={16} className="text-neutral-400" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-neutral-900">{c.address}</div>
                    <div className="text-xs text-neutral-400">£{c.rent_pa_gbp.toLocaleString()}/yr · {c.use_class ?? "—"}</div>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* Packs */}
          {index.packs.length > 0 && (
            <Command.Group heading={`Review packs (${index.packs.length})`} className="mt-2 text-xs text-neutral-400 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
              {index.packs.slice(0, 6).map((p) => (
                <Command.Item
                  key={p.id}
                  value={`pack ${p.lease_label ?? ""} ${p.status}`}
                  onSelect={() => go(`/packs/${p.id}`)}
                  className="flex items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-neutral-100 cursor-pointer"
                >
                  <Package size={16} className="text-neutral-400" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-neutral-900">{p.lease_label ?? p.lease_id}</div>
                    <div className="text-xs text-neutral-400">{p.status} · {p.recommended_opening_gbp ? `£${p.recommended_opening_gbp.toLocaleString()} opening` : ""}</div>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>

        <div className="border-t border-neutral-100 px-3 py-2 text-[11px] text-neutral-400 flex items-center justify-between">
          <span>↵ to open · esc to close</span>
          <span className="font-mono">⌘K</span>
        </div>
      </Command>
    </div>
  );
}

function NavItem({
  icon: Icon,
  label,
  onSelect,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={label}
      onSelect={onSelect}
      className="flex items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-neutral-100 cursor-pointer"
    >
      <Icon size={16} className="text-neutral-400" />
      <span className="text-neutral-900">{label}</span>
    </Command.Item>
  );
}
