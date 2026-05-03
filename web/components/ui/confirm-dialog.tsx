"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Replaces browser `confirm()` and `alert()` everywhere we need a yes/no
 * gate before a destructive action. Uses `<dialog>` so it gets native modal
 * focus-trapping, Esc-to-close, and backdrop-click-to-close for free.
 *
 * Pattern A — declarative wrapper:
 *   <ConfirmDialog
 *     open={open}
 *     title="Delete this lease?"
 *     description="This will remove the lease and all its events, packs, and field edits. Cannot be undone."
 *     confirmLabel="Delete lease"
 *     destructive
 *     onConfirm={async () => { await api.deleteLease(id); }}
 *     onClose={() => setOpen(false)}
 *   />
 *
 * Pattern B — imperative hook (more ergonomic at call sites):
 *   const confirm = useConfirm();
 *   const ok = await confirm({ title: "Delete?", destructive: true });
 *   if (ok) { ... }
 */

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button as red (delete) instead of dark (default). */
  destructive?: boolean;
  /** Async-friendly: while this is running the dialog disables both buttons
   * and shows "Working…" on the confirm button. Errors are NOT swallowed —
   * they surface to the caller's try/catch via the toast system. */
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);

  // Sync our `open` prop with the native <dialog> open state.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // Reset busy state on each open
      setBusy(false);
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  // Wire the native `close` event (ESC, backdrop click) back to our state
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handler = () => onClose();
    el.addEventListener("close", handler);
    return () => el.removeEventListener("close", handler);
  }, [onClose]);

  // Backdrop click — `<dialog>` doesn't close on backdrop click natively.
  function onBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const confirmCls = destructive
    ? "bg-red-600 hover:bg-red-700 text-white"
    : "bg-neutral-900 hover:bg-neutral-700 text-white";

  return (
    <dialog
      ref={dialogRef}
      onClick={onBackdropClick}
      className="rounded-lg border border-neutral-200 p-0 shadow-xl backdrop:bg-neutral-900/40 max-w-md"
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          {destructive && (
            <div className="rounded-full bg-red-100 p-1.5 text-red-700 shrink-0">
              <AlertTriangle size={16} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
            {description && (
              <div className="mt-1.5 text-sm text-neutral-600">{description}</div>
            )}
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            autoFocus
            className={`rounded-md px-3 py-1.5 text-sm disabled:opacity-50 ${confirmCls}`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

// ---- Imperative useConfirm() hook --------------------------------------

interface ConfirmRequest {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface ConfirmHostState extends ConfirmRequest {
  resolve: (ok: boolean) => void;
}

let _emit: ((req: ConfirmRequest) => Promise<boolean>) | null = null;

/**
 * Imperative confirm() replacement. Mount <ConfirmHost /> once at the root
 * (next to <ToastProvider />) so the host renders the dialog. Any call site
 * can then `const ok = await useConfirm()({ title, destructive });`.
 */
export function useConfirm(): (req: ConfirmRequest) => Promise<boolean> {
  return useCallback((req: ConfirmRequest) => {
    if (!_emit) {
      // The host wasn't mounted — fall back to the native confirm() rather
      // than swallowing the click. Should never happen in practice since
      // we mount it in the root layout.
      // eslint-disable-next-line no-alert
      return Promise.resolve(window.confirm(req.title));
    }
    return _emit(req);
  }, []);
}

/** Mount once at the app root. Owns the dialog state for `useConfirm()`. */
export function ConfirmHost() {
  const [state, setState] = useState<ConfirmHostState | null>(null);

  useEffect(() => {
    _emit = (req) =>
      new Promise<boolean>((resolve) => {
        setState({ ...req, resolve });
      });
    return () => {
      _emit = null;
    };
  }, []);

  function handleConfirm() {
    state?.resolve(true);
  }
  function handleClose() {
    if (state) {
      state.resolve(false);
      setState(null);
    }
  }

  return (
    <ConfirmDialog
      open={state !== null}
      title={state?.title ?? ""}
      description={state?.description}
      confirmLabel={state?.confirmLabel}
      cancelLabel={state?.cancelLabel}
      destructive={state?.destructive}
      onConfirm={handleConfirm}
      onClose={handleClose}
    />
  );
}
