"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { convertGifFile } from "@/lib/api";
import {
  pickLocalFolder,
  replaceGifWithJpg,
  supportsDirectoryPicker,
  type LocalGifEntry,
} from "@/lib/localFolder";

type Status = "idle" | "loading" | "done" | "error";

type ConvertSummary = {
  converted: number;
  failed: number;
  results: { from: string; to: string }[];
  errors: { path: string; error: string }[];
};

export default function GifToJpgPage() {
  const pickerSupported = useMemo(() => supportsDirectoryPicker(), []);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [gifs, setGifs] = useState<LocalGifEntry[]>([]);
  const [quality, setQuality] = useState(90);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ConvertSummary | null>(null);

  const onPickFolder = async () => {
    setError(null);
    setSummary(null);
    setStatus("idle");
    setProgress(null);

    try {
      const { folderName: name, gifs: found } = await pickLocalFolder();
      setFolderName(name);
      setGifs(found);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setError(err instanceof Error ? err.message : "No se pudo abrir la carpeta");
    }
  };

  const onConvert = async () => {
    if (gifs.length === 0) return;

    const confirmed = window.confirm(
      `Se van a convertir ${gifs.length} GIF(s) a JPG en la carpeta "${folderName}".\n\nSe eliminarán los .gif originales y se escribirán los .jpg en el mismo lugar.\n\n¿Continuar?`
    );
    if (!confirmed) return;

    setStatus("loading");
    setError(null);
    setSummary(null);
    setProgress({ current: 0, total: gifs.length });

    const results: { from: string; to: string }[] = [];
    const errors: { path: string; error: string }[] = [];

    for (let i = 0; i < gifs.length; i += 1) {
      const entry = gifs[i];
      setProgress({ current: i + 1, total: gifs.length });

      try {
        const file = await entry.fileHandle.getFile();
        const jpgBlob = await convertGifFile(file, quality);
        await replaceGifWithJpg(entry, jpgBlob);
        results.push({
          from: entry.relativePath,
          to: entry.relativePath.replace(/\.gif$/i, ".jpg"),
        });
      } catch (err) {
        errors.push({
          path: entry.relativePath,
          error: err instanceof Error ? err.message : "Error desconocido",
        });
      }
    }

    setSummary({
      converted: results.length,
      failed: errors.length,
      results,
      errors,
    });
    setGifs([]);
    setStatus("done");
    setProgress(null);
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-primary">
          <FolderOpen className="h-5 w-5" />
          <span className="text-sm font-medium">Herramienta</span>
        </div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight">GIF a JPG (carpeta)</h1>
        <p className="text-muted-foreground">
          Seleccioná una carpeta de tu computadora. Se buscan todos los .gif (incluye
          subcarpetas), se convierten a .jpg y se reemplazan los originales.
        </p>
      </div>

      <div className="mx-auto max-w-3xl space-y-6">
        {!pickerSupported && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Tu navegador no soporta el selector de carpetas. Abrí esta tool en{" "}
            <strong>Chrome</strong> o <strong>Edge</strong>.
          </div>
        )}

        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <button
            type="button"
            onClick={onPickFolder}
            disabled={!pickerSupported || status === "loading"}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FolderOpen className="h-4 w-4" />
            Elegir carpeta
          </button>

          {folderName && (
            <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm">
              <span className="text-muted-foreground">Carpeta seleccionada: </span>
              <span className="font-medium">{folderName}</span>
              <span className="text-muted-foreground">
                {" "}
                — {gifs.length} GIF(s) encontrados
              </span>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium">Calidad JPEG</label>
              <span className="text-sm text-muted-foreground">{quality}%</span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="w-full accent-primary"
              disabled={status === "loading"}
            />
          </div>

          {gifs.length > 0 && (
            <div className="max-h-56 overflow-auto rounded-lg border border-border bg-background">
              <ul className="divide-y divide-border text-sm">
                {gifs.map((file) => (
                  <li
                    key={file.relativePath}
                    className="flex items-center justify-between gap-3 px-4 py-2"
                  >
                    <span className="truncate font-mono text-xs">{file.relativePath}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {(file.sizeBytes / 1024).toFixed(1)} KB
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onConvert}
          disabled={gifs.length === 0 || status === "loading"}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90"
        >
          {status === "loading" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Convirtiendo {progress ? `${progress.current}/${progress.total}` : "..."}
            </>
          ) : (
            <>
              <ImageIcon className="h-4 w-4" />
              Convertir {gifs.length || ""} GIF → JPG
            </>
          )}
        </button>

        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {status === "done" && summary && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-3">
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              <p className="text-sm font-medium">
                Listo: {summary.converted} convertidos
                {summary.failed > 0 ? `, ${summary.failed} con error` : ""}
              </p>
            </div>
            {summary.results.length > 0 && (
              <ul className="max-h-40 overflow-auto space-y-1 text-xs font-mono text-muted-foreground">
                {summary.results.map((item) => (
                  <li key={item.from}>
                    {item.from} → {item.to}
                  </li>
                ))}
              </ul>
            )}
            {summary.errors.length > 0 && (
              <ul className="space-y-1 text-xs text-red-400">
                {summary.errors.map((item) => (
                  <li key={item.path}>
                    {item.path}: {item.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
