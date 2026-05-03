"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

/**
 * Tiny toast system — replaces silent actions and alert()/error-banner-only
 * patterns scattered across the app. Every mutation should fire a toast on
 * success / failure so the user has feedback that something happened.
 *
 * Usage:
 *   const toast = useToast();
 *   toast.success("Lease deleted");
 *   toast.error("Couldn't save", { description: err.message });
 *
 * Mounted once at the root via <Toaster /> in app/layout.tsx.
 */

type ToastTone = "success" | "error" | "info";

interface ToastInput {
  /** One short noun-verb phrase. */
  title: string;
  /** Optional second line. */
  description?: string;
  /** Auto-dismiss after this many ms. Default 4000; pass 0 to make sticky. */
  durationMs?: number;
}

interface Toast extends ToastInput {
  id: number;
  tone: ToastTone;
}

interface ToastApi {
  success: (title: string, opts?: Omit<ToastInput, "title">) => void;
  error: (title: string, opts?: Omit<ToastInput, "title">) => void;
  info: (title: string, opts?: Omit<ToastInput, "title">) => void;
  /** Imperatively dismiss a toast by id. Rarely needed. */
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, title: string, opts: Omit<ToastInput, "title"> = {}) => {
      const id = nextId.current++;
      const toast: Toast = {
        id,
        tone,
        title,
        description: opts.description,
        durationMs: opts.durationMs ?? 4000,
      };
      setToasts((t) => [...t, toast]);
      if (toast.durationMs && toast.durationMs > 0) {
        setTimeout(() => dismiss(id), toast.durationMs);
      }
    },
    [dismiss],
  );

  const api: ToastApi = {
    success: (title, opts) => push("success", title, opts),
    error: (title, opts) => push("error", title, { durationMs: 7000, ...opts }),
    info: (title, opts) => push("info", title, opts),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider />");
  }
  return ctx;
}

function Toaster({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div
      role="region"
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { tone, title, description } = toast;
  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? AlertCircle : Info;
  const cls =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "error"
        ? "border-red-200 bg-red-50 text-red-900"
        : "border-neutral-200 bg-white text-neutral-900";
  const iconCls =
    tone === "success" ? "text-emerald-700" : tone === "error" ? "text-red-700" : "text-neutral-500";

  // Mount-in animation via inline style so we don't need a CSS file change
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      role="alert"
      className={`pointer-events-auto rounded-lg border px-3 py-2.5 shadow-lg transition-all duration-150 ${cls} ${
        mounted ? "translate-x-0 opacity-100" : "translate-x-2 opacity-0"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <Icon size={16} className={`mt-0.5 shrink-0 ${iconCls}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight">{title}</p>
          {description && (
            <p className="mt-0.5 text-xs leading-snug opacity-80 break-words">{description}</p>
          )}
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 shrink-0 rounded p-1 opacity-50 hover:opacity-100"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
