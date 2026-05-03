"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  FileText,
  CalendarDays,
  BarChart3,
  Package,
  Settings,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  Building2,
  KanbanSquare,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** routes the user might be on that should still highlight this item */
  matchPrefix?: string;
}

const PRIMARY_NAV: NavItem[] = [
  { href: "/today",        label: "Today",        icon: Home },
  { href: "/properties",   label: "Properties",   icon: Building2, matchPrefix: "/properties" },
  { href: "/leases",       label: "Leases",       icon: FileText, matchPrefix: "/leases" },
  { href: "/calendar",     label: "Calendar",     icon: CalendarDays },
  { href: "/reviews",      label: "Reviews",      icon: KanbanSquare },
  { href: "/comparables",  label: "Comparables",  icon: BarChart3 },
  { href: "/packs",        label: "Review packs", icon: Package, matchPrefix: "/packs" },
];

const SECONDARY_NAV: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings, matchPrefix: "/settings" },
];

const STORAGE_KEY = "leaseos.sidebar.collapsed";

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Read persisted collapse state on mount
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v === "1") setCollapsed(true);
    } catch {}
    setHydrated(true);
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  // Avoid SSR/CSR mismatch on the collapse class — render expanded until hydrated.
  const isCollapsed = hydrated && collapsed;
  const widthCls = isCollapsed ? "w-[60px]" : "w-[224px]";

  return (
    <aside
      aria-label="Primary"
      className={`${widthCls} shrink-0 border-r border-neutral-200 bg-white flex flex-col h-screen sticky top-0 transition-[width] duration-150`}
    >
      <div className={`flex items-center ${isCollapsed ? "justify-center" : "justify-between"} h-14 px-3 border-b border-neutral-200`}>
        {!isCollapsed && (
          <Link href="/today" className="flex items-center gap-2 font-semibold text-neutral-900">
            <Briefcase size={18} className="text-neutral-700" />
            <span>LeaseOS</span>
          </Link>
        )}
        {isCollapsed && (
          <Link href="/today" aria-label="LeaseOS home" className="text-neutral-700">
            <Briefcase size={20} />
          </Link>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        <NavGroup items={PRIMARY_NAV} pathname={pathname} collapsed={isCollapsed} />
        <div className="my-3 border-t border-neutral-100" />
        <NavGroup items={SECONDARY_NAV} pathname={pathname} collapsed={isCollapsed} />
      </nav>

      <button
        onClick={toggle}
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="m-2 flex items-center justify-center rounded-md p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
  );
}

function NavGroup({
  items,
  pathname,
  collapsed,
}: {
  items: NavItem[];
  pathname: string | null;
  collapsed: boolean;
}) {
  return (
    <ul className="space-y-0.5 px-2">
      {items.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href ||
          (item.matchPrefix ? pathname?.startsWith(item.matchPrefix) : false);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors ${
                active
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <Icon size={18} className={active ? "text-white" : "text-neutral-500 group-hover:text-neutral-800"} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
