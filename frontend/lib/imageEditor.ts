export type AspectRatioMode = "free" | "1:1" | "4:3" | "3:2" | "16:9" | "9:16";

export type ImageFilter = "none" | "grayscale" | "sepia" | "invert" | "vintage";

export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type EditorAdjustments = {
  brightness: number; // 0–200, 100 = neutral
  contrast: number;
  saturation: number;
  warmth: number; // -100..100, 0 = neutral
};

export type ExportOptions = {
  crop: CropRect;
  adjustments: EditorAdjustments;
  filter: ImageFilter;
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  mimeType: string;
  quality?: number;
};

export type ImageSource = HTMLImageElement | HTMLCanvasElement;

export const ACCEPTED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];
export const ACCEPTED_IMAGE_ATTR =
  ".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif";

export const ASPECT_RATIO_OPTIONS: { id: AspectRatioMode; label: string; value: number | null }[] =
  [
    { id: "free", label: "Libre", value: null },
    { id: "1:1", label: "1:1", value: 1 },
    { id: "4:3", label: "4:3", value: 4 / 3 },
    { id: "3:2", label: "3:2", value: 3 / 2 },
    { id: "16:9", label: "16:9", value: 16 / 9 },
    { id: "9:16", label: "9:16", value: 9 / 16 },
  ];

export const FILTER_OPTIONS: { id: ImageFilter; label: string }[] = [
  { id: "none", label: "Original" },
  { id: "grayscale", label: "B&N" },
  { id: "sepia", label: "Sepia" },
  { id: "invert", label: "Invertir" },
  { id: "vintage", label: "Vintage" },
];

export const DEFAULT_ADJUSTMENTS: EditorAdjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  warmth: 0,
};

export function isAcceptedImageFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && ACCEPTED_IMAGE_EXTENSIONS.includes(ext)) return true;
  return ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type);
}

export function isUnsupportedImageHint(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (["heic", "heif", "avif"].includes(ext)) {
    return "HEIC/AVIF no se puede editar acá. Convertilo primero con el Conversor de imágenes.";
  }
  return null;
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo cargar la imagen"));
    };
    img.src = url;
  });
}

export function getSourceSize(source: ImageSource): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

/** Normalize any image source into a canvas working bitmap. */
export function sourceToCanvas(source: ImageSource): HTMLCanvasElement {
  const { width, height } = getSourceSize(source);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.drawImage(source, 0, 0);
  return canvas;
}

export function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.drawImage(source, 0, 0);
  return canvas;
}

export function defaultCrop(width: number, height: number): CropRect {
  return { x: 0, y: 0, width, height };
}

/** Centered inset crop (~88%) so the frame is visible on open. */
export function insetCrop(width: number, height: number, ratio = 0.88): CropRect {
  const w = Math.max(1, width * ratio);
  const h = Math.max(1, height * ratio);
  return {
    x: (width - w) / 2,
    y: (height - h) / 2,
    width: w,
    height: h,
  };
}

export function isFullCrop(crop: CropRect, imageWidth: number, imageHeight: number): boolean {
  return (
    crop.x <= 0.5 &&
    crop.y <= 0.5 &&
    Math.abs(crop.width - imageWidth) < 1 &&
    Math.abs(crop.height - imageHeight) < 1
  );
}

export function getAspectRatioValue(mode: AspectRatioMode): number | null {
  return ASPECT_RATIO_OPTIONS.find((o) => o.id === mode)?.value ?? null;
}

export function constrainCropToAspect(
  crop: CropRect,
  imageWidth: number,
  imageHeight: number,
  aspect: number | null
): CropRect {
  if (!aspect) {
    return clampCrop(crop, imageWidth, imageHeight);
  }

  let { x, y, width, height } = crop;
  const current = width / height;

  if (Math.abs(current - aspect) < 0.001) {
    return clampCrop(crop, imageWidth, imageHeight);
  }

  if (current > aspect) {
    width = height * aspect;
  } else {
    height = width / aspect;
  }

  if (width > imageWidth) {
    width = imageWidth;
    height = width / aspect;
  }
  if (height > imageHeight) {
    height = imageHeight;
    width = height * aspect;
  }

  x = Math.min(x, imageWidth - width);
  y = Math.min(y, imageHeight - height);
  x = Math.max(0, x);
  y = Math.max(0, y);

  return { x, y, width, height };
}

export function clampCrop(
  crop: CropRect,
  imageWidth: number,
  imageHeight: number
): CropRect {
  let { x, y, width, height } = crop;
  width = Math.max(1, Math.min(width, imageWidth));
  height = Math.max(1, Math.min(height, imageHeight));
  x = Math.max(0, Math.min(x, imageWidth - width));
  y = Math.max(0, Math.min(y, imageHeight - height));
  return { x, y, width, height };
}

export function centeredCropForAspect(
  imageWidth: number,
  imageHeight: number,
  aspect: number
): CropRect {
  let width = imageWidth;
  let height = width / aspect;
  if (height > imageHeight) {
    height = imageHeight;
    width = height * aspect;
  }
  const x = (imageWidth - width) / 2;
  const y = (imageHeight - height) / 2;
  return { x, y, width, height };
}

export function buildCssFilter(
  adjustments: EditorAdjustments,
  filter: ImageFilter,
  options?: { skipAdjustments?: boolean; skipFilter?: boolean }
): string {
  const parts: string[] = [];

  if (!options?.skipAdjustments) {
    parts.push(
      `brightness(${adjustments.brightness / 100})`,
      `contrast(${adjustments.contrast / 100})`,
      `saturate(${adjustments.saturation / 100})`
    );
    if (adjustments.warmth !== 0) {
      const w = adjustments.warmth / 100;
      if (w > 0) {
        parts.push(`sepia(${w * 0.35})`, `hue-rotate(${-w * 12}deg)`);
      } else {
        parts.push(`hue-rotate(${-w * 25}deg)`, `saturate(${1 + Math.abs(w) * 0.15})`);
      }
    }
  }

  if (!options?.skipFilter) {
    switch (filter) {
      case "grayscale":
        parts.push("grayscale(1)");
        break;
      case "sepia":
        parts.push("sepia(1)");
        break;
      case "invert":
        parts.push("invert(1)");
        break;
      case "vintage":
        parts.push("sepia(0.45)", "contrast(1.1)", "brightness(0.95)");
        break;
      default:
        break;
    }
  }

  return parts.join(" ") || "none";
}

export function outputMimeAndExt(
  originalName: string,
  originalType: string
): { mimeType: string; ext: string } {
  const lower = originalName.toLowerCase();
  if (lower.endsWith(".png") || originalType === "image/png") {
    return { mimeType: "image/png", ext: "png" };
  }
  if (lower.endsWith(".webp") || originalType === "image/webp") {
    return { mimeType: "image/webp", ext: "webp" };
  }
  return { mimeType: "image/jpeg", ext: "jpg" };
}

export function editedFilename(originalName: string, ext: string): string {
  const base = originalName.replace(/\.[^.]+$/, "") || "image";
  return `${base}_edited.${ext}`;
}

export function drawTransformedSource(
  source: ImageSource,
  rotation: 0 | 90 | 180 | 270,
  flipH: boolean,
  flipV: boolean
): HTMLCanvasElement {
  const { width: sw, height: sh } = getSourceSize(source);
  const swap = rotation === 90 || rotation === 270;
  const outW = swap ? sh : sw;
  const outH = swap ? sw : sh;

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");

  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(source, -sw / 2, -sh / 2, sw, sh);

  return canvas;
}

export function getTransformedSize(
  width: number,
  height: number,
  rotation: 0 | 90 | 180 | 270
): { width: number; height: number } {
  if (rotation === 90 || rotation === 270) {
    return { width: height, height: width };
  }
  return { width, height };
}

/** Bake transform + crop into a new working bitmap (no color adjustments). */
export function applyCropToSource(
  source: ImageSource,
  crop: CropRect,
  rotation: 0 | 90 | 180 | 270,
  flipH: boolean,
  flipV: boolean
): HTMLCanvasElement {
  const transformed = drawTransformedSource(source, rotation, flipH, flipV);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(crop.width));
  out.height = Math.max(1, Math.round(crop.height));
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.drawImage(
    transformed,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    out.width,
    out.height
  );
  return out;
}

export async function exportEditedImage(
  source: ImageSource,
  options: ExportOptions
): Promise<Blob> {
  const transformed = drawTransformedSource(
    source,
    options.rotation,
    options.flipH,
    options.flipV
  );

  const { crop, adjustments, filter, mimeType, quality = 0.92 } = options;
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(crop.width));
  out.height = Math.max(1, Math.round(crop.height));
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");

  ctx.filter = buildCssFilter(adjustments, filter);
  ctx.drawImage(
    transformed,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    out.width,
    out.height
  );

  return new Promise((resolve, reject) => {
    out.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("No se pudo generar la imagen"));
          return;
        }
        resolve(blob);
      },
      mimeType,
      mimeType === "image/png" ? undefined : quality
    );
  });
}

export function renderFilterThumb(
  source: ImageSource,
  filter: ImageFilter,
  size = 48
): string {
  const { width, height } = getSourceSize(source);
  const scale = Math.min(size / width, size / height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, size, size);
  ctx.filter = buildCssFilter(DEFAULT_ADJUSTMENTS, filter);
  ctx.drawImage(source, (size - w) / 2, (size - h) / 2, w, h);
  return canvas.toDataURL("image/jpeg", 0.7);
}
