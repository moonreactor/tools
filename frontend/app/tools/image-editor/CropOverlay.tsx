"use client";

import clsx from "clsx";
import type { CropRect } from "@/lib/imageEditor";

export type CropHandle = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

type Props = {
  crop: CropRect;
  scale: number;
  displayWidth: number;
  displayHeight: number;
  onPointerDown: (handle: CropHandle, e: React.PointerEvent) => void;
};

export function CropOverlay({
  crop,
  scale,
  displayWidth,
  displayHeight,
  onPointerDown,
}: Props) {
  const left = crop.x * scale;
  const top = crop.y * scale;
  const width = crop.width * scale;
  const height = crop.height * scale;

  const handles: { id: CropHandle; className: string }[] = [
    { id: "nw", className: "-left-1.5 -top-1.5 cursor-nwse-resize" },
    { id: "ne", className: "-right-1.5 -top-1.5 cursor-nesw-resize" },
    { id: "sw", className: "-bottom-1.5 -left-1.5 cursor-nesw-resize" },
    { id: "se", className: "-bottom-1.5 -right-1.5 cursor-nwse-resize" },
    { id: "n", className: "left-1/2 -top-1.5 -translate-x-1/2 cursor-ns-resize" },
    { id: "s", className: "left-1/2 -bottom-1.5 -translate-x-1/2 cursor-ns-resize" },
    { id: "w", className: "top-1/2 -left-1.5 -translate-y-1/2 cursor-ew-resize" },
    { id: "e", className: "top-1/2 -right-1.5 -translate-y-1/2 cursor-ew-resize" },
  ];

  return (
    <>
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 bg-black/55"
        style={{ height: Math.max(0, top) }}
      />
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 bg-black/55"
        style={{ height: Math.max(0, displayHeight - top - height) }}
      />
      <div
        className="pointer-events-none absolute left-0 bg-black/55"
        style={{ top, height, width: Math.max(0, left) }}
      />
      <div
        className="pointer-events-none absolute right-0 bg-black/55"
        style={{
          top,
          height,
          width: Math.max(0, displayWidth - left - width),
        }}
      />

      <div
        className="absolute border border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
        style={{ left, top, width, height }}
        onPointerDown={(e) => onPointerDown("move", e)}
      >
        {/* Rule of thirds */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/3 top-0 h-full w-px bg-white/35" />
          <div className="absolute left-2/3 top-0 h-full w-px bg-white/35" />
          <div className="absolute left-0 top-1/3 h-px w-full bg-white/35" />
          <div className="absolute left-0 top-2/3 h-px w-full bg-white/35" />
        </div>

        {handles.map((h) => (
          <div
            key={h.id}
            onPointerDown={(e) => onPointerDown(h.id, e)}
            className={clsx(
              "absolute z-10 h-3 w-3 rounded-sm border border-white bg-primary",
              h.className
            )}
          />
        ))}
      </div>

      <div
        className="pointer-events-none absolute rounded bg-black/70 px-2 py-0.5 text-[10px] font-medium tabular-nums text-white"
        style={{
          left: left + width / 2,
          top: Math.max(4, top - 22),
          transform: "translateX(-50%)",
        }}
      >
        {Math.round(crop.width)} × {Math.round(crop.height)}
      </div>
    </>
  );
}
