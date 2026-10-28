import { getApiUrl } from "./api";
import { supportsDirectoryPicker } from "./localFolder";

const IMAGE_EXTENSION = /\.(jpe?g|png|gif|bmp|tiff?|heic|heif|avif)$/i;

export type WebImageEntry = {
  relativePath: string;
  fileHandle: FileSystemFileHandle;
  parentHandle: FileSystemDirectoryHandle;
};

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

export async function createImageBackup(root: FileSystemDirectoryHandle) {
  const backup = await root.getDirectoryHandle("backup", { create: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `${timestamp}-${crypto.randomUUID()}`;
  return { handle: await backup.getDirectoryHandle(name, { create: true }), path: `backup/${name}` };
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

export async function optimizeLocalImage(entry: WebImageEntry, backup: FileSystemDirectoryHandle, quality: number) {
  const original = await entry.fileHandle.getFile();
  const form = new FormData();
  form.append("file", original);
  form.append("quality", String(quality));
  const response = await fetch(`${getApiUrl()}/api/tools/optimize-for-web/convert-file`, { method: "POST", body: form });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(typeof error.detail === "string" ? error.detail : "No se pudo convertir la imagen");
  }
  const webp = await response.blob();
  if (!webp.size || webp.type !== "image/webp") throw new Error("La conversión no devolvió una imagen WebP válida");

  // Preserve the relative folder structure and finish the backup before replacing anything.
  let backupDir = backup;
  for (const segment of entry.relativePath.split("/").slice(0, -1)) {
    backupDir = await backupDir.getDirectoryHandle(segment, { create: true });
  }
  await writeFile(await backupDir.getFileHandle(original.name, { create: true }), original);

  const occupied = new Set<string>();
  for await (const sibling of entry.parentHandle.values()) occupied.add(sibling.name.toLowerCase());
  const stem = original.name.replace(/\.[^.]+$/, "");
  let outputName = `${stem}.webp`;
  for (let suffix = 2; occupied.has(outputName.toLowerCase()); suffix += 1) outputName = `${stem}-${suffix}.webp`;
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
