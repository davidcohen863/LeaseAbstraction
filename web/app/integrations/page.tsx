"use client";

import { useEffect, useState } from "react";

interface IntegrationStatus {
  slack: { configured: boolean; channel_label?: string | null };
  google: { connected: boolean; account_email?: string | null };
  outlook: { connected: boolean; account_email?: string | null };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export default function IntegrationsPage() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/integrations/status`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then(setStatus)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Connect Slack for digest alerts and Google or Outlook to push lease events to your calendar.
        </p>
      </div>
      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
      <div className="grid gap-4">
        <IntegrationCard
          title="Slack"
          description="Daily digest of upcoming lease events to your chosen channel."
          status={status?.slack.configured ? "Connected" : "Not connected"}
          detail={status?.slack.channel_label}
          actionLabel={status?.slack.configured ? "Manage" : "Add Slack webhook"}
          actionHref={`${API_URL}/integrations/slack`}
        />
        <IntegrationCard
          title="Google Calendar"
          description="Lease events appear in your Google Calendar with reminders."
          status={status?.google.connected ? "Connected" : "Not connected"}
          detail={status?.google.account_email}
          actionLabel={status?.google.connected ? "Reconnect" : "Connect Google"}
          actionHref={`${API_URL}/integrations/google/start`}
        />
        <IntegrationCard
          title="Outlook"
          description="Lease events sync to Outlook via Microsoft Graph."
          status={status?.outlook.connected ? "Connected" : "Not connected"}
          detail={status?.outlook.account_email}
          actionLabel={status?.outlook.connected ? "Reconnect" : "Connect Outlook"}
          actionHref={`${API_URL}/integrations/microsoft/start`}
        />
      </div>
    </div>
  );
}

function IntegrationCard({
  title,
  description,
  status,
  detail,
  actionLabel,
  actionHref,
}: {
  title: string;
  description: string;
  status: string;
  detail?: string | null;
  actionLabel: string;
  actionHref: string;
}) {
  const connected = status === "Connected";
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5 flex items-center justify-between gap-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{title}</span>
          <span
            className={`text-xs rounded-full px-2 py-0.5 ${
              connected ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-600"
            }`}
          >
            {status}
          </span>
        </div>
        <p className="mt-1 text-sm text-neutral-600">{description}</p>
        {detail && <p className="mt-1 text-xs text-neutral-500">{detail}</p>}
      </div>
      <a
        href={actionHref}
        className="shrink-0 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
      >
        {actionLabel}
      </a>
    </div>
  );
}
