const IMAGE_ACCEPT: FilePickerAcceptType = {
  description: "Images",
  accept: {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/webp": [".webp"],
    "image/gif": [".gif"],
  },
};

export function supportsOpenFilePicker(): boolean {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

export function supportsSaveFilePicker(): boolean {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

export type OpenedImageFile = {
  file: File;
  handle: FileSystemFileHandle | null;
  canReplace: boolean;
};

async function ensureReadWrite(handle: FileSystemFileHandle): Promise<boolean> {
  const current = await handle.queryPermission({ mode: "readwrite" });
  if (current === "granted") return true;
  const next = await handle.requestPermission({ mode: "readwrite" });
  return next === "granted";
}

export async function openImageFile(): Promise<OpenedImageFile> {
  if (!supportsOpenFilePicker()) {
    throw new Error("OPEN_PICKER_UNSUPPORTED");
  }

  const [handle] = await window.showOpenFilePicker({
    multiple: false,
    types: [IMAGE_ACCEPT],
    excludeAcceptAllOption: true,
  });

  const file = await handle.getFile();
  const canReplace = await ensureReadWrite(handle);

  return { file, handle: canReplace ? handle : null, canReplace };
}

export async function replaceFile(
  handle: FileSystemFileHandle,
  blob: Blob
): Promise<void> {
  const allowed = await ensureReadWrite(handle);
  if (!allowed) {
    throw new Error("Se necesita permiso de escritura para reemplazar el archivo");
  }

  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function saveCopy(
  blob: Blob,
  suggestedName: string,
  mimeType: string
): Promise<"picker" | "download"> {
  if (supportsSaveFilePicker()) {
    try {
      const ext = suggestedName.includes(".")
        ? `.${suggestedName.split(".").pop()!.toLowerCase()}`
        : "";
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: "Image",
            accept: { [mimeType]: ext ? [ext] : [".png", ".jpg", ".jpeg", ".webp"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "picker";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err;
      }
      // Fall through to download if picker fails for other reasons
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
  return "download";
}
