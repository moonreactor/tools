import type {
  AspectRatioMode,
  CropRect,
  EditorAdjustments,
  ImageFilter,
} from "@/lib/imageEditor";
import { cloneCanvas } from "@/lib/imageEditor";

export type EditorSnapshot = {
  working: HTMLCanvasElement;
  adjustments: EditorAdjustments;
  filter: ImageFilter;
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  crop: CropRect;
  aspectMode: AspectRatioMode;
  sourceRevision: number;
};

const MAX_HISTORY = 40;

export function cloneSnapshot(snap: EditorSnapshot): EditorSnapshot {
  return {
    working: cloneCanvas(snap.working),
    adjustments: { ...snap.adjustments },
    filter: snap.filter,
    rotation: snap.rotation,
    flipH: snap.flipH,
    flipV: snap.flipV,
    crop: { ...snap.crop },
    aspectMode: snap.aspectMode,
    sourceRevision: snap.sourceRevision,
  };
}

export function snapshotsEqualForDirty(
  a: Omit<EditorSnapshot, "working" | "crop" | "aspectMode"> & { workingW: number; workingH: number },
  b: Omit<EditorSnapshot, "working" | "crop" | "aspectMode"> & { workingW: number; workingH: number }
): boolean {
  return (
    a.sourceRevision === b.sourceRevision &&
    a.workingW === b.workingW &&
    a.workingH === b.workingH &&
    a.filter === b.filter &&
    a.rotation === b.rotation &&
    a.flipH === b.flipH &&
    a.flipV === b.flipV &&
    a.adjustments.brightness === b.adjustments.brightness &&
    a.adjustments.contrast === b.adjustments.contrast &&
    a.adjustments.saturation === b.adjustments.saturation &&
    a.adjustments.warmth === b.adjustments.warmth
  );
}

export class EditorHistory {
  private past: EditorSnapshot[] = [];
  private future: EditorSnapshot[] = [];

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  clear() {
    this.past = [];
    this.future = [];
  }

  push(current: EditorSnapshot) {
    this.past.push(cloneSnapshot(current));
    if (this.past.length > MAX_HISTORY) this.past.shift();
    this.future = [];
  }

  undo(current: EditorSnapshot): EditorSnapshot | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(cloneSnapshot(current));
    return prev;
  }

  redo(current: EditorSnapshot): EditorSnapshot | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(cloneSnapshot(current));
    return next;
  }
}
