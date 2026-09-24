"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  Eye,
  Loader2,
  Redo2,
  Replace,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import clsx from "clsx";

type Props = {
  fileName: string;
  dimensionsLabel: string;
  zoomPercent: number;
  canUndo: boolean;
  canRedo: boolean;
  canReplace: boolean;
  dirty: boolean;
  saving: boolean;
  comparing: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onCompareDown: () => void;
  onCompareUp: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onReplace: () => void;
  onSaveCopy: () => void;
  onClose: () => void;
};

export function EditorTopbar({
  fileName,
  dimensionsLabel,
  zoomPercent,
  canUndo,
  canRedo,
  canReplace,
  dirty,
  saving,
  comparing,
  onUndo,
  onRedo,
  onCompareDown,
  onCompareUp,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onReplace,
  onSaveCopy,
  onClose,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/80 px-3 py-2 backdrop-blur">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{fileName}</p>
        <p className="text-[11px] tabular-nums text-muted-foreground">{dimensionsLabel}</p>
      </div>

      <div className="flex items-center gap-1">
        <IconBtn label="Deshacer" disabled={!canUndo} onClick={onUndo}>
          <Undo2 className="h-4 w-4" />
        </IconBtn>
        <IconBtn label="Rehacer" disabled={!canRedo} onClick={onRedo}>
          <Redo2 className="h-4 w-4" />
        </IconBtn>
        <IconBtn
          label="Antes / después (mantener)"
          active={comparing}
          onPointerDown={onCompareDown}
          onPointerUp={onCompareUp}
          onPointerLeave={onCompareUp}
        >
          <Eye className="h-4 w-4" />
        </IconBtn>
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-border px-1">
        <IconBtn label="Alejar" onClick={onZoomOut}>
          <ZoomOut className="h-3.5 w-3.5" />
        </IconBtn>
        <button
          type="button"
          onClick={onZoomFit}
          className="min-w-[3.25rem] px-1 text-center text-[11px] tabular-nums text-muted-foreground hover:text-foreground"
        >
          {zoomPercent}%
        </button>
        <IconBtn label="Acercar" onClick={onZoomIn}>
          <ZoomIn className="h-3.5 w-3.5" />
        </IconBtn>
      </div>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => setMenuOpen((v) => !v)}
          className={clsx(
            "inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground",
            "hover:opacity-90 disabled:opacity-40"
          )}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Exportar
          <ChevronDown className="h-3.5 w-3.5 opacity-80" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-xl">
            {canReplace && (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  setMenuOpen(false);
                  onReplace();
                }}
              >
                <Replace className="h-4 w-4 text-muted-foreground" />
                Reemplazar original
              </button>
            )}
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => {
                setMenuOpen(false);
                onSaveCopy();
              }}
            >
              <Download className="h-4 w-4 text-muted-foreground" />
              Descargar copia
            </button>
          </div>
        )}
      </div>

      <IconBtn label="Cerrar" onClick={onClose}>
        <X className="h-4 w-4" />
      </IconBtn>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
  active,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  onPointerLeave?: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      className={clsx(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground disabled:opacity-30",
        active && "bg-primary/15 text-primary"
      )}
    >
      {children}
    </button>
  );
}
