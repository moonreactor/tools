"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileImage,
  GripVertical,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { imagesToPdf, type PdfPageSize } from "@/lib/api";
import clsx from "clsx";

type Status = "idle" | "converting" | "done" | "error";

type ImageItem = {
  id: string;
  file: File;
  previewUrl: string;
};

const ACCEPTED_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "bmp",
  "tif",
  "tiff",
  "heic",
  "heif",
];
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TOTAL_SIZE = 100 * 1024 * 1024;
const MAX_FILES = 50;

function isAcceptedImage(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && ACCEPTED_EXTENSIONS.includes(ext)) return true;
  return file.type.startsWith("image/");
}

export default function ImagesToPdfPage() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [pageSize, setPageSize] = useState<PdfPageSize>("a4");
  const [quality, setQuality] = useState(90);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const revokeItems = useCallback((list: ImageItem[]) => {
    list.forEach((item) => URL.revokeObjectURL(item.previewUrl));
  }, []);

  useEffect(() => {
    return () => {
      items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = useCallback(() => {
    setItems((prev) => {
      revokeItems(prev);
      return [];
    });
    setStatus("idle");
    setError(null);
    setDownloadUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (inputRef.current) inputRef.current.value = "";
  }, [revokeItems]);

  const addFiles = useCallback(
    (selected: FileList | File[]) => {
      const incoming = Array.from(selected);
      const rejected: string[] = [];
      const accepted: File[] = [];

      for (const file of incoming) {
        if (!isAcceptedImage(file)) {
          rejected.push(`${file.name}: formato no soportado`);
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          rejected.push(`${file.name}: supera 20 MB`);
          continue;
        }
        accepted.push(file);
      }

      setItems((prev) => {
        const remainingSlots = MAX_FILES - prev.length;
        if (remainingSlots <= 0) {
          rejected.push(`Máximo ${MAX_FILES} imágenes`);
          return prev;
        }

        const toAdd = accepted.slice(0, remainingSlots);
        if (accepted.length > remainingSlots) {
          rejected.push(`Solo se agregaron ${remainingSlots} imágenes (máximo ${MAX_FILES})`);
        }

        const currentTotal = prev.reduce((sum, item) => sum + item.file.size, 0);
        const withinQuota: File[] = [];
        let running = currentTotal;
        for (const file of toAdd) {
          if (running + file.size > MAX_TOTAL_SIZE) {
            rejected.push(`${file.name}: el total superaría 100 MB`);
            continue;
          }
          running += file.size;
          withinQuota.push(file);
        }

        const next = [
          ...prev,
          ...withinQuota.map((file) => ({
            id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
            file,
            previewUrl: URL.createObjectURL(file),
          })),
        ];
        return next;
      });

      setError(rejected.length ? rejected.join(". ") : null);
      setStatus("idle");
      setDownloadUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    },
    []
  );

  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
    setStatus("idle");
    setDownloadUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  };

  const moveItem = (from: number, to: number) => {
    setItems((prev) => {
      if (to < 0 || to >= prev.length || from === to) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setStatus("idle");
    setDownloadUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const onGenerate = async () => {
    if (!items.length) return;

    setStatus("converting");
    setError(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);

    try {
      const blob = await imagesToPdf(
        items.map((item) => item.file),
        pageSize,
        quality
      );
      setDownloadUrl(URL.createObjectURL(blob));
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar el PDF");
      setStatus("error");
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-primary">
          <FileImage className="h-5 w-5" />
          <span className="text-sm font-medium">Herramienta</span>
        </div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Imágenes a PDF</h1>
        <p className="text-muted-foreground">
          Subí varias fotos y armá un PDF con cada imagen en una página distinta.
        </p>
      </div>

      <div className="mx-auto max-w-3xl space-y-6">
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
          <Upload className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <p className="mb-2 font-medium">
            Arrastrá varias imágenes o hacé clic para seleccionar
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            JPG, PNG, WEBP, HEIC y más — hasta {MAX_FILES} archivos, 20 MB c/u
          </p>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
            <Upload className="h-4 w-4" />
            Seleccionar imágenes
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.gif,.bmp,.tif,.tiff,.heic,.heif,image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        {items.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm font-medium">
                {items.length} {items.length === 1 ? "imagen" : "imágenes"} · el orden
                es el de las páginas
              </p>
              <button
                type="button"
                onClick={reset}
                className="min-h-11 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Quitar todas
              </button>
            </div>

            <ul className="space-y-2">
              {items.map((item, index) => (
                <li
                  key={item.id}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragIndex === null || dragIndex === index) return;
                    moveItem(dragIndex, index);
                    setDragIndex(index);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  className={clsx(
                    "flex items-center gap-3 rounded-lg border border-border bg-background p-2 transition-colors",
                    dragIndex === index && "border-primary bg-primary/10"
                  )}
                >
                  <span
                    className="hidden shrink-0 cursor-grab text-muted-foreground sm:block"
                    aria-hidden
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <span className="w-6 shrink-0 text-center text-xs font-medium text-muted-foreground">
                    {index + 1}
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.previewUrl}
                    alt={`Vista previa de ${item.file.name}`}
                    className="h-12 w-12 shrink-0 rounded-md bg-muted object-cover"
                    onError={(event) => {
                      event.currentTarget.style.visibility = "hidden";
                    }}
                  />
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium">{item.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(item.file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveItem(index, index - 1)}
                      disabled={index === 0}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                      aria-label="Subir en el orden"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveItem(index, index + 1)}
                      disabled={index === items.length - 1}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                      aria-label="Bajar en el orden"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={`Quitar ${item.file.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-5 rounded-xl border border-border bg-card p-6">
          <div>
            <label className="mb-2 block text-sm font-medium">Tamaño de página</label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(
                [
                  { id: "a4", label: "A4" },
                  { id: "letter", label: "Carta" },
                  { id: "auto", label: "Al tamaño de la imagen" },
                ] as { id: PdfPageSize; label: string }[]
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setPageSize(option.id)}
                  className={clsx(
                    "min-h-11 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                    pageSize === option.id
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:border-muted-foreground/30"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              En A4 y Carta cada foto se centra y se ajusta sin recortar. En automático,
              cada página toma el tamaño de su imagen.
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="pdf-quality" className="text-sm font-medium">
                Calidad
              </label>
              <span className="text-sm text-muted-foreground">{quality}%</span>
            </div>
            <input
              id="pdf-quality"
              type="range"
              min={1}
              max={100}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
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
            onClick={onGenerate}
            disabled={!items.length || status === "converting"}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "converting" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generando PDF...
              </>
            ) : (
              <>
                <FileImage className="h-4 w-4" />
                Generar PDF
              </>
            )}
          </button>

          {status === "done" && downloadUrl && (
            <a
              href={downloadUrl}
              download="imagenes.pdf"
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
            PDF listo con {items.length} {items.length === 1 ? "página" : "páginas"}
          </div>
        )}
      </div>
    </div>
  );
}
