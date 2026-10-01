"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileText,
  Loader2,
  Music,
  AlertCircle,
  Clock,
  X,
  Youtube,
  Video,
} from "lucide-react";
import clsx from "clsx";
import {
  downloadYoutubeAudio,
  downloadYoutubeVideo,
  fetchYoutubeInfo,
  fetchYoutubePreview,
  fetchYoutubeTranscript,
  type YoutubePreview,
  type YoutubeVideoQuality,
} from "@/lib/api";

type Mode = "video" | "audio" | "transcript";
type Status = "idle" | "loading" | "done" | "error";

const QUALITY_OPTIONS: { id: YoutubeVideoQuality; label: string }[] = [
  { id: "best", label: "Mejor" },
  { id: "2160", label: "2160p" },
  { id: "1440", label: "1440p" },
  { id: "1080", label: "1080p" },
  { id: "720", label: "720p" },
  { id: "480", label: "480p" },
  { id: "360", label: "360p" },
];

function parseTimestamp(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  if (!/^\d{1,3}(?::[0-5]?\d){0,2}$/.test(raw)) return NaN;

  const parts = raw.split(":").map(Number);
  if (parts.some((part) => Number.isNaN(part))) return NaN;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

export default function YoutubeDownloaderPage() {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<Mode>("video");
  const [audioFormat, setAudioFormat] = useState<"mp3">("mp3");
  const [videoQuality, setVideoQuality] = useState<YoutubeVideoQuality>("best");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [cookiesConfigured, setCookiesConfigured] = useState<boolean | null>(null);
  const [preview, setPreview] = useState<YoutubePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string | null>(null);

  const [transcriptText, setTranscriptText] = useState<string | null>(null);
  const [transcriptDownloadUrl, setTranscriptDownloadUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copyTranscript = async () => {
    if (!transcriptText) return;
    try {
      await navigator.clipboard.writeText(transcriptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("No se pudo copiar al portapapeles");
    }
  };

  const canSubmit = useMemo(() => url.trim().length > 0 && status !== "loading", [url, status]);

  const reset = () => {
    setStatus("idle");
    setError(null);
    setTranscriptText(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    if (transcriptDownloadUrl) URL.revokeObjectURL(transcriptDownloadUrl);
    setDownloadUrl(null);
    setDownloadFilename(null);
    setTranscriptDownloadUrl(null);
  };

  useEffect(() => {
    fetchYoutubeInfo()
      .then((info) => setCookiesConfigured(info.cookies_configured))
      .catch(() => setCookiesConfigured(false));
  }, []);

  useEffect(() => {
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      setPreview(null);
      setPreviewLoading(false);
      return;
    }

    setPreviewLoading(true);
    const timer = setTimeout(() => {
      fetchYoutubePreview(cleanUrl)
        .then(setPreview)
        .catch(() => setPreview(null))
        .finally(() => setPreviewLoading(false));
    }, 500);

    return () => clearTimeout(timer);
  }, [url]);

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      if (transcriptDownloadUrl) URL.revokeObjectURL(transcriptDownloadUrl);
    };
  }, [downloadUrl, transcriptDownloadUrl]);

  const onConvert = async () => {
    const cleanUrl = url.trim();
    if (!cleanUrl) return;

    const startSeconds = parseTimestamp(startTime);
    const endSeconds = parseTimestamp(endTime);
    if (startTime.trim() && Number.isNaN(startSeconds as number)) {
      setError("El minuto de inicio no es válido. Usá MM:SS, por ejemplo 41:52");
      setStatus("error");
      return;
    }
    if (endTime.trim() && Number.isNaN(endSeconds as number)) {
      setError("El minuto de fin no es válido. Usá MM:SS, por ejemplo 53:04");
      setStatus("error");
      return;
    }
    if (
      startSeconds !== null &&
      endSeconds !== null &&
      !Number.isNaN(startSeconds) &&
      !Number.isNaN(endSeconds) &&
      endSeconds <= startSeconds
    ) {
      setError("El minuto de fin tiene que ser posterior al de inicio");
      setStatus("error");
      return;
    }

    const clip = {
      startTime: startTime.trim() || undefined,
      endTime: endTime.trim() || undefined,
    };

    reset();
    setStatus("loading");

    try {
      if (mode === "video") {
        const { blob, filename } = await downloadYoutubeVideo(cleanUrl, clip, videoQuality);
        const objectUrl = URL.createObjectURL(blob);
        setDownloadUrl(objectUrl);
        setDownloadFilename(filename);
      } else if (mode === "audio") {
        const { blob, filename } = await downloadYoutubeAudio(cleanUrl, audioFormat, clip);
        const objectUrl = URL.createObjectURL(blob);
        setDownloadUrl(objectUrl);
        setDownloadFilename(filename);
      } else {
        const { text } = await fetchYoutubeTranscript(cleanUrl, undefined, clip);
        setTranscriptText(text);

        const b = new Blob([text], { type: "text/plain;charset=utf-8" });
        const objectUrl = URL.createObjectURL(b);
        setTranscriptDownloadUrl(objectUrl);
      }

      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al procesar la solicitud");
      setStatus("error");
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-primary">
          <Youtube className="h-5 w-5" />
          <span className="text-sm font-medium">Herramienta</span>
        </div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Descargador YouTube</h1>
        <p className="text-muted-foreground">
          Descargá video o audio, o obtené la transcripción. Podés recortar un tramo, por
          ejemplo del 41:52 al 53:04.
        </p>
      </div>

      <div className="mx-auto max-w-3xl space-y-6">
        {/* Input */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Link de YouTube</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>

          {(previewLoading || preview) && (
            <div className="overflow-hidden rounded-lg border border-border bg-background">
              {previewLoading && !preview ? (
                <div className="flex items-center gap-3 px-4 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando vista previa...
                </div>
              ) : preview ? (
                <div className="flex flex-col sm:flex-row">
                  <div className="relative aspect-video w-full shrink-0 sm:w-64">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preview.thumbnail_url}
                      alt={preview.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex flex-1 flex-col justify-center gap-2 p-4">
                    <p className="line-clamp-2 font-medium leading-snug">{preview.title}</p>
                    {preview.author && (
                      <p className="text-sm text-muted-foreground">{preview.author}</p>
                    )}
                    <a
                      href={preview.watch_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      Ver en YouTube
                    </a>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Mode */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Qué querés obtener</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <button
                onClick={() => setMode("video")}
                type="button"
                className={clsx(
                  "rounded-lg border px-3 py-3 text-sm font-medium transition-colors",
                  mode === "video"
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-muted-foreground/30"
                )}
              >
                <div className="flex items-center justify-center gap-2">
                  <Video className="h-4 w-4" />
                  Video (MP4)
                </div>
              </button>

              <button
                onClick={() => setMode("audio")}
                type="button"
                className={clsx(
                  "rounded-lg border px-3 py-3 text-sm font-medium transition-colors",
                  mode === "audio"
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-muted-foreground/30"
                )}
              >
                <div className="flex items-center justify-center gap-2">
                  <Music className="h-4 w-4" />
                  Audio (MP3)
                </div>
              </button>

              <button
                onClick={() => setMode("transcript")}
                type="button"
                className={clsx(
                  "rounded-lg border px-3 py-3 text-sm font-medium transition-colors",
                  mode === "transcript"
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-muted-foreground/30"
                )}
              >
                <div className="flex items-center justify-center gap-2">
                  <FileText className="h-4 w-4" />
                  Transcripción
                </div>
              </button>
            </div>
          </div>

          {mode === "video" && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Calidad de video</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {QUALITY_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setVideoQuality(option.id)}
                    className={clsx(
                      "min-h-11 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                      videoQuality === option.id
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-muted-foreground/30"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Si el video no tiene esa resolución, se usa la más alta disponible por debajo.
              </p>
            </div>
          )}

          {mode === "audio" && (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Formato de audio</label>
                <select
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  value={audioFormat}
                  onChange={(e) => setAudioFormat(e.target.value as "mp3")}
                >
                  <option value="mp3">MP3</option>
                </select>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border bg-background p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium">Recortar fragmento (opcional)</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm text-muted-foreground">Desde</span>
                <input
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  placeholder="41:52"
                  aria-label="Minuto de inicio"
                  className="w-full rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm text-muted-foreground">Hasta</span>
                <input
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  placeholder="53:04"
                  aria-label="Minuto de fin"
                  className="w-full rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Formato MM:SS o HH:MM:SS. Si los dejás vacíos, se descarga el video completo.
              En lives recién terminados puede tardar bastante: primero baja el video entero
              y después corta el tramo (YouTube todavía lo está procesando).
            </p>
          </div>

          {mode !== "transcript" && cookiesConfigured !== null && (
            <div
              className={clsx(
                "rounded-lg border px-4 py-3 text-sm",
                cookiesConfigured
                  ? "border-green-500/30 bg-green-500/10 text-green-400"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-300"
              )}
            >
              {cookiesConfigured
                ? "Cookies disponibles como respaldo si YouTube pide inicio de sesión. La descarga de alta calidad se hace sin cookies."
                : "Cookies no detectadas. Solo hacen falta si un video pide inicio de sesión: make youtube-cookies."}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onConvert}
            disabled={!canSubmit}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90"
          >
            {status === "loading" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Procesando... (en lives puede demorar varios minutos)
              </>
            ) : (
              <>
                <Youtube className="h-4 w-4" />
                Procesar
              </>
            )}
          </button>

          <button
            onClick={reset}
            type="button"
            className="rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Reiniciar"
            disabled={status === "loading"}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Result */}
        {status === "done" && mode !== "transcript" && downloadUrl && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="text-sm text-muted-foreground">
              Listo. Descargá el archivo generado:
            </div>
            <a
              href={downloadUrl}
              download={downloadFilename || undefined}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary bg-primary/10 px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
            >
              <Download className="h-4 w-4" />
              Descargar
            </a>
          </div>
        )}

        {status === "done" && mode === "transcript" && transcriptText && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Transcripción</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyTranscript}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/70"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-green-500" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copiar
                    </>
                  )}
                </button>
                {transcriptDownloadUrl && (
                  <a
                    href={transcriptDownloadUrl}
                    download="transcripcion.txt"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
                  >
                    <Download className="h-4 w-4" />
                    Descargar .txt
                  </a>
                )}
              </div>
            </div>
            <textarea
              readOnly
              value={transcriptText}
              className="h-72 w-full resize-none rounded-lg border border-border bg-background px-4 py-3 text-sm leading-relaxed outline-none"
            />
          </div>
        )}

        {status === "done" && mode === "transcript" && !transcriptText && (
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            No se pudo obtener la transcripción.
          </div>
        )}
      </div>
    </div>
  );
}

