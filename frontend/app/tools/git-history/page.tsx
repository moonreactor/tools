"use client";

import { useEffect, useState } from "react";
import { FolderOpen, GitBranch, Search, Loader2 } from "lucide-react";
const LOCAL_GIT_URL = "http://127.0.0.1:8766";

type Commit = { hash: string; parents: string; author: string; date: string; refs: string; message: string };
type History = { path: string; head: string; branch: string; branches: string[]; commits: Commit[]; has_more: boolean; graph: string };
async function request<T>(endpoint: string, body?: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${LOCAL_GIT_URL}/api/tools/git-history/${endpoint}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  } catch {
    throw new Error("No hay conexión con Git local. Ejecutá make git-local en tu computadora y volvé a intentar. Si el navegador lo solicita, permití el acceso a la red local.");
  }
  if (response.status === 404 && (endpoint === "replace-preview" || endpoint === "replace")) {
    throw new Error("Git local está ejecutando una versión anterior sin buscar y reemplazar. Detené el servicio con Ctrl+C y volvé a ejecutar make git-local. Después reintentá la vista previa.");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "No se pudo completar la operación.");
  return data;
}
type ReplacementPreview = { matched: number; occurrences: number; commits: { hash: string; before: string; after: string; occurrences: number }[] };
const field = "rounded-lg border border-border bg-background px-3 py-2 text-sm";
const button = "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-40";

export default function GitHistoryPage() {
  const [path, setPath] = useState("");
  const [root, setRoot] = useState("");
  const [history, setHistory] = useState<History | null>(null);
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Commit | null>(null);
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [replacePreview, setReplacePreview] = useState<ReplacementPreview | null>(null);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => { request<{ root: string }>("info").then(data => { setRoot(data.root); setPath(data.root); }).catch(e => setError(e.message)); }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Ocurrió un error."); } finally { setBusy(false); }
  }
  async function load(repo: string, selectedBranch: string, search: string, page: number) {
    setReplacePreview(null); setReplaceConfirmed(false);
    const data = await request<History>("history", { path: repo, branch: selectedBranch, query: search, offset: page });
    setHistory(data); setOffset(page); setSelected(null); setConfirmed(false);
  }
  return <div className="mx-auto max-w-7xl space-y-6 p-8">
    <header><div className="mb-2 flex items-center gap-2 text-primary"><GitBranch size={22} /><span>Herramientas de desarrollo</span></div><h1 className="text-3xl font-bold">Historial Git</h1><p className="mt-2 text-muted-foreground">Explorá el árbol de commits y limpiá sus mensajes desde un solo lugar.</p></header>
    <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Para conectar tus repositorios, ejecutá <code className="text-foreground">make git-local</code> en una terminal de tu computadora y mantenela abierta. Después presioná Elegir carpeta de mi computadora.</p>
    <section className="space-y-3 rounded-xl border border-border bg-card p-5">
      <label className="block text-sm font-medium" htmlFor="repo">Carpeta del repositorio</label>
      <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); setSuccess(""); setBranch(""); setQuery(""); void run(() => load(path, "", "", 0)); }}>
        <input id="repo" className={`${field} min-w-60 flex-1`} value={path} onChange={e => setPath(e.target.value)} placeholder="Ruta del repositorio" disabled={busy} />
        <button type="button" className={`${field} flex items-center gap-2`} disabled={busy} onClick={() => void run(async () => { const picked = await request<{ path: string | null }>("pick-folder", {}); if (!picked.path) return; setPath(picked.path); setBranch(""); setQuery(""); setSuccess(""); await load(picked.path, "", "", 0); })}><FolderOpen size={16} /> Elegir carpeta de mi computadora</button>
        <button className={button} disabled={busy || !path.trim()}>Abrir repositorio</button>
      </form>
      <p className="text-xs text-muted-foreground">Selector nativo de macOS. Acceso directo a tu computadora mediante Git local, incluso si Tools Hub corre en Docker. {root && `Carpeta permitida: ${root}.`}</p>
    </section>
    {error && <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}
    {success && <div role="status" className="break-all rounded-lg border border-green-500/40 bg-green-500/10 p-4 text-sm text-green-300">{success}</div>}
    {busy && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Procesando…</p>}
    {history && <>
      <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); void run(() => load(history.path, branch, query, 0)); }}>
        <select aria-label="Rama" className={field} value={branch} disabled={busy} onChange={e => { setBranch(e.target.value); void run(() => load(history.path, e.target.value, query, 0)); }}><option value="">Rama actual ({history.branch || "HEAD separado"})</option>{history.branches.map(name => <option key={name} value={name}>{name}</option>)}</select>
        <input aria-label="Buscar en mensajes" className={`${field} flex-1`} value={query} onChange={e => { setQuery(e.target.value); setReplacePreview(null); setReplaceConfirmed(false); }} placeholder="Buscar texto en el título y cuerpo del mensaje…" disabled={busy} />
        <button className={`${button} flex items-center gap-2`} disabled={busy}><Search size={16} /> Buscar</button>
      </form>
      <p className="break-all text-xs text-muted-foreground">{history.path} · HEAD {history.head.slice(0, 10)} · Se edita la rama actualmente activa. Las otras ramas se pueden explorar.</p>
      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold">Buscar y reemplazar en mensajes</h2>
        <p className="text-sm text-muted-foreground">Usá el texto del buscador de arriba. El reemplazo es literal y alcanza todas las coincidencias del título y cuerpo en todo el historial de la rama activa, incluidas las páginas que no están visibles. Admite ramas de hasta 10.000 commits.</p>
        <label htmlFor="replacement" className="block text-sm font-medium">Reemplazar por</label>
        <textarea id="replacement" rows={3} className={`${field} w-full font-mono`} placeholder="Nuevo texto (dejalo vacío para eliminar las coincidencias)" value={replacement} disabled={busy} onChange={e => { setReplacement(e.target.value); setReplacePreview(null); setReplaceConfirmed(false); }} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={caseSensitive} disabled={busy} onChange={e => { setCaseSensitive(e.target.checked); setReplacePreview(null); setReplaceConfirmed(false); }} />Distinguir mayúsculas y minúsculas al reemplazar</label>
        {(!history.branch || (!!branch && branch !== history.branch)) && <p className="text-sm text-amber-200">Seleccioná la rama actualmente activa para reemplazar mensajes.</p>}
        <button type="button" className={button} disabled={busy || !query || !history.branch || (!!branch && branch !== history.branch)} onClick={() => void run(async () => {
          setReplacePreview(null); setReplaceConfirmed(false); setSuccess("");
          const preview = await request<ReplacementPreview>("replace-preview", { path: history.path, expected_head: history.head, expected_branch: history.branch, find: query, replacement, case_sensitive: caseSensitive });
          setReplacePreview(preview);
        })}>Ver vista previa del reemplazo</button>
        {replacePreview && <div className="space-y-4" aria-live="polite">
          <p className="text-sm font-medium">{replacePreview.matched} mensajes cambiarán · {replacePreview.occurrences} coincidencias a reemplazar</p>
          {replacePreview.matched === 0 ? <p className="text-sm text-muted-foreground">No hay mensajes que cambien con este reemplazo.</p> : <>
            <div className="max-h-[500px] space-y-4 overflow-auto">
              {replacePreview.commits.map(commit => <div key={commit.hash} className="space-y-2 rounded-lg border border-border p-3">
                <p className="font-mono text-xs text-muted-foreground">{commit.hash.slice(0, 10)} · {commit.occurrences} coincidencias</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="min-w-0"><p className="mb-1 text-xs font-medium text-muted-foreground">Antes</p><pre className="whitespace-pre-wrap break-words rounded-lg bg-red-500/10 p-3 font-mono text-xs">{commit.before}</pre></div>
                  <div className="min-w-0"><p className="mb-1 text-xs font-medium text-muted-foreground">Después</p><pre className="whitespace-pre-wrap break-words rounded-lg bg-green-500/10 p-3 font-mono text-xs">{commit.after}</pre></div>
                </div>
              </div>)}
            </div>
            <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">Aplicar cambia los hashes de los commits editados y sus descendientes. Conserva archivos, autores, fechas y merges; elimina las firmas de los commits reescritos. Se crea un respaldo local. Si estos commits ya están publicados, coordiná la actualización del remoto. La herramienta no hace push.</p>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={replaceConfirmed} disabled={busy} onChange={e => setReplaceConfirmed(e.target.checked)} />Revisé la vista previa y confirmo el reemplazo en la rama activa.</label>
            <button type="button" className={button} disabled={busy || !replaceConfirmed} onClick={() => void run(async () => {
              const result = await request<{ backup: string; changed: number; rewritten: number; occurrences: number }>("replace", { path: history.path, expected_head: history.head, expected_branch: history.branch, find: query, replacement, case_sensitive: caseSensitive, confirmed: replaceConfirmed });
              setSuccess(`Reemplazo aplicado: ${result.occurrences} coincidencias en ${result.changed} mensajes. ${result.rewritten} commits reescritos. Respaldo: ${result.backup}`);
              setReplacePreview(null); setReplaceConfirmed(false);
              await load(history.path, branch, query, 0);
            })}>Reemplazar en {replacePreview.matched} mensajes y crear respaldo</button>
          </>}
        </div>}
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card"><div className="border-b border-border px-4 py-3 text-sm font-medium">Árbol de commits · {offset + 1}–{offset + history.commits.length}</div>
          <pre aria-label="Grafo de ramas y merges" className="max-h-56 overflow-auto border-b border-border bg-background p-4 text-xs leading-6 text-primary">{history.graph}</pre>
          <div className="max-h-[650px] overflow-auto">{history.commits.length === 0 && <p className="p-6 text-sm text-muted-foreground">No se encontraron commits con ese texto.</p>}{history.commits.map(commit => <button key={commit.hash} disabled={busy} className={`block w-full border-b border-border p-4 text-left hover:bg-muted ${selected?.hash === commit.hash ? "bg-primary/10" : ""}`} onClick={() => { setSelected(commit); setMessage(commit.message); setConfirmed(false); }}><div className="flex gap-3"><div className="flex flex-col items-center text-primary"><GitBranch size={18} /><span className="min-h-8 flex-1 border-l border-primary/40" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{commit.message.split("\n")[0]}</p>{commit.refs && <p className="mt-1 break-all text-xs text-primary">{commit.refs}</p>}<p className="mt-1 text-xs text-muted-foreground">{commit.hash.slice(0, 8)} · {commit.author} · {new Date(commit.date).toLocaleString("es-AR")}</p><p className="mt-1 break-all font-mono text-xs text-muted-foreground">↳ {commit.parents ? commit.parents.split(" ").map(p => p.slice(0, 8)).join(" · ") : "Commit inicial"}</p></div></div></button>)}</div>
          <div className="flex justify-between p-3"><button className={field} disabled={busy || offset === 0} onClick={() => void run(() => load(history.path, branch, query, Math.max(0, offset - 100)))}>Anterior</button><button className={field} disabled={busy || !history.has_more} onClick={() => void run(() => load(history.path, branch, query, offset + 100))}>Siguiente</button></div>
        </section>
        <section className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-5"><h2 className="font-semibold">Editar mensaje</h2>{selected ? <><p className="break-all font-mono text-xs text-muted-foreground">{selected.hash}</p><label className="block text-sm" htmlFor="message">Título y cuerpo del commit</label><textarea id="message" className={`${field} min-h-64 w-full font-mono`} value={message} disabled={busy} onChange={e => { setMessage(e.target.value); setConfirmed(false); }} /><div className="space-y-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200"><p>Guardar cambia el hash de este commit y de sus descendientes en la rama activa. Conserva archivos, autores, fechas y merges. Las firmas de los commits reescritos se eliminan.</p><p>Se crea un respaldo local. Si ya publicaste estos commits, sincronizar el remoto requerirá coordinar la reescritura. Esta herramienta no hace push.</p></div><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />Entiendo y quiero reescribir los mensajes en la rama activa.</label><button className={button} disabled={busy || !confirmed || !message.trim() || message === selected.message || (!!branch && branch !== history.branch) || !history.branch} onClick={() => void run(async () => { const result = await request<{ backup: string; rewritten: number }>("rewrite", { path: history.path, commit: selected.hash, expected_head: history.head, message, confirmed }); setSuccess(`Mensaje guardado. ${result.rewritten} commits reescritos. Respaldo: ${result.backup}`); await load(history.path, branch, query, 0); })}>Guardar mensaje y crear respaldo</button></> : <p className="text-sm text-muted-foreground">Seleccioná un commit para ver y editar su mensaje completo.</p>}</section>
      </div>
    </>}
  </div>;
}
