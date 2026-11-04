"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, FolderOpen, ImagePlus, Loader2 } from "lucide-react";
import {
  createImageBackup,
  optimizeLocalImage,
  optimizePickedImage,
  pickImageFiles,
  pickImageFolder,
  pickOutputFolder,
  scanImages,
  supportsDirectoryPicker,
  supportsOpenFilePicker,
  type PickedImage,
  type WebImageEntry,
} from "@/lib/webOptimizer";

type Summary = {
  results: Awaited<ReturnType<typeof optimizeLocalImage>>[];
  errors: { path: string; message: string }[];
  backupPath: string;
  destinationName?: string;
};

export default function OptimizeForWebPage() {
  const [folderSupported, setFolderSupported] = useState<boolean | null>(null);
  const [filesSupported, setFilesSupported] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"folder" | "files" | null>(null);
  const [root, setRoot] = useState<FileSystemDirectoryHandle | null>(null);
  const [images, setImages] = useState<WebImageEntry[]>([]);
  const [picked, setPicked] = useState<PickedImage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState(0);
  const [quality, setQuality] = useState(80);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  useEffect(() => {
    setFolderSupported(supportsDirectoryPicker());
    setFilesSupported(supportsOpenFilePicker());
  }, []);

  const selectedImages = useMemo(
    () => images.filter((image) => selected.has(image.relativePath)),
    [images, selected],
  );
  const pendingCount = mode === "files" ? picked.length : selectedImages.length;

  async function pickFolder() {
    setBusy(true);
    setError(null);
    try {
      const selectedFolder = await pickImageFolder();
      setMode("folder");
      setRoot(selectedFolder.root);
      setImages(selectedFolder.images);
      setPicked([]);
      setSelected(new Set(selectedFolder.images.map((image) => image.relativePath)));
      setSkipped(selectedFolder.skippedWebp);
      setSummary(null);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) setError(err instanceof Error ? err.message : "No se pudo abrir la carpeta");
    } finally {
      setBusy(false);
    }
  }

  async function pickFiles() {
    setBusy(true);
    setError(null);
    try {
      const selectedFiles = await pickImageFiles();
      if (!selectedFiles.images.length) {
        setError(
          selectedFiles.skippedWebp || selectedFiles.skippedOther
            ? "Ninguna de las imágenes elegidas se puede convertir. Los WebP se omiten."
            : "No se eligió ninguna imagen convertible.",
        );
        return;
      }
      setMode("files");
      setRoot(null);
      setImages([]);
      setPicked(selectedFiles.images);
      setSelected(new Set());
      setSkipped(selectedFiles.skippedWebp + selectedFiles.skippedOther);
      setSummary(null);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) setError(err instanceof Error ? err.message : "No se pudieron abrir las imágenes");
    } finally {
      setBusy(false);
    }
  }

  function toggleImage(path: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(images.map((image) => image.relativePath)));
  }

  function selectNone() {
    setSelected(new Set());
  }

  async function optimize() {
    if (!pendingCount) return;
    setBusy(true);
    setSummary(null);
    setError(null);
    try {
      if (mode === "folder") {
        if (!root) return;
        if (await root.requestPermission({ mode: "readwrite" }) !== "granted") throw new Error("Se necesita permiso de escritura sobre la carpeta.");
        // Refresh before every run so retries never reuse moved originals or backup files.
        const scanned = await scanImages(root);
        const stillSelected = scanned.images.filter((entry) => selected.has(entry.relativePath));
        setImages(scanned.images);
        setSkipped(scanned.skippedWebp);
        setSelected(new Set(stillSelected.map((entry) => entry.relativePath)));
        if (!stillSelected.length) {
          setError("No quedó ninguna de las imágenes seleccionadas para optimizar.");
          return;
        }
        const backup = await createImageBackup(root);
        const result: Summary = { results: [], errors: [], backupPath: backup.path, destinationName: root.name };
        for (const [index, entry] of stillSelected.entries()) {
          setProgress({ current: index + 1, total: stillSelected.length });
          try {
            result.results.push(await optimizeLocalImage(entry, backup.handle, quality));
          } catch (err) {
            result.errors.push({ path: entry.relativePath, message: err instanceof Error ? err.message : "Error desconocido" });
          }
        }
        setSummary(result);
        const succeeded = new Set(result.results.map((item) => item.from));
        const failed = new Set(result.errors.map((failure) => failure.path));
        const remaining = scanned.images.filter((entry) => !succeeded.has(entry.relativePath));
        setImages(remaining);
        setSelected(new Set(remaining.filter((entry) => failed.has(entry.relativePath)).map((entry) => entry.relativePath)));
        return;
      }

      if (mode !== "files" || !picked.length) return;
      const destination = await pickOutputFolder();
      const backup = await createImageBackup(destination);
      const result: Summary = { results: [], errors: [], backupPath: backup.path, destinationName: destination.name };
      const remaining: PickedImage[] = [];
      for (const [index, image] of picked.entries()) {
        setProgress({ current: index + 1, total: picked.length });
        try {
          result.results.push(await optimizePickedImage(image, destination, backup.handle, quality));
        } catch (err) {
          remaining.push(image);
          result.errors.push({ path: image.name, message: err instanceof Error ? err.message : "Error desconocido" });
        }
      }
      setSummary(result);
      setPicked(remaining);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "No se pudo optimizar");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const originalBytes = summary?.results.reduce((total, item) => total + item.originalBytes, 0) ?? 0;
  const outputBytes = summary?.results.reduce((total, item) => total + item.outputBytes, 0) ?? 0;
  const browserSupported = folderSupported !== false || filesSupported !== false;

  return (
    <div className="p-8">
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-primary"><FolderOpen className="h-5 w-5" /><span className="text-sm font-medium">Herramienta</span></div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Optimizar para web</h1>
        <p className="max-w-3xl text-muted-foreground">Elegí una carpeta completa, una sola imagen o varias seleccionadas para convertirlas a WebP. En modo carpeta podés marcar cuáles procesar; los originales se guardan en backup. Los WebP existentes se omiten.</p>
      </div>
      <div className="mx-auto max-w-3xl space-y-6">
        {folderSupported === false && filesSupported === false && (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">Abrí esta herramienta en Chrome o Edge para seleccionar carpetas o imágenes locales.</p>
        )}
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={pickFolder} disabled={!folderSupported || busy} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"><FolderOpen className="h-4 w-4" />Elegir carpeta</button>
            <button type="button" onClick={pickFiles} disabled={!filesSupported || busy} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium disabled:opacity-50"><ImagePlus className="h-4 w-4" />Elegir imágenes</button>
          </div>
          {mode === "folder" && root && (
            <p className="rounded-lg border border-border bg-background p-3 text-sm">
              <strong>{root.name}</strong>: {selectedImages.length} seleccionadas de {images.length} pendientes · {skipped} WebP omitidos al escanear
            </p>
          )}
          {mode === "files" && picked.length > 0 && (
            <p className="rounded-lg border border-border bg-background p-3 text-sm">
              <strong>{picked.length}</strong> {picked.length === 1 ? "imagen lista" : "imágenes listas"} · al optimizar vas a elegir la carpeta de destino · {skipped} WebP omitidos
            </p>
          )}
          <p className="text-sm text-muted-foreground">JPG, JPEG, PNG, GIF, BMP, TIFF, HEIC, HEIF y AVIF. Se conservan las dimensiones, la transparencia y las animaciones. Las carpetas de backup se excluyen.</p>
          <div>
            <div className="mb-2 flex justify-between text-sm"><label htmlFor="webp-quality">Calidad WebP</label><span>{quality}%</span></div>
            <input id="webp-quality" type="range" min={1} max={100} value={quality} onChange={(event) => setQuality(Number(event.target.value))} disabled={busy} className="w-full accent-primary" />
            <p className="text-xs text-muted-foreground">80% recomendado para web. Se comprime sin cambiar el tamaño en píxeles y se eliminan metadatos.</p>
          </div>
          {mode === "folder" && images.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 text-xs">
                <button type="button" onClick={selectAll} disabled={busy} className="rounded-md border border-border px-2 py-1 disabled:opacity-50">Seleccionar todas</button>
                <button type="button" onClick={selectNone} disabled={busy} className="rounded-md border border-border px-2 py-1 disabled:opacity-50">Quitar selección</button>
              </div>
              <ul className="max-h-56 divide-y divide-border overflow-auto rounded-lg border border-border bg-background text-xs font-mono">
                {images.map((image) => (
                  <li key={image.relativePath}>
                    <label className="flex cursor-pointer items-start gap-3 break-all px-4 py-2">
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-primary"
                        checked={selected.has(image.relativePath)}
                        onChange={() => toggleImage(image.relativePath)}
                        disabled={busy}
                      />
                      <span>{image.relativePath}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {mode === "files" && picked.length > 0 && (
            <ul className="max-h-56 divide-y divide-border overflow-auto rounded-lg border border-border bg-background text-xs font-mono">
              {picked.map((image) => <li className="break-all px-4 py-2" key={`${image.name}-${image.file.lastModified}-${image.file.size}`}>{image.name}</li>)}
            </ul>
          )}
          <p className="text-sm text-muted-foreground">
            {mode === "files"
              ? "Los WebP y el backup de originales se guardan en la carpeta de destino que elijas. Los archivos originales no se borran de su ubicación."
              : "Los WebP se guardan junto a cada imagen. Si el nombre ya existe, se agrega un número. El original se retira de su ubicación solo después de guardar el backup y el WebP."}
          </p>
        </div>
        <button type="button" onClick={optimize} disabled={busy || !pendingCount || !browserSupported} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {busy ? (
            <><Loader2 className="h-4 w-4 animate-spin" />{progress ? `Optimizando ${progress.current}/${progress.total}` : mode === "files" ? "Preparando…" : "Leyendo carpeta…"}</>
          ) : (
            `Optimizar ${pendingCount || ""} ${pendingCount === 1 ? "imagen" : "imágenes"} a WebP`
          )}
        </button>
        <div aria-live="polite">
          {error && <p role="alert" className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}
          {summary && <div className="space-y-3 rounded-xl border border-border bg-card p-6">
            <p className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 className="h-4 w-4" />{summary.results.length} convertidas · {summary.errors.length} con error</p>
            {originalBytes > 0 && <p className="text-sm text-muted-foreground">{(originalBytes / 1024 / 1024).toFixed(2)} MB → {(outputBytes / 1024 / 1024).toFixed(2)} MB ({outputBytes <= originalBytes ? `${((1 - outputBytes / originalBytes) * 100).toFixed(1)}% menos` : `${((outputBytes / originalBytes - 1) * 100).toFixed(1)}% más`})</p>}
            <p className="break-all text-sm text-muted-foreground">Backup: {summary.destinationName}/{summary.backupPath}</p>
            <ul className="max-h-56 space-y-1 overflow-auto break-all font-mono text-xs text-muted-foreground">{summary.results.map((item) => <li key={item.from}>{item.from} → {item.to}</li>)}</ul>
            {summary.errors.length > 0 && <ul className="space-y-1 break-all text-xs text-red-400">{summary.errors.map((item) => <li key={item.path}>{item.path}: {item.message}</li>)}</ul>}
          </div>}
        </div>
      </div>
    </div>
  );
}
