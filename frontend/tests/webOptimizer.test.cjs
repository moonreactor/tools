const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

// Exercise the production helper with in-memory File System Access handles.
function loadOptimizer(fetch) {
  const source = fs.readFileSync(require.resolve("../lib/webOptimizer.ts"), "utf8");
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, Blob, FormData, Date, crypto, fetch,
    require: (name) => name === "./api" ? { getApiUrl: () => "http://test" } : { supportsDirectoryPicker: () => true },
  });
  return exports;
}

class FileHandle {
  kind = "file";
  constructor(name, content = "original", failWrite = false) { this.name = name; this.content = new Blob([content]); this.failWrite = failWrite; }
  async getFile() { return new File([this.content], this.name); }
  async createWritable() {
    let pending;
    return {
      write: async (blob) => { if (this.failWrite) throw new Error("write failed"); pending = blob; },
      close: async () => { this.content = pending; },
      abort: async () => {},
    };
  }
}

class Directory {
  kind = "directory";
  children = new Map();
  constructor(name) { this.name = name; }
  add(entry) { this.children.set(entry.name, entry); return entry; }
  async *values() { yield* this.children.values(); }
  async getDirectoryHandle(name, options) {
    if (!this.children.has(name) && options?.create) this.add(new Directory(name));
    const entry = this.children.get(name);
    if (!entry || entry.kind !== "directory") throw new Error("not a directory");
    return entry;
  }
  async getFileHandle(name, options) {
    if (!this.children.has(name) && options?.create) this.add(new FileHandle(name, "", this.failWrite));
    const entry = this.children.get(name);
    if (!entry || entry.kind !== "file") throw new Error("not a file");
    return entry;
  }
  async removeEntry(name) { this.children.delete(name); }
}

const success = async () => new Response(new Blob(["converted"], { type: "image/webp" }));

test("scan includes nested images and excludes WebP, backups and unrelated files", async () => {
  const root = new Directory("photos");
  root.add(new FileHandle("a.JPG"));
  root.add(new FileHandle("existing.WEBP"));
  root.add(new FileHandle("notes.txt"));
  root.add(new Directory("nested")).add(new FileHandle("b.png"));
  root.add(new Directory("backup")).add(new FileHandle("old.jpg"));
  const scanned = await loadOptimizer(success).scanImages(root);
  assert.deepEqual(Array.from(scanned.images, (entry) => entry.relativePath), ["a.JPG", "nested/b.png"]);
  assert.equal(scanned.skippedWebp, 1);
});

test("backs up exact originals, preserves structure and avoids existing WebP and duplicate stems", async () => {
  const optimizer = loadOptimizer(success);
  const root = new Directory("photos");
  const nested = root.add(new Directory("nested"));
  nested.add(new FileHandle("a.jpg", "jpeg original"));
  nested.add(new FileHandle("a.png", "png original"));
  const existing = nested.add(new FileHandle("a.webp", "untouched"));
  const scanned = await optimizer.scanImages(root);
  const backup = await optimizer.createImageBackup(root);
  assert.match(backup.path, /^backup\/\d{4}-\d{2}-\d{2}T/);
  for (const entry of scanned.images) await optimizer.optimizeLocalImage(entry, backup.handle, 80);
  assert.equal(await existing.content.text(), "untouched");
  assert.equal(nested.children.has("a.jpg"), false);
  assert.equal(nested.children.has("a.png"), false);
  assert.equal(nested.children.has("a-2.webp"), true);
  assert.equal(nested.children.has("a-3.webp"), true);
  const saved = await backup.handle.getDirectoryHandle("nested");
  assert.equal(await saved.children.get("a.jpg").content.text(), "jpeg original");
  assert.equal(await saved.children.get("a.png").content.text(), "png original");
  assert.equal((await optimizer.scanImages(root)).images.length, 0);
});

test("conversion, backup and output failures preserve originals", async () => {
  for (const stage of ["conversion", "backup", "output"]) {
    const root = new Directory("photos");
    const original = root.add(new FileHandle("a.jpg", "original bytes"));
    const backup = new Directory("backup");
    backup.failWrite = stage === "backup";
    root.failWrite = stage === "output";
    const optimizer = loadOptimizer(stage === "conversion" ? async () => { throw new Error("offline"); } : success);
    const entry = (await optimizer.scanImages(root)).images[0];
    await assert.rejects(optimizer.optimizeLocalImage(entry, backup, 80));
    assert.equal(root.children.get("a.jpg"), original);
    assert.equal(await original.content.text(), "original bytes");
    if (stage === "backup") assert.equal(root.children.has("a.webp"), false);
    if (stage === "output") {
      assert.equal(root.children.has("a.webp"), false);
      assert.equal(await backup.children.get("a.jpg").content.text(), "original bytes");
    }
  }
});
