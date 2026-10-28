"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, FolderOpen, Loader2 } from "lucide-react";
import { supportsDirectoryPicker } from "@/lib/localFolder";
import { createImageBackup, optimizeLocalImage, pickImageFolder, scanImages, type WebImageEntry } from "@/lib/webOptimizer";

type Summary = {
  results: Awaited<ReturnType<typeof optimizeLocalImage>>[];
  errors: { path: string; message: string }[];
  backupPath: string;
};

export default function OptimizeForWebPage() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [root, setRoot] = useState<FileSystemDirectoryHandle | null>(null);
  const [images, setImages] = useState<WebImageEntry[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [quality, setQuality] = useState(80);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  useEffect(() => setSupported(supportsDirectoryPicker()), []);

  async function pick() {
    setBusy(true);
    setError(null);
    try {
      const selected = await pickImageFolder();
      setRoot(selected.root);
      setImages(selected.images);
      setSkipped(selected.skippedWebp);
      setSummary(null);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) setError(err instanceof Error ? err.message : "No se pudo abrir la carpeta");
    } finally {
      setBusy(false);
    }
  }

  async function optimize() {
    if (!root || !images.length) return;
    setBusy(true);
    setSummary(null);
    setError(null);
    try {
      if (await root.requestPermission({ mode: "readwrite" }) !== "granted") throw new Error("Se necesita permiso de escritura sobre la carpeta.");
      // Refresh before every run so retries never reuse moved originals or backup files.
      const scanned = await scanImages(root);
      setImages(scanned.images);
      setSkipped(scanned.skippedWebp);
      if (!scanned.images.length) return;
      const backup = await createImageBackup(root);
      const result: Summary = { results: [], errors: [], backupPath: backup.path };
      for (const [index, entry] of scanned.images.entries()) {
        setProgress({ current: index + 1, total: scanned.images.length });
        try {
          result.results.push(await optimizeLocalImage(entry, backup.handle, quality));
        } catch (err) {
          result.errors.push({ path: entry.relativePath, message: err instanceof Error ? err.message : "Error desconocido" });
        }
      }
      setSummary(result);
      setImages(scanned.images.filter((entry) => result.errors.some((failure) => failure.path === entry.relativePath)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo optimizar la carpeta");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const originalBytes = summary?.results.reduce((total, item) => total + item.originalBytes, 0) ?? 0;
  const outputBytes = summary?.results.reduce((total, item) => total + item.outputBytes, 0) ?? 0;

  return (
    <div className="p-8">
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-primary"><FolderOpen className="h-5 w-5" /><span className="text-sm font-medium">Herramienta</span></div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Optimizar para web</h1>
        <p className="max-w-3xl text-muted-foreground">Elegí una carpeta para convertir sus imágenes a WebP, incluidas las subcarpetas. Los originales se guardan en backup con fecha y hora. Los WebP existentes se omiten.</p>
      </div>
      <div className="mx-auto max-w-3xl space-y-6">
        {supported === false && <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">Abrí esta herramienta en Chrome o Edge para seleccionar y escribir en una carpeta local.</p>}
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <button type="button" onClick={pick} disabled={!supported || busy} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"><FolderOpen className="h-4 w-4" />Elegir carpeta</button>
          {root && <p className="rounded-lg border border-border bg-background p-3 text-sm"><strong>{root.name}</strong>: {images.length} imágenes pendientes · {skipped} WebP omitidos al escanear</p>}
          <p className="text-sm text-muted-foreground">JPG, JPEG, PNG, GIF, BMP, TIFF, HEIC, HEIF y AVIF. Se conservan las dimensiones, la transparencia y las animaciones. Las carpetas de backup se excluyen.</p>
          <div>
            <div className="mb-2 flex justify-between text-sm"><label htmlFor="webp-quality">Calidad WebP</label><span>{quality}%</span></div>
            <input id="webp-quality" type="range" min={1} max={100} value={quality} onChange={(event) => setQuality(Number(event.target.value))} disabled={busy} className="w-full accent-primary" />
            <p className="text-xs text-muted-foreground">80% recomendado para web. Se comprime sin cambiar el tamaño en píxeles y se eliminan metadatos.</p>
          </div>
          {images.length > 0 && <ul className="max-h-56 divide-y divide-border overflow-auto rounded-lg border border-border bg-background text-xs font-mono">{images.map((image) => <li className="break-all px-4 py-2" key={image.relativePath}>{image.relativePath}</li>)}</ul>}
          <p className="text-sm text-muted-foreground">Los WebP se guardan junto a cada imagen. Si el nombre ya existe, se agrega un número. El original se retira de su ubicación solo después de guardar el backup y el WebP.</p>
        </div>
        <button type="button" onClick={optimize} disabled={busy || !images.length} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? <><Loader2 className="h-4 w-4 animate-spin" />{progress ? `Optimizando ${progress.current}/${progress.total}` : "Leyendo carpeta…"}</> : `Optimizar ${images.length || ""} imágenes a WebP`}</button>
        <div aria-live="polite">
          {error && <p role="alert" className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}
          {summary && <div className="space-y-3 rounded-xl border border-border bg-card p-6">
            <p className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 className="h-4 w-4" />{summary.results.length} convertidas · {summary.errors.length} con error</p>
            {originalBytes > 0 && <p className="text-sm text-muted-foreground">{(originalBytes / 1024 / 1024).toFixed(2)} MB → {(outputBytes / 1024 / 1024).toFixed(2)} MB ({outputBytes <= originalBytes ? `${((1 - outputBytes / originalBytes) * 100).toFixed(1)}% menos` : `${((outputBytes / originalBytes - 1) * 100).toFixed(1)}% más`})</p>}
            <p className="break-all text-sm text-muted-foreground">Backup: {root?.name}/{summary.backupPath}</p>
            <ul className="max-h-56 space-y-1 overflow-auto break-all font-mono text-xs text-muted-foreground">{summary.results.map((item) => <li key={item.from}>{item.from} → {item.to}</li>)}</ul>
            {summary.errors.length > 0 && <ul className="space-y-1 break-all text-xs text-red-400">{summary.errors.map((item) => <li key={item.path}>{item.path}: {item.message}</li>)}</ul>}
          </div>}
        </div>
      </div>
    </div>
  );
}
