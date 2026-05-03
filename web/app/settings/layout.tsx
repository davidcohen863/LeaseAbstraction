"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, FileBadge, Plug, ScrollText, Users, UserCircle2 } from "lucide-react";

interface Tab {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  description: string;
}

const TABS: Tab[] = [
  { href: "/settings/profile",      label: "Profile",      icon: UserCircle2, description: "Your account" },
  { href: "/settings/firm",         label: "Firm",         icon: Building2,   description: "Name, address, defaults" },
  { href: "/settings/integrations", label: "Integrations", icon: Plug,        description: "Slack, Google, Outlook" },
  { href: "/settings/templates",    label: "Templates",    icon: FileBadge,   description: "House-style for packs" },
  { href: "/settings/members",      label: "Members",      icon: Users,       description: "Invite teammates" },
  { href: "/settings/audit",        label: "Audit log",    icon: ScrollText,  description: "Every change in the workspace" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Workspace configuration. Changes apply firm-wide.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8">
        <aside aria-label="Settings sections">
          <nav className="space-y-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = pathname === tab.href || (tab.href !== "/settings" && pathname?.startsWith(tab.href));
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`group flex items-start gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
                  }`}
                >
                  <Icon
                    size={16}
                    className={`mt-0.5 ${active ? "text-white" : "text-neutral-500 group-hover:text-neutral-800"}`}
                  />
                  <div className="min-w-0">
                    <div className="font-medium leading-tight">{tab.label}</div>
                    <div
                      className={`text-[11px] leading-tight mt-0.5 ${
                        active ? "text-neutral-300" : "text-neutral-500"
                      }`}
                    >
                      {tab.description}
                    </div>
                  </div>
                </Link>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0">{children}</section>
      </div>
    </div>
  );
}
