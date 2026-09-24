export interface Tool {
  id: string;
  name: string;
  description: string;
  path: string;
  icon: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchTools(): Promise<Tool[]> {
  const res = await fetch(`${API_URL}/api/tools`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch tools");
  const data = await res.json();
  return data.tools;
}

export function getApiUrl(): string {
  return API_URL;
}

export async function convertImage(
  file: File,
  outputFormat: "jpg" | "png",
  quality: number
): Promise<Blob> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("output_format", outputFormat);
  formData.append("quality", String(quality));

  const res = await fetch(`${API_URL}/api/tools/image-converter/convert`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Conversion failed" }));
    throw new Error(error.detail || "Conversion failed");
  }

  return res.blob();
}

export type PdfPageSize = "auto" | "a4" | "letter";

function errorMessageFromResponse(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const detail = (error as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string };
    if (first?.msg) return first.msg;
  }
  return fallback;
}

export async function imagesToPdf(
  files: File[],
  pageSize: PdfPageSize,
  quality: number
): Promise<Blob> {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  formData.append("page_size", pageSize);
  formData.append("quality", String(quality));

  const res = await fetch(`${API_URL}/api/tools/images-to-pdf/convert`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "PDF generation failed" }));
    throw new Error(errorMessageFromResponse(error, "PDF generation failed"));
  }

  return res.blob();
}

function filenameFromContentDisposition(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;

  // Prefer RFC 5987: filename*=UTF-8''...
  const extStar = contentDisposition.match(/filename\*\s*=\s*(?:UTF-8'')?["']?([^"';\n]+)["']?/i);
  if (extStar?.[1]) {
    try {
      return decodeURIComponent(extStar[1]);
    } catch {
      return extStar[1];
    }
  }

  // Fallback: filename="..."
  const ext = contentDisposition.match(/filename\s*=\s*["']?([^"';\n]+)["']?/i);
  return ext?.[1] || null;
}

export type YoutubeVideoQuality = "best" | "2160" | "1440" | "1080" | "720" | "480" | "360";

export async function downloadYoutubeVideo(
  url: string,
  clip?: { startTime?: string; endTime?: string },
  quality: YoutubeVideoQuality = "best"
): Promise<{ blob: Blob; filename: string }> {
  const formData = new FormData();
  formData.append("url", url);
  formData.append("quality", quality);
  if (clip?.startTime) formData.append("start_time", clip.startTime);
  if (clip?.endTime) formData.append("end_time", clip.endTime);

  const res = await fetch(`${API_URL}/api/tools/youtube-downloader/video`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Download failed" }));
    throw new Error(error.detail || "Download failed");
  }

  const blob = await res.blob();
  const filename =
    filenameFromContentDisposition(res.headers.get("content-disposition")) || "youtube-video.mp4";
  return { blob, filename };
}

export async function downloadYoutubeAudio(
  url: string,
  audioFormat: "mp3" = "mp3",
  clip?: { startTime?: string; endTime?: string }
): Promise<{ blob: Blob; filename: string }> {
  const formData = new FormData();
  formData.append("url", url);
  formData.append("audio_format", audioFormat);
  if (clip?.startTime) formData.append("start_time", clip.startTime);
  if (clip?.endTime) formData.append("end_time", clip.endTime);

  const res = await fetch(`${API_URL}/api/tools/youtube-downloader/audio`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Download failed" }));
    throw new Error(error.detail || "Download failed");
  }

  const blob = await res.blob();
  const filename =
    filenameFromContentDisposition(res.headers.get("content-disposition")) || "youtube-audio.mp3";
  return { blob, filename };
}

export interface YoutubePreview {
  video_id: string;
  title: string;
  author: string | null;
  thumbnail_url: string;
  watch_url: string;
}

export interface YoutubeDownloaderInfo {
  cookies_configured: boolean;
  cookies_path: string;
}

export async function fetchYoutubePreview(url: string): Promise<YoutubePreview> {
  const params = new URLSearchParams({ url });
  const res = await fetch(`${API_URL}/api/tools/youtube-downloader/preview?${params}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Preview failed" }));
    throw new Error(error.detail || "Preview failed");
  }

  return res.json();
}

export async function fetchYoutubeInfo(): Promise<YoutubeDownloaderInfo> {
  const res = await fetch(`${API_URL}/api/tools/youtube-downloader/info`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch YouTube tool info");
  const data = await res.json();
  return {
    cookies_configured: Boolean(data.cookies_configured),
    cookies_path: data.cookies_path as string,
  };
}

export async function fetchYoutubeTranscript(
  url: string,
  language?: string,
  clip?: { startTime?: string; endTime?: string }
): Promise<{ text: string }> {
  const formData = new FormData();
  formData.append("url", url);
  if (language) formData.append("language", language);
  if (clip?.startTime) formData.append("start_time", clip.startTime);
  if (clip?.endTime) formData.append("end_time", clip.endTime);

  const res = await fetch(`${API_URL}/api/tools/youtube-downloader/transcript`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Transcript failed" }));
    throw new Error(error.detail || "Transcript failed");
  }

  const data = await res.json();
  return { text: data.text as string };
}

export async function convertGifFile(file: File, quality = 90): Promise<Blob> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("quality", String(quality));

  const res = await fetch(`${API_URL}/api/tools/gif-to-jpg/convert-file`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Conversion failed" }));
    throw new Error(errorMessageFromResponse(error, "Conversion failed"));
  }

  return res.blob();
}
