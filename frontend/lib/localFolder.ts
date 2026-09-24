export type LocalGifEntry = {
  relativePath: string;
  name: string;
  sizeBytes: number;
  fileHandle: FileSystemFileHandle;
  parentHandle: FileSystemDirectoryHandle;
};

export function supportsDirectoryPicker(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

async function collectGifs(
  dirHandle: FileSystemDirectoryHandle,
  prefix = ""
): Promise<LocalGifEntry[]> {
  const found: LocalGifEntry[] = [];

  for await (const entry of dirHandle.values()) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.kind === "directory") {
      found.push(...(await collectGifs(entry, relativePath)));
      continue;
    }

    if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".gif")) {
      const file = await entry.getFile();
      found.push({
        relativePath,
        name: entry.name,
        sizeBytes: file.size,
        fileHandle: entry,
        parentHandle: dirHandle,
      });
    }
  }

  return found.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export async function pickLocalFolder(): Promise<{
  folderName: string;
  dirHandle: FileSystemDirectoryHandle;
  gifs: LocalGifEntry[];
}> {
  if (!supportsDirectoryPicker()) {
    throw new Error(
      "Tu navegador no soporta seleccionar carpetas. Usá Chrome o Edge."
    );
  }

  const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });

  // Request write permission explicitly (needed to overwrite/delete)
  const permission = await dirHandle.requestPermission({ mode: "readwrite" });
  if (permission !== "granted") {
    throw new Error("Se necesita permiso de lectura y escritura sobre la carpeta");
  }

  const gifs = await collectGifs(dirHandle);
  return { folderName: dirHandle.name, dirHandle, gifs };
}

export async function replaceGifWithJpg(
  entry: LocalGifEntry,
  jpgBlob: Blob
): Promise<void> {
  const jpgName = entry.name.replace(/\.gif$/i, ".jpg");
  const jpgHandle = await entry.parentHandle.getFileHandle(jpgName, { create: true });
  const writable = await jpgHandle.createWritable();
  await writable.write(jpgBlob);
  await writable.close();
  await entry.parentHandle.removeEntry(entry.name);
}
