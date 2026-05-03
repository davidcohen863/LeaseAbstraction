"use client";

import { useEffect, useState } from "react";
import {
  Check,
  ExternalLink,
  Hash,
  Mail,
  Send,
  Slash,
  Sparkles,
} from "lucide-react";

const SlackIcon = Hash;
import { api } from "@/lib/api";

interface IntegrationStatus {
  slack: { configured: boolean; channel_label?: string | null };
  google: { connected: boolean; account_email?: string | null };
  outlook: { connected: boolean; account_email?: string | null };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export default function IntegrationsPage() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api.integrationsStatus().then(setStatus).catch((e) => setError(String(e)));

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Connect Slack for digest alerts and Google or Outlook to push lease events to your calendar.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}

      <div className="space-y-4">
        <SlackCard status={status} onChanged={load} />
        <OAuthCard
          name="Google Calendar"
          icon={Mail}
          tone="emerald"
          description="Lease events appear in your Google Calendar with a 1-week reminder."
          connected={status?.google.connected ?? false}
          accountEmail={status?.google.account_email ?? null}
          startUrl={`${API_URL}/integrations/google/start`}
        />
        <OAuthCard
          name="Outlook"
          icon={Mail}
          tone="sky"
          description="Lease events sync to Outlook via Microsoft Graph."
          connected={status?.outlook.connected ?? false}
          accountEmail={status?.outlook.account_email ?? null}
          startUrl={`${API_URL}/integrations/microsoft/start`}
        />
      </div>
    </div>
  );
}

// ---- Slack card with in-UI form -----------------------------------------

function SlackCard({
  status,
  onChanged,
}: {
  status: IntegrationStatus | null;
  onChanged: () => Promise<void>;
}) {
  const configured = status?.slack.configured ?? false;
  const [editing, setEditing] = useState(false);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <div className="flex items-center justify-between gap-4 p-5">
        <div className="flex items-start gap-3 min-w-0">
          <div className="rounded-md bg-violet-100 p-2 text-violet-700 shrink-0">
            <SlackIcon size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium">Slack</h3>
              <StatusBadge ok={configured} />
            </div>
            <p className="mt-0.5 text-sm text-neutral-600">
              Daily digest of upcoming lease events + a notification each time a rent-review pack finishes generating.
            </p>
            {configured && status?.slack.channel_label && (
              <p className="mt-1 text-xs text-neutral-500">
                Channel: <span className="font-medium text-neutral-700">{status.slack.channel_label}</span>
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="shrink-0 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          {editing ? "Cancel" : configured ? "Update" : "Connect"}
        </button>
      </div>

      {editing && (
        <div className="border-t border-neutral-100 p-5">
          <SlackForm
            currentChannel={status?.slack.channel_label ?? ""}
            onSaved={async () => {
              setEditing(false);
              await onChanged();
            }}
          />
        </div>
      )}

      {configured && !editing && <SlackQuickActions />}
    </div>
  );
}

function SlackForm({
  currentChannel,
  onSaved,
}: {
  currentChannel: string;
  onSaved: () => Promise<void>;
}) {
  const [webhookUrl, setWebhookUrl] = useState<string>("");
  const [channelLabel, setChannelLabel] = useState<string>(currentChannel ?? "");
  const [digestEnabled, setDigestEnabled] = useState(true);
  const [busy, setBusy] = useState<"idle" | "saving" | "testing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [tested, setTested] = useState<"ok" | "fail" | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!webhookUrl.trim()) {
      setError("Paste a Slack webhook URL.");
      return;
    }
    if (!/^https:\/\/hooks\.slack\.com\//.test(webhookUrl.trim())) {
      setError("That doesn't look like a Slack webhook URL — should start with https://hooks.slack.com/");
      return;
    }
    setError(null);
    setBusy("saving");
    try {
      await api.configureSlack({
        webhook_url: webhookUrl.trim(),
        channel_label: channelLabel.trim() || null,
        digest_enabled: digestEnabled,
      });
      setSavedAt(Date.now());
      await onSaved();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy("idle");
    }
  }

  async function test() {
    setError(null);
    setBusy("testing");
    setTested(null);
    try {
      // Save first if there's a fresh URL not yet saved
      if (webhookUrl.trim() && !savedAt) {
        await api.configureSlack({
          webhook_url: webhookUrl.trim(),
          channel_label: channelLabel.trim() || null,
          digest_enabled: digestEnabled,
        });
        setSavedAt(Date.now());
      }
      const res = await api.testSlack();
      setTested(res.ok ? "ok" : "fail");
    } catch (err) {
      setError(String(err));
      setTested("fail");
    } finally {
      setBusy("idle");
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="rounded-md bg-neutral-50 p-3 text-xs text-neutral-600">
        <strong className="text-neutral-800">How to get a webhook URL</strong>
        <ol className="mt-1 ml-4 list-decimal space-y-0.5">
          <li>
            Open{" "}
            <a
              href="https://api.slack.com/apps?new_app=1"
              target="_blank"
              rel="noreferrer"
              className="text-blue-700 hover:underline inline-flex items-center gap-0.5"
            >
              Slack &rarr; Create app <ExternalLink size={10} />
            </a>{" "}
            (pick "From scratch", choose your workspace).
          </li>
          <li>In the app settings, enable <strong>Incoming Webhooks</strong>.</li>
          <li>Click <strong>Add New Webhook to Workspace</strong> and pick the channel you want notifications in.</li>
          <li>Copy the webhook URL Slack gives you and paste it below.</li>
        </ol>
      </div>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Webhook URL <span className="text-red-600">*</span>
        </span>
        <input
          type="url"
          required
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXX"
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-mono focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Channel label (just a memory aid)
        </span>
        <input
          type="text"
          value={channelLabel}
          onChange={(e) => setChannelLabel(e.target.value)}
          placeholder="#leases"
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={digestEnabled}
          onChange={(e) => setDigestEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-neutral-300"
        />
        <span>Include this channel in the daily digest of upcoming events</span>
      </label>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}
      {tested === "ok" && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <Check size={14} /> Test message sent — check the channel.
        </div>
      )}
      {tested === "fail" && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <Slash size={14} /> Test failed — verify the webhook URL is correct and the channel still exists.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={test}
          disabled={busy !== "idle" || !webhookUrl.trim()}
          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
        >
          <Send size={13} />
          {busy === "testing" ? "Sending…" : "Send test message"}
        </button>
        <button
          type="submit"
          disabled={busy !== "idle"}
          className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {busy === "saving" ? "Saving…" : savedAt ? "Saved ✓" : "Save"}
        </button>
      </div>
    </form>
  );
}

function SlackQuickActions() {
  const [busy, setBusy] = useState<"idle" | "test" | "digest">("idle");
  const [feedback, setFeedback] = useState<string | null>(null);

  async function sendTest() {
    setBusy("test"); setFeedback(null);
    try {
      const r = await api.testSlack();
      setFeedback(r.ok ? "✓ Test message sent." : "Test webhook returned non-OK.");
    } catch (e) { setFeedback(String(e)); }
    finally { setBusy("idle"); }
  }
  async function runDigest() {
    setBusy("digest"); setFeedback(null);
    try {
      const r = await api.runSlackDigest();
      setFeedback(`✓ Digest sent to ${r.sent} channel${r.sent === 1 ? "" : "s"}.`);
    } catch (e) { setFeedback(String(e)); }
    finally { setBusy("idle"); }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 px-5 py-3 bg-neutral-50">
      <div className="text-xs text-neutral-500">{feedback}</div>
      <div className="flex gap-2">
        <button
          onClick={sendTest}
          disabled={busy !== "idle"}
          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50"
        >
          <Send size={11} />
          {busy === "test" ? "Sending…" : "Send test"}
        </button>
        <button
          onClick={runDigest}
          disabled={busy !== "idle"}
          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50"
        >
          <Sparkles size={11} />
          {busy === "digest" ? "Sending…" : "Run digest now"}
        </button>
      </div>
    </div>
  );
}

// ---- OAuth cards (Google / Outlook) -------------------------------------

function OAuthCard({
  name,
  icon: Icon,
  tone,
  description,
  connected,
  accountEmail,
  startUrl,
}: {
  name: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: "emerald" | "sky";
  description: string;
  connected: boolean;
  accountEmail: string | null;
  startUrl: string;
}) {
  const toneCls = tone === "emerald" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700";
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5 flex items-center justify-between gap-6">
      <div className="flex items-start gap-3 min-w-0">
        <div className={`rounded-md p-2 shrink-0 ${toneCls}`}>
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{name}</h3>
            <StatusBadge ok={connected} />
          </div>
          <p className="mt-0.5 text-sm text-neutral-600">{description}</p>
          {connected && accountEmail && (
            <p className="mt-1 text-xs text-neutral-500">
              Account: <span className="font-medium text-neutral-700">{accountEmail}</span>
            </p>
          )}
        </div>
      </div>
      <a
        href={startUrl}
        className="shrink-0 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
      >
        {connected ? "Reconnect" : `Connect ${name.split(" ")[0]}`}
      </a>
    </div>
  );
}

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        ok ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-600"
      }`}
    >
      {ok ? "Connected" : "Not connected"}
    </span>
  );
}
