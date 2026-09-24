"use client";

import { useEffect } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import clsx from "clsx";

export type ToastState = {
  id: number;
  type: "success" | "error";
  message: string;
} | null;

export function EditorToast({
  toast,
  onDismiss,
}: {
  toast: ToastState;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(onDismiss, 2500);
    return () => window.clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50">
      <div
        className={clsx(
          "pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg",
          toast.type === "success"
            ? "border-green-500/30 bg-card text-green-400"
            : "border-red-500/30 bg-card text-red-400"
        )}
      >
        {toast.type === "success" ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <p className="flex-1">{toast.message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          aria-label="Cerrar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
