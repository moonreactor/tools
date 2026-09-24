"use client";

import {
  Check,
  Crop,
  FlipHorizontal2,
  FlipVertical2,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import clsx from "clsx";
import {
  ASPECT_RATIO_OPTIONS,
  AspectRatioMode,
  DEFAULT_ADJUSTMENTS,
  EditorAdjustments,
  FILTER_OPTIONS,
  ImageFilter,
} from "@/lib/imageEditor";

export type EditorTool = "adjust" | "crop";

type Props = {
  tool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  adjustments: EditorAdjustments;
  onAdjustmentsChange: (next: EditorAdjustments) => void;
  onAdjustmentsInteractStart: () => void;
  filter: ImageFilter;
  onFilterChange: (filter: ImageFilter) => void;
  filterThumbs: Partial<Record<ImageFilter, string>>;
  aspectMode: AspectRatioMode;
  onAspectChange: (mode: AspectRatioMode) => void;
  flipH: boolean;
  flipV: boolean;
  onRotate: () => void;
  onFlipH: () => void;
  onFlipV: () => void;
  onApplyCrop: () => void;
  onResetCrop: () => void;
  cropDirty: boolean;
};

export function ToolPanel({
  tool,
  onToolChange,
  adjustments,
  onAdjustmentsChange,
  onAdjustmentsInteractStart,
  filter,
  onFilterChange,
  filterThumbs,
  aspectMode,
  onAspectChange,
  flipH,
  flipV,
  onRotate,
  onFlipH,
  onFlipV,
  onApplyCrop,
  onResetCrop,
  cropDirty,
}: Props) {
  return (
    <aside className="flex w-full flex-col border-border bg-card lg:w-[280px] lg:border-l">
      <div className="flex border-b border-border p-1">
        <TabBtn
          active={tool === "adjust"}
          onClick={() => onToolChange("adjust")}
          icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
          label="Ajustar"
        />
        <TabBtn
          active={tool === "crop"}
          onClick={() => onToolChange("crop")}
          icon={<Crop className="h-3.5 w-3.5" />}
          label="Recortar"
        />
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {tool === "adjust" ? (
          <>
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Ajustes
              </h3>
              <div className="space-y-3">
                {(
                  [
                    ["brightness", "Brillo", 0, 200],
                    ["contrast", "Contraste", 0, 200],
                    ["saturation", "Saturación", 0, 200],
                    ["warmth", "Calidez", -100, 100],
                  ] as const
                ).map(([key, label, min, max]) => (
                  <label key={key} className="block">
                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                      <span>{label}</span>
                      <span className="tabular-nums">
                        {key === "warmth" ? adjustments[key] : `${adjustments[key]}%`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      value={adjustments[key]}
                      onPointerDown={onAdjustmentsInteractStart}
                      onChange={(e) =>
                        onAdjustmentsChange({
                          ...adjustments,
                          [key]: Number(e.target.value),
                        })
                      }
                      className="w-full accent-primary"
                    />
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    onAdjustmentsInteractStart();
                    onAdjustmentsChange(DEFAULT_ADJUSTMENTS);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Restablecer ajustes
                </button>
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Filtros
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {FILTER_OPTIONS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onFilterChange(f.id)}
                    className={clsx(
                      "overflow-hidden rounded-lg border text-left transition-colors",
                      filter === f.id
                        ? "border-primary ring-1 ring-primary"
                        : "border-border hover:border-primary/40"
                    )}
                  >
                    <div className="aspect-square bg-muted">
                      {filterThumbs[f.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={filterThumbs[f.id]}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <p
                      className={clsx(
                        "px-1.5 py-1 text-[10px] font-medium",
                        filter === f.id ? "text-primary" : "text-muted-foreground"
                      )}
                    >
                      {f.label}
                    </p>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Transformar
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onRotate}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  90°
                </button>
                <button
                  type="button"
                  onClick={onFlipH}
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs",
                    flipH
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <FlipHorizontal2 className="h-3.5 w-3.5" />
                  H
                </button>
                <button
                  type="button"
                  onClick={onFlipV}
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs",
                    flipV
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <FlipVertical2 className="h-3.5 w-3.5" />
                  V
                </button>
              </div>
            </section>
          </>
        ) : (
          <>
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Relación de aspecto
              </h3>
              <div className="flex flex-wrap gap-2">
                {ASPECT_RATIO_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onAspectChange(opt.id)}
                    className={clsx(
                      "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                      aspectMode === opt.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <button
                type="button"
                disabled={!cropDirty}
                onClick={onApplyCrop}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                <Check className="h-4 w-4" />
                Aplicar recorte
              </button>
              <button
                type="button"
                onClick={onResetCrop}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                Restablecer marco
              </button>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Arrastrá el marco o las manijas. Enter aplica · Esc vuelve a Ajustar.
              </p>
            </section>
          </>
        )}
      </div>
    </aside>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium transition-colors",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
