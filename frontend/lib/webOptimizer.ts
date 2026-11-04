import { getApiUrl } from "./api";
import { supportsDirectoryPicker } from "./localFolder";
import { supportsOpenFilePicker } from "./localFile";

const IMAGE_EXTENSION = /\.(jpe?g|png|gif|bmp|tiff?|heic|heif|avif)$/i;

const IMAGE_ACCEPT: FilePickerAcceptType = {
  description: "Images",
  accept: {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/gif": [".gif"],
    "image/bmp": [".bmp"],
    "image/tiff": [".tif", ".tiff"],
    "image/heic": [".heic", ".heif"],
    "image/avif": [".avif"],
  },
};

export type WebImageEntry = {
  relativePath: string;
  fileHandle: FileSystemFileHandle;
  parentHandle: FileSystemDirectoryHandle;
};

export type PickedImage = {
  name: string;
  file: File;
  handle: FileSystemFileHandle;
};

export type OptimizeResult = {
  from: string;
  to: string;
  originalBytes: number;
  outputBytes: number;
};

export { supportsDirectoryPicker, supportsOpenFilePicker };

export async function scanImages(root: FileSystemDirectoryHandle) {
  const images: WebImageEntry[] = [];
  let skippedWebp = 0;
  async function scan(dir: FileSystemDirectoryHandle, prefix = "") {
    for await (const entry of dir.values()) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === "directory") {
        if (entry.name.toLowerCase() === "backup" || entry.name.toLowerCase().startsWith("backup-")) continue;
        await scan(entry, relativePath);
      } else if (/\.webp$/i.test(entry.name)) {
        skippedWebp += 1;
      } else if (IMAGE_EXTENSION.test(entry.name)) {
        images.push({ relativePath, fileHandle: entry, parentHandle: dir });
      }
    }
  }
  await scan(root);
  return { images: images.sort((a, b) => a.relativePath.localeCompare(b.relativePath)), skippedWebp };
}

export async function pickImageFolder() {
  if (!supportsDirectoryPicker()) throw new Error("Abrí esta herramienta en Chrome o Edge para elegir una carpeta.");
  const root = await window.showDirectoryPicker({ mode: "readwrite" });
  if (await root.requestPermission({ mode: "readwrite" }) !== "granted") {
    throw new Error("Se necesita permiso de lectura y escritura sobre la carpeta.");
  }
  return { root, ...await scanImages(root) };
}

export async function pickImageFiles() {
  if (!supportsOpenFilePicker()) throw new Error("Abrí esta herramienta en Chrome o Edge para elegir imágenes.");
  const handles = await window.showOpenFilePicker({
    multiple: true,
    types: [IMAGE_ACCEPT],
    excludeAcceptAllOption: true,
  });
  const images: PickedImage[] = [];
  let skippedWebp = 0;
  let skippedOther = 0;
  for (const handle of handles) {
    if (/\.webp$/i.test(handle.name)) {
      skippedWebp += 1;
      continue;
    }
    if (!IMAGE_EXTENSION.test(handle.name)) {
      skippedOther += 1;
      continue;
    }
    images.push({ name: handle.name, file: await handle.getFile(), handle });
  }
  images.sort((a, b) => a.name.localeCompare(b.name));
  return { images, skippedWebp, skippedOther };
}

export async function createImageBackup(root: FileSystemDirectoryHandle) {
  const backup = await root.getDirectoryHandle("backup", { create: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `${timestamp}-${crypto.randomUUID()}`;
  return { handle: await backup.getDirectoryHandle(name, { create: true }), path: `backup/${name}` };
}

export async function pickOutputFolder() {
  if (!supportsDirectoryPicker()) throw new Error("Abrí esta herramienta en Chrome o Edge para elegir una carpeta de destino.");
  const root = await window.showDirectoryPicker({ mode: "readwrite" });
  if (await root.requestPermission({ mode: "readwrite" }) !== "granted") {
    throw new Error("Se necesita permiso de lectura y escritura sobre la carpeta de destino.");
  }
  return root;
}

async function writeFile(handle: FileSystemFileHandle, content: Blob) {
  const writer = await handle.createWritable();
  try {
    await writer.write(content);
    await writer.close();
  } catch (error) {
    await writer.abort().catch(() => {});
    throw error;
  }
}

async function occupiedNames(dir: FileSystemDirectoryHandle) {
  const occupied = new Set<string>();
  for await (const sibling of dir.values()) occupied.add(sibling.name.toLowerCase());
  return occupied;
}

function uniqueFileName(preferred: string, occupied: Set<string>) {
  if (!occupied.has(preferred.toLowerCase())) return preferred;
  const stem = preferred.replace(/\.[^.]+$/, "");
  const extension = preferred.slice(stem.length);
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${stem}-${suffix}${extension}`;
    if (!occupied.has(candidate.toLowerCase())) return candidate;
  }
}

export async function convertImageFile(file: File, quality: number) {
  const form = new FormData();
  form.append("file", file);
  form.append("quality", String(quality));
  const response = await fetch(`${getApiUrl()}/api/tools/optimize-for-web/convert-file`, { method: "POST", body: form });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(typeof error.detail === "string" ? error.detail : "No se pudo convertir la imagen");
  }
  const webp = await response.blob();
  if (!webp.size || webp.type !== "image/webp") throw new Error("La conversión no devolvió una imagen WebP válida");
  return webp;
}

export async function optimizeLocalImage(entry: WebImageEntry, backup: FileSystemDirectoryHandle, quality: number): Promise<OptimizeResult> {
  const original = await entry.fileHandle.getFile();
  const webp = await convertImageFile(original, quality);

  // Preserve the relative folder structure and finish the backup before replacing anything.
  let backupDir = backup;
  for (const segment of entry.relativePath.split("/").slice(0, -1)) {
    backupDir = await backupDir.getDirectoryHandle(segment, { create: true });
  }
  await writeFile(await backupDir.getFileHandle(original.name, { create: true }), original);

  const occupied = await occupiedNames(entry.parentHandle);
  const stem = original.name.replace(/\.[^.]+$/, "");
  const outputName = uniqueFileName(`${stem}.webp`, occupied);
  const output = await entry.parentHandle.getFileHandle(outputName, { create: true });
  try {
    await writeFile(output, webp);
  } catch (error) {
    await entry.parentHandle.removeEntry(outputName).catch(() => {});
    throw error;
  }
  // A failed conversion, backup, or output write leaves the original in place.
  await entry.parentHandle.removeEntry(original.name);
  return {
    from: entry.relativePath,
    to: [...entry.relativePath.split("/").slice(0, -1), outputName].join("/"),
    originalBytes: original.size,
    outputBytes: webp.size,
  };
}

export async function optimizePickedImage(
  image: PickedImage,
  destination: FileSystemDirectoryHandle,
  backup: FileSystemDirectoryHandle,
  quality: number,
): Promise<OptimizeResult> {
  const original = image.file.size ? image.file : await image.handle.getFile();
  const webp = await convertImageFile(original, quality);

  const backupOccupied = await occupiedNames(backup);
  const backupName = uniqueFileName(original.name, backupOccupied);
  await writeFile(await backup.getFileHandle(backupName, { create: true }), original);

  const occupied = await occupiedNames(destination);
  const stem = original.name.replace(/\.[^.]+$/, "");
  const outputName = uniqueFileName(`${stem}.webp`, occupied);
  const output = await destination.getFileHandle(outputName, { create: true });
  try {
    await writeFile(output, webp);
  } catch (error) {
    await destination.removeEntry(outputName).catch(() => {});
    throw error;
  }

  return {
    from: original.name,
    to: outputName,
    originalBytes: original.size,
    outputBytes: webp.size,
  };
}
