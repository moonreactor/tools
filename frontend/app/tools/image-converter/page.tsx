"use client";

import { useCallback, useState } from "react";
import {
  Upload,
  Download,
  ImageIcon,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";
import { convertImage } from "@/lib/api";
import clsx from "clsx";

type OutputFormat = "jpg" | "png";
type Status = "idle" | "converting" | "done" | "error";

const ACCEPTED_EXTENSIONS = ["heic", "heif", "avif", "webp"];
const ACCEPT_ATTR =
  ".heic,.heif,.avif,.webp,image/heic,image/heif,image/avif,image/webp";

export default function ImageConverterPage() {
  const [file, setFile] = useState<File | null>(null);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("jpg");
  const [quality, setQuality] = useState(90);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const reset = useCallback(() => {
    setFile(null);
    setStatus("idle");
    setError(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
  }, [downloadUrl]);

  const handleFile = useCallback(
    (selected: File) => {
      const ext = selected.name.split(".").pop()?.toLowerCase();
      if (!ext || !ACCEPTED_EXTENSIONS.includes(ext)) {
        setError("Solo se aceptan archivos HEIC, HEIF, AVIF o WEBP");
        return;
      }
      if (selected.size > 50 * 1024 * 1024) {
        setError("El archivo supera el límite de 50 MB");
        return;
      }
      reset();
      setFile(selected);
      setError(null);
    },
    [reset]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFile(dropped);
    },
    [handleFile]
  );

  const onConvert = async () => {
    if (!file) return;

    setStatus("converting");
    setError(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);

    try {
      const blob = await convertImage(file, outputFormat, quality);
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al convertir");
      setStatus("error");
    }
  };

  const downloadFilename = file
    ? `${file.name.replace(/\.[^.]+$/, "")}.${outputFormat}`
    : `converted.${outputFormat}`;

  return (
    <div className="p-8">
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-primary">
          <ImageIcon className="h-5 w-5" />
          <span className="text-sm font-medium">Herramienta</span>
        </div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight">
          Conversor de imágenes
        </h1>
        <p className="text-muted-foreground">
          Convertí fotos HEIC, AVIF o WEBP a JPG o PNG de forma rápida.
        </p>
      </div>

      <div className="mx-auto max-w-2xl space-y-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={clsx(
            "relative rounded-xl border-2 border-dashed p-10 text-center transition-colors",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border bg-card hover:border-muted-foreground/30"
          )}
        >
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <ImageIcon className="h-8 w-8 text-primary" />
              <div className="text-left">
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <button
                onClick={reset}
                className="ml-4 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Quitar archivo"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
              <p className="mb-2 font-medium">
                Arrastrá una imagen o hacé clic para seleccionar
              </p>
              <p className="mb-4 text-sm text-muted-foreground">
                HEIC, HEIF, AVIF, WEBP — máximo 50 MB
              </p>
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
                <Upload className="h-4 w-4" />
                Seleccionar archivo
                <input
                  type="file"
                  accept={ACCEPT_ATTR}
                  className="hidden"
                  onChange={(e) => {
                    const selected = e.target.files?.[0];
                    if (selected) handleFile(selected);
                  }}
                />
              </label>
            </>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium">
              Formato de salida
            </label>
            <div className="flex gap-3">
              {(["jpg", "png"] as OutputFormat[]).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setOutputFormat(fmt)}
                  className={clsx(
                    "min-h-11 flex-1 rounded-lg border py-2.5 text-sm font-medium uppercase transition-colors",
                    outputFormat === fmt
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:border-muted-foreground/30"
                  )}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          {outputFormat === "jpg" && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="jpg-quality" className="text-sm font-medium">
                  Calidad JPEG
                </label>
                <span className="text-sm text-muted-foreground">{quality}%</span>
              </div>
              <input
                id="jpg-quality"
                type="range"
                min={1}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onConvert}
            disabled={!file || status === "converting"}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90"
          >
            {status === "converting" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Convirtiendo...
              </>
            ) : (
              <>
                <ImageIcon className="h-4 w-4" />
                Convertir
              </>
            )}
          </button>

          {status === "done" && downloadUrl && (
            <a
              href={downloadUrl}
              download={downloadFilename}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary bg-primary/10 px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
            >
              <Download className="h-4 w-4" />
              Descargar
            </a>
          )}
        </div>

        {status === "done" && (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            Conversión completada
          </div>
        )}
      </div>
    </div>
  );
}
