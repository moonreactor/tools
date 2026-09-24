"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crop, Upload } from "lucide-react";
import clsx from "clsx";
import {
  ACCEPTED_IMAGE_ATTR,
  AspectRatioMode,
  CropRect,
  DEFAULT_ADJUSTMENTS,
  EditorAdjustments,
  FILTER_OPTIONS,
  ImageFilter,
  applyCropToSource,
  buildCssFilter,
  centeredCropForAspect,
  clampCrop,
  constrainCropToAspect,
  defaultCrop,
  drawTransformedSource,
  editedFilename,
  exportEditedImage,
  getAspectRatioValue,
  getSourceSize,
  getTransformedSize,
  insetCrop,
  isAcceptedImageFile,
  isFullCrop,
  isUnsupportedImageHint,
  loadImageFromFile,
  outputMimeAndExt,
  renderFilterThumb,
  sourceToCanvas,
} from "@/lib/imageEditor";
import {
  EditorHistory,
  EditorSnapshot,
  snapshotsEqualForDirty,
} from "@/lib/editorHistory";
import {
  openImageFile,
  replaceFile,
  saveCopy,
  supportsOpenFilePicker,
} from "@/lib/localFile";
import { CropOverlay, type CropHandle } from "./CropOverlay";
import { EditorTopbar } from "./EditorTopbar";
import { EditorToast, type ToastState } from "./Toast";
import { ToolPanel, type EditorTool } from "./ToolPanel";

type Baseline = {
  sourceRevision: number;
  workingW: number;
  workingH: number;
  adjustments: EditorAdjustments;
  filter: ImageFilter;
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
};

export default function ImageEditorPage() {
  const pickerSupported = useMemo(() => supportsOpenFilePicker(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef(new EditorHistory());
  const skipHistoryRef = useRef(false);

  const [file, setFile] = useState<File | null>(null);
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [working, setWorking] = useState<HTMLCanvasElement | null>(null);
  const [sourceRevision, setSourceRevision] = useState(0);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [aspectMode, setAspectMode] = useState<AspectRatioMode>("free");
  const [adjustments, setAdjustments] = useState<EditorAdjustments>(DEFAULT_ADJUSTMENTS);
  const [filter, setFilter] = useState<ImageFilter>("none");
  const [tool, setTool] = useState<EditorTool>("adjust");
  const [fitSize, setFitSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceDown, setSpaceDown] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [filterThumbs, setFilterThumbs] = useState<Partial<Record<ImageFilter, string>>>({});
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [baseline, setBaseline] = useState<Baseline | null>(null);

  const dragRef = useRef<{
    handle: CropHandle;
    startX: number;
    startY: number;
    startCrop: CropRect;
  } | null>(null);
  const panDragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(
    null
  );
  const historyReady = useRef(false);

  // Stable refs for keyboard shortcuts
  const actionsRef = useRef({
    onUndo: () => {},
    onRedo: () => {},
    onApplyCrop: () => {},
    enterCropMode: () => {},
    exitCropMode: (_keep: boolean) => {},
    rotate: () => {},
    tool: "adjust" as EditorTool,
  });

  const transformedSize = useMemo(() => {
    if (!working) return { width: 0, height: 0 };
    const { width, height } = getSourceSize(working);
    return getTransformedSize(width, height, rotation);
  }, [working, rotation]);

  const displaySize = useMemo(
    () => ({
      width: Math.round(fitSize.width * zoom),
      height: Math.round(fitSize.height * zoom),
    }),
    [fitSize, zoom]
  );

  const scale = useMemo(() => {
    if (!displaySize.width || !transformedSize.width) return 1;
    return displaySize.width / transformedSize.width;
  }, [displaySize.width, transformedSize.width]);

  const exportCrop = useMemo(() => {
    if (!transformedSize.width) return defaultCrop(1, 1);
    // Pending crop is only baked via "Aplicar recorte"; export uses the working bitmap.
    return defaultCrop(transformedSize.width, transformedSize.height);
  }, [transformedSize]);

  const dirty = useMemo(() => {
    if (!working || !baseline) return false;
    return !snapshotsEqualForDirty(
      {
        sourceRevision,
        workingW: working.width,
        workingH: working.height,
        adjustments,
        filter,
        rotation,
        flipH,
        flipV,
      },
      baseline
    );
  }, [
    working,
    baseline,
    sourceRevision,
    adjustments,
    filter,
    rotation,
    flipH,
    flipV,
  ]);

  const canReplace =
    Boolean(fileHandle) && !file?.name.toLowerCase().endsWith(".gif");

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ id: Date.now(), type, message });
  }, []);

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(historyRef.current.canUndo);
    setCanRedo(historyRef.current.canRedo);
  }, []);

  const getSnapshot = useCallback((): EditorSnapshot | null => {
    if (!working || !crop) return null;
    return {
      working,
      adjustments,
      filter,
      rotation,
      flipH,
      flipV,
      crop,
      aspectMode,
      sourceRevision,
    };
  }, [
    working,
    adjustments,
    filter,
    rotation,
    flipH,
    flipV,
    crop,
    aspectMode,
    sourceRevision,
  ]);

  const pushHistory = useCallback(() => {
    if (skipHistoryRef.current || !historyReady.current) return;
    const snap = getSnapshot();
    if (!snap) return;
    historyRef.current.push(snap);
    syncHistoryFlags();
  }, [getSnapshot, syncHistoryFlags]);

  const applySnapshot = useCallback(
    (snap: EditorSnapshot) => {
      skipHistoryRef.current = true;
      setWorking(snap.working);
      setAdjustments(snap.adjustments);
      setFilter(snap.filter);
      setRotation(snap.rotation);
      setFlipH(snap.flipH);
      setFlipV(snap.flipV);
      setCrop(snap.crop);
      setAspectMode(snap.aspectMode);
      setSourceRevision(snap.sourceRevision);
      syncHistoryFlags();
      requestAnimationFrame(() => {
        skipHistoryRef.current = false;
      });
    },
    [syncHistoryFlags]
  );

  const resetEditor = useCallback(() => {
    setFile(null);
    setFileHandle(null);
    setWorking(null);
    setSourceRevision(0);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setCrop(null);
    setAspectMode("free");
    setAdjustments(DEFAULT_ADJUSTMENTS);
    setFilter("none");
    setTool("adjust");
    setFitSize({ width: 0, height: 0 });
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setComparing(false);
    setSaving(false);
    setFilterThumbs({});
    setBaseline(null);
    historyRef.current.clear();
    historyReady.current = false;
    syncHistoryFlags();
  }, [syncHistoryFlags]);

  const loadFile = useCallback(
    async (selected: File, handle: FileSystemFileHandle | null) => {
      const hint = isUnsupportedImageHint(selected);
      if (hint) {
        showToast("error", hint);
        return;
      }
      if (!isAcceptedImageFile(selected)) {
        showToast("error", "Solo se aceptan JPG, PNG, WEBP o GIF");
        return;
      }
      if (selected.size > 50 * 1024 * 1024) {
        showToast("error", "El archivo supera el límite de 50 MB");
        return;
      }

      try {
        const img = await loadImageFromFile(selected);
        const canvas = sourceToCanvas(img);
        const { width, height } = getSourceSize(canvas);

        historyRef.current.clear();
        historyReady.current = false;
        skipHistoryRef.current = true;

        setFile(selected);
        setFileHandle(handle);
        setWorking(canvas);
        setSourceRevision(0);
        setRotation(0);
        setFlipH(false);
        setFlipV(false);
        setAspectMode("free");
        setAdjustments(DEFAULT_ADJUSTMENTS);
        setFilter("none");
        setTool("adjust");
        setCrop(defaultCrop(width, height));
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setBaseline({
          sourceRevision: 0,
          workingW: canvas.width,
          workingH: canvas.height,
          adjustments: { ...DEFAULT_ADJUSTMENTS },
          filter: "none",
          rotation: 0,
          flipH: false,
          flipV: false,
        });
        syncHistoryFlags();

        requestAnimationFrame(() => {
          skipHistoryRef.current = false;
          historyReady.current = true;
        });
      } catch (err) {
        showToast("error", err instanceof Error ? err.message : "No se pudo cargar la imagen");
      }
    },
    [showToast, syncHistoryFlags]
  );

  const onOpenWithPicker = async () => {
    try {
      if (!pickerSupported) {
        fileInputRef.current?.click();
        return;
      }
      const opened = await openImageFile();
      await loadFile(opened.file, opened.canReplace ? opened.handle : null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (err instanceof Error && err.message === "OPEN_PICKER_UNSUPPORTED") {
        fileInputRef.current?.click();
        return;
      }
      showToast("error", err instanceof Error ? err.message : "No se pudo abrir el archivo");
    }
  };

  const onFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    e.target.value = "";
    if (selected) await loadFile(selected, null);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) await loadFile(dropped, null);
  };

  // Keep crop bounds valid when geometry changes outside crop mode
  useEffect(() => {
    if (!working || tool === "crop") return;
    setCrop(defaultCrop(transformedSize.width, transformedSize.height));
  }, [working, rotation, tool, transformedSize.width, transformedSize.height]);

  // Filter thumbnails when working bitmap changes
  useEffect(() => {
    if (!working) {
      setFilterThumbs({});
      return;
    }
    const thumbs: Partial<Record<ImageFilter, string>> = {};
    for (const f of FILTER_OPTIONS) {
      thumbs[f.id] = renderFilterThumb(working, f.id);
    }
    setFilterThumbs(thumbs);
  }, [working, sourceRevision]);

  // Fit size measurement
  useEffect(() => {
    if (!working || !stageRef.current) return;

    const update = () => {
      const el = stageRef.current;
      if (!el) return;
      const maxW = Math.max(120, el.clientWidth - 32);
      const maxH = Math.max(200, el.clientHeight - 32);
      const { width: tw, height: th } = transformedSize;
      if (!tw || !th) return;
      const fit = Math.min(maxW / tw, maxH / th, 1);
      setFitSize({
        width: Math.round(tw * fit),
        height: Math.round(th * fit),
      });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, [working, transformedSize]);

  // Non-passive wheel zoom
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !working) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((z) => Math.min(4, Math.max(0.25, Math.round((z + delta) * 100) / 100)));
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, [working]);

  // Draw preview
  useEffect(() => {
    if (!working || !previewCanvasRef.current || !displaySize.width) return;

    const canvas = previewCanvasRef.current;
    canvas.width = displaySize.width;
    canvas.height = displaySize.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const transformed = drawTransformedSource(working, rotation, flipH, flipV);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = comparing
      ? "none"
      : buildCssFilter(adjustments, filter);
    ctx.drawImage(transformed, 0, 0, canvas.width, canvas.height);
  }, [
    working,
    rotation,
    flipH,
    flipV,
    adjustments,
    filter,
    displaySize,
    comparing,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!working) return;

    const isTyping = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const meta = e.metaKey || e.ctrlKey;
      const a = actionsRef.current;

      if (e.code === "Space") {
        e.preventDefault();
        setSpaceDown(true);
        return;
      }

      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) a.onRedo();
        else a.onUndo();
        return;
      }

      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        a.enterCropMode();
        return;
      }

      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        a.rotate();
        return;
      }

      if (e.key === "Enter" && a.tool === "crop") {
        e.preventDefault();
        a.onApplyCrop();
        return;
      }

      if (e.key === "Escape" && a.tool === "crop") {
        e.preventDefault();
        a.exitCropMode(false);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [working]);

  const withHistory = (fn: () => void) => {
    pushHistory();
    fn();
  };

  const onUndo = () => {
    const current = getSnapshot();
    if (!current) return;
    const prev = historyRef.current.undo(current);
    if (prev) applySnapshot(prev);
  };

  const onRedo = () => {
    const current = getSnapshot();
    if (!current) return;
    const next = historyRef.current.redo(current);
    if (next) applySnapshot(next);
  };

  const enterCropMode = () => {
    if (!transformedSize.width) return;
    setTool("crop");
    const aspect = getAspectRatioValue(aspectMode);
    if (aspect) {
      setCrop(centeredCropForAspect(transformedSize.width, transformedSize.height, aspect));
    } else if (!crop || isFullCrop(crop, transformedSize.width, transformedSize.height)) {
      setCrop(insetCrop(transformedSize.width, transformedSize.height));
    }
  };

  const exitCropMode = (keepCrop: boolean) => {
    setTool("adjust");
    if (!keepCrop && transformedSize.width) {
      setCrop(defaultCrop(transformedSize.width, transformedSize.height));
      setAspectMode("free");
    }
  };

  const onApplyCrop = () => {
    if (!working || !crop || tool !== "crop") return;
    if (isFullCrop(crop, transformedSize.width, transformedSize.height)) {
      exitCropMode(false);
      return;
    }
    pushHistory();
    const baked = applyCropToSource(working, crop, rotation, flipH, flipV);
    const nextRev = sourceRevision + 1;
    setWorking(baked);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setAspectMode("free");
    setCrop(defaultCrop(baked.width, baked.height));
    setSourceRevision(nextRev);
    setTool("adjust");
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  actionsRef.current = {
    onUndo,
    onRedo,
    onApplyCrop,
    enterCropMode,
    exitCropMode,
    rotate: () =>
      withHistory(() => setRotation((r) => ((r + 90) % 360) as 0 | 90 | 180 | 270)),
    tool,
  };

  const onToolChange = (next: EditorTool) => {
    if (next === "crop") enterCropMode();
    else exitCropMode(false);
  };

  const onAspectChange = (mode: AspectRatioMode) => {
    pushHistory();
    setAspectMode(mode);
    if (!transformedSize.width) return;
    const aspect = getAspectRatioValue(mode);
    if (aspect) {
      setCrop(centeredCropForAspect(transformedSize.width, transformedSize.height, aspect));
    } else {
      setCrop(insetCrop(transformedSize.width, transformedSize.height));
    }
  };

  const onResetCrop = () => {
    if (!transformedSize.width) return;
    pushHistory();
    const aspect = getAspectRatioValue(aspectMode);
    if (aspect) {
      setCrop(centeredCropForAspect(transformedSize.width, transformedSize.height, aspect));
    } else {
      setCrop(insetCrop(transformedSize.width, transformedSize.height));
    }
  };

  const cropDirty = Boolean(
    crop &&
      transformedSize.width &&
      !isFullCrop(crop, transformedSize.width, transformedSize.height)
  );

  const toImageCoords = (clientX: number, clientY: number) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
    };
  };

  const onCropPointerDown = (handle: CropHandle, e: React.PointerEvent) => {
    if (!crop || tool !== "crop" || spaceDown) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const pt = toImageCoords(e.clientX, e.clientY);
    dragRef.current = {
      handle,
      startX: pt.x,
      startY: pt.y,
      startCrop: { ...crop },
    };
  };

  const onCropPointerMove = (e: React.PointerEvent) => {
    if (panDragRef.current) {
      const d = panDragRef.current;
      setPan({
        x: d.panX + (e.clientX - d.startX),
        y: d.panY + (e.clientY - d.startY),
      });
      return;
    }

    if (!dragRef.current || !crop) return;
    const { handle, startX, startY, startCrop } = dragRef.current;
    const pt = toImageCoords(e.clientX, e.clientY);
    const dx = pt.x - startX;
    const dy = pt.y - startY;
    const aspect = getAspectRatioValue(aspectMode);
    const iw = transformedSize.width;
    const ih = transformedSize.height;

    let next: CropRect = { ...startCrop };

    if (handle === "move") {
      next.x = startCrop.x + dx;
      next.y = startCrop.y + dy;
      next = clampCrop(next, iw, ih);
    } else {
      let { x, y, width, height } = startCrop;
      if (handle.includes("w")) {
        x = startCrop.x + dx;
        width = startCrop.width - dx;
      }
      if (handle.includes("e")) {
        width = startCrop.width + dx;
      }
      if (handle.includes("n")) {
        y = startCrop.y + dy;
        height = startCrop.height - dy;
      }
      if (handle.includes("s")) {
        height = startCrop.height + dy;
      }

      if (width < 8) width = 8;
      if (height < 8) height = 8;

      next = constrainCropToAspect({ x, y, width, height }, iw, ih, aspect);

      if (aspect) {
        if (handle === "se" || handle === "e" || handle === "s") {
          next.x = startCrop.x;
          next.y = startCrop.y;
        } else if (handle === "sw" || handle === "w") {
          next.x = startCrop.x + startCrop.width - next.width;
          next.y = startCrop.y;
        } else if (handle === "ne" || handle === "n") {
          next.x = startCrop.x;
          next.y = startCrop.y + startCrop.height - next.height;
        } else if (handle === "nw") {
          next.x = startCrop.x + startCrop.width - next.width;
          next.y = startCrop.y + startCrop.height - next.height;
        }
        next = clampCrop(next, iw, ih);
      }
    }

    setCrop(next);
  };

  const onCropPointerUp = () => {
    if (dragRef.current) {
      dragRef.current = null;
      // Push history once after a crop drag gesture ends — approximate by comparing
      // We push at pointer down instead for cleaner undo of whole gestures
    }
    panDragRef.current = null;
  };

  // Push history at start of crop drag
  const onCropPointerDownWithHistory = (handle: CropHandle, e: React.PointerEvent) => {
    if (!dragRef.current) pushHistory();
    onCropPointerDown(handle, e);
  };

  const onStagePointerDown = (e: React.PointerEvent) => {
    if (spaceDown || e.button === 1) {
      e.preventDefault();
      panDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const buildExportBlob = async () => {
    if (!working || !file) throw new Error("No hay imagen cargada");
    const { mimeType } = outputMimeAndExt(file.name, file.type);
    return exportEditedImage(working, {
      crop: exportCrop,
      adjustments,
      filter,
      rotation,
      flipH,
      flipV,
      mimeType,
    });
  };

  const markClean = () => {
    if (!working) return;
    setBaseline({
      sourceRevision,
      workingW: working.width,
      workingH: working.height,
      adjustments: { ...adjustments },
      filter,
      rotation,
      flipH,
      flipV,
    });
  };

  const onReplace = async () => {
    if (!fileHandle || !file || !dirty) return;
    const confirmed = window.confirm(
      `Se va a sobrescribir "${file.name}". Esta acción no se puede deshacer.\n\n¿Continuar?`
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      const blob = await buildExportBlob();
      await replaceFile(fileHandle, blob);
      markClean();
      showToast("success", "Archivo reemplazado");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Error al reemplazar");
    } finally {
      setSaving(false);
    }
  };

  const onSaveCopy = async () => {
    if (!file || !dirty) return;
    setSaving(true);
    try {
      const blob = await buildExportBlob();
      const { mimeType, ext } = outputMimeAndExt(file.name, file.type);
      const name = editedFilename(file.name, ext);
      await saveCopy(blob, name, mimeType);
      markClean();
      showToast("success", "Copia guardada");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      showToast("error", err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const outW =
    tool === "crop" && crop ? Math.round(crop.width) : Math.round(transformedSize.width);
  const outH =
    tool === "crop" && crop ? Math.round(crop.height) : Math.round(transformedSize.height);

  return (
    <div className={clsx("flex flex-col", working ? "h-screen min-h-0 overflow-hidden p-0" : "p-8")}>
      {!working && (
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-2 text-primary">
            <Crop className="h-5 w-5" />
            <span className="text-sm font-medium">Herramienta</span>
          </div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight">Editor de imágenes</h1>
          <p className="max-w-2xl text-muted-foreground">
            Recorte, ajustes y filtros. Exportá reemplazando el original o como copia.
          </p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_ATTR}
        className="hidden"
        onChange={onFileInput}
      />

      {!working ? (
        <div className="mx-auto max-w-2xl">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingFile(true);
            }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={onDrop}
            className={clsx(
              "flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 transition-colors",
              isDraggingFile
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:border-primary/40"
            )}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Upload className="h-7 w-7" />
            </div>
            <div className="text-center">
              <p className="font-medium">Arrastrá una imagen o abrila desde el disco</p>
              <p className="mt-1 text-sm text-muted-foreground">
                JPG, PNG, WEBP o GIF · máx. 50 MB
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenWithPicker}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Abrir imagen
            </button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <EditorTopbar
            fileName={file?.name || "imagen"}
            dimensionsLabel={`${outW} × ${outH} px`}
            zoomPercent={Math.round(zoom * 100)}
            canUndo={canUndo}
            canRedo={canRedo}
            canReplace={canReplace}
            dirty={dirty}
            saving={saving}
            comparing={comparing}
            onUndo={onUndo}
            onRedo={onRedo}
            onCompareDown={() => setComparing(true)}
            onCompareUp={() => setComparing(false)}
            onZoomIn={() => setZoom((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100))}
            onZoomOut={() => setZoom((z) => Math.max(0.25, Math.round((z - 0.25) * 100) / 100))}
            onZoomFit={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            onReplace={onReplace}
            onSaveCopy={onSaveCopy}
            onClose={resetEditor}
          />

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div
              ref={stageRef}
              className={clsx(
                "relative min-h-[320px] flex-1 overflow-hidden",
                "bg-[length:16px_16px] bg-[linear-gradient(45deg,#1c1c1e_25%,transparent_25%),linear-gradient(-45deg,#1c1c1e_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1c1c1e_75%),linear-gradient(-45deg,transparent_75%,#1c1c1e_75%)]",
                "bg-[position:0_0,0_8px,8px_-8px,-8px_0] bg-[#121214]",
                spaceDown ? "cursor-grab" : "cursor-default"
              )}
              onPointerDown={onStagePointerDown}
              onPointerMove={onCropPointerMove}
              onPointerUp={onCropPointerUp}
              onPointerCancel={onCropPointerUp}
            >
              <div
                className="absolute left-1/2 top-1/2"
                style={{
                  width: displaySize.width,
                  height: displaySize.height,
                  transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
                }}
              >
                <div
                  className="relative touch-none"
                  style={{ width: displaySize.width, height: displaySize.height }}
                >
                  <canvas
                    ref={previewCanvasRef}
                    className="block"
                    style={{ width: displaySize.width, height: displaySize.height }}
                  />
                  {tool === "crop" && crop && (
                    <CropOverlay
                      crop={crop}
                      scale={scale}
                      displayWidth={displaySize.width}
                      displayHeight={displaySize.height}
                      onPointerDown={onCropPointerDownWithHistory}
                    />
                  )}
                </div>
              </div>
            </div>

            <ToolPanel
              tool={tool}
              onToolChange={onToolChange}
              adjustments={adjustments}
              onAdjustmentsChange={setAdjustments}
              onAdjustmentsInteractStart={pushHistory}
              filter={filter}
              onFilterChange={(f) => {
                pushHistory();
                setFilter(f);
              }}
              filterThumbs={filterThumbs}
              aspectMode={aspectMode}
              onAspectChange={onAspectChange}
              flipH={flipH}
              flipV={flipV}
              onRotate={() =>
                withHistory(() =>
                  setRotation((r) => ((r + 90) % 360) as 0 | 90 | 180 | 270)
                )
              }
              onFlipH={() => withHistory(() => setFlipH((v) => !v))}
              onFlipV={() => withHistory(() => setFlipV((v) => !v))}
              onApplyCrop={onApplyCrop}
              onResetCrop={onResetCrop}
              cropDirty={cropDirty}
            />
          </div>
        </div>
      )}

      <EditorToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
