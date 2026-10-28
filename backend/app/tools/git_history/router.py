"""Local Git inspection and atomic, backed-up message rewrites."""
import io
import os
import re
import subprocess
import uuid
from pathlib import Path
from threading import Lock

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/git-history", tags=["git-history"])
write_lock = Lock()


def git(repo: Path, *args: str, data: bytes | None = None) -> bytes:
    try:
        result = subprocess.run(
            ["git", "--no-replace-objects", "-c", "core.hooksPath=/dev/null", "-C", str(repo), *args],
            input=data, capture_output=True, timeout=60,
            env={**os.environ, "GIT_TERMINAL_PROMPT": "0", "GIT_OPTIONAL_LOCKS": "0"},
        )
    except FileNotFoundError:
        raise HTTPException(503, "Git no está instalado en el backend.")
    except subprocess.TimeoutExpired:
        raise HTTPException(408, "Git tardó demasiado. Probá con un repositorio más pequeño.")
    if result.returncode:
        raise HTTPException(400, result.stderr.decode(errors="replace").strip() or "No se pudo ejecutar Git.")
    return result.stdout


def repository(path: str) -> Path:
    root = Path(os.getenv("GIT_REPOS_ROOT", str(Path.home()))).expanduser().resolve()
    candidate = Path(path).expanduser()
    repo = (candidate if candidate.is_absolute() else root / candidate).resolve()
    if not repo.is_relative_to(root) or not repo.is_dir():
        raise HTTPException(400, f"Elegí una carpeta dentro de {root}.")
    if git(repo, "rev-parse", "--is-inside-work-tree").strip() != b"true":
        raise HTTPException(400, "La carpeta no es un repositorio de trabajo Git.")
    top = Path(git(repo, "rev-parse", "--show-toplevel").decode().strip()).resolve()
    if git(top, "rev-parse", "--is-shallow-repository").strip() == b"true":
        raise HTTPException(400, "Usá un clon completo; este repositorio tiene historial superficial.")
    if not top.is_relative_to(root):
        raise HTTPException(400, "El repositorio está fuera de la carpeta permitida.")
    return top


class RepoRequest(BaseModel):
    path: str


class HistoryRequest(RepoRequest):
    query: str = Field(default="", max_length=500)
    branch: str = ""
    offset: int = Field(default=0, ge=0, le=100000)


class RewriteRequest(RepoRequest):
    commit: str
    expected_head: str
    message: str = Field(min_length=1, max_length=100000)
    confirmed: bool = False


class ReplaceRequest(RepoRequest):
    expected_head: str
    expected_branch: str = Field(min_length=1)
    find: str = Field(min_length=1, max_length=500)
    replacement: str = Field(default="", max_length=100000)
    case_sensitive: bool = False
    confirmed: bool = False


@router.get("/info")
def info():
    return {"root": str(Path(os.getenv("GIT_REPOS_ROOT", str(Path.home()))).expanduser().resolve())}


@router.post("/browse")
def browse(body: RepoRequest):
    root = Path(os.getenv("GIT_REPOS_ROOT", str(Path.home()))).expanduser().resolve()
    candidate = Path(body.path).expanduser() if body.path else root
    folder = (candidate if candidate.is_absolute() else root / candidate).resolve()
    if not folder.is_relative_to(root) or not folder.is_dir():
        raise HTTPException(400, f"Elegí una carpeta dentro de {root}.")
    try:
        folders = sorted(p.name for p in folder.iterdir() if p.is_dir() and not p.name.startswith(".") and p.resolve().is_relative_to(root))
    except PermissionError:
        raise HTTPException(403, "No hay permiso para leer esta carpeta.")
    return {"path": str(folder), "parent": str(folder.parent) if folder != root else None, "folders": folders}


@router.post("/history")
def history(body: HistoryRequest):
    repo = repository(body.path)
    head = git(repo, "rev-parse", "HEAD").decode().strip()
    refs = git(repo, "for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes").decode().splitlines()
    branch_refs = {ref.removeprefix("refs/heads/").removeprefix("refs/remotes/"): ref for ref in reversed(refs)}
    branches = sorted(branch_refs)
    current = git(repo, "symbolic-ref", "-q", "--short", "HEAD").decode().strip() if git(repo, "rev-parse", "--abbrev-ref", "HEAD").strip() != b"HEAD" else ""
    ref = "HEAD"
    if body.branch:
        if body.branch not in branches:
            raise HTTPException(400, "La rama ya no existe.")
        ref = branch_refs[body.branch]
    args = ["log", "--topo-order", "--format=%H", "--max-count=101", f"--skip={body.offset}"]
    if body.query:
        args += ["--fixed-strings", "--regexp-ignore-case", "--grep=" + body.query]
    ids = git(repo, *args, ref, "--").decode().splitlines()
    commits = []
    for oid in ids[:100]:
        values = git(repo, "show", "-s", "--format=%H%x00%P%x00%an%x00%aI%x00%D%x00%B", oid, "--").decode(errors="replace").rstrip("\n").split("\0", 5)
        commits.append(dict(zip(["hash", "parents", "author", "date", "refs", "message"], values)))
    graph_args = [arg for arg in args if not arg.startswith("--format=")]
    graph = git(repo, *graph_args, "--graph", "--format=%h %s%d", ref, "--").decode(errors="replace")
    return {"graph": graph, "path": str(repo), "head": head, "branch": current, "branches": branches, "commits": commits, "has_more": len(ids) > 100}


def writable_head(repo: Path, expected_head: str, expected_branch: str | None = None):
    if not re.fullmatch(r"[0-9a-f]{40,64}", expected_head):
        raise HTTPException(400, "Identificador de commit inválido.")
    ref = git(repo, "symbolic-ref", "-q", "HEAD").decode().strip()
    head = git(repo, "rev-parse", "HEAD").decode().strip()
    if head != expected_head:
        raise HTTPException(409, "El repositorio cambió. Actualizá el historial antes de guardar.")
    if git(repo, "status", "--porcelain").strip():
        raise HTTPException(409, "Guardá o descartá los cambios pendientes antes de editar mensajes.")
    for marker in ["rebase-merge", "rebase-apply", "MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "BISECT_LOG"]:
        location = git(repo, "rev-parse", "--git-path", marker).decode().strip()
        if (repo / location).exists():
            raise HTTPException(409, "Terminá la operación Git en curso antes de editar mensajes.")
    if expected_branch is not None and ref != "refs/heads/" + expected_branch:
        raise HTTPException(409, "La rama activa cambió. Actualizá el historial antes de guardar.")
    return ref, head


def rewrite(body: RewriteRequest):
    repo = repository(body.path)
    if not body.confirmed or not body.message.strip() or "\0" in body.message:
        raise HTTPException(400, "Confirmá la reescritura e ingresá un mensaje válido.")
    if not re.fullmatch(r"[0-9a-f]{40,64}", body.commit):
        raise HTTPException(400, "Identificador de commit inválido.")
    ref, head = writable_head(repo, body.expected_head)
    git(repo, "merge-base", "--is-ancestor", body.commit, head)
    ids = [body.commit] + git(repo, "rev-list", "--reverse", "--topo-order", head, "^" + body.commit).decode().splitlines()
    if len(ids) > 10000:
        raise HTTPException(400, "Esta edición afecta más de 10.000 commits.")
    return rewrite_messages(repo, ref, head, ids, {body.commit: body.message.rstrip("\n").encode() + b"\n"})


def rewrite_messages(repo: Path, ref: str, head: str, ids: list[str], messages: dict[str, bytes], raw_commits: dict[str, bytes] | None = None):
    mapped = {}
    for oid in ids:
        raw = raw_commits[oid] if raw_commits is not None else git(repo, "cat-file", "commit", oid)
        headers, message = raw.split(b"\n\n", 1)
        parents = [line[7:].decode() for line in headers.split(b"\n") if line.startswith(b"parent ")]
        if oid not in messages and all(mapped.get(parent, parent) == parent for parent in parents):
            mapped[oid] = oid
            continue
        rebuilt = []
        skip = False
        for line in headers.split(b"\n"):
            if not line.startswith(b" "):
                skip = line.startswith((b"gpgsig ", b"gpgsig-sha256 ", b"mergetag "))
            if skip:
                continue
            if oid in messages and line.startswith(b"encoding "):
                # Edited messages are encoded as UTF-8, Git's default.
                continue
            if line.startswith(b"parent "):
                parent = line[7:].decode()
                line = b"parent " + mapped.get(parent, parent).encode()
            rebuilt.append(line)
        if oid in messages:
            message = messages[oid]
        mapped[oid] = git(repo, "hash-object", "-t", "commit", "-w", "--stdin", data=b"\n".join(rebuilt) + b"\n\n" + message).decode().strip()
    backup = "refs/tools-hub/backups/" + uuid.uuid4().hex
    transaction = f"start\ncreate {backup} {head}\nupdate {ref} {mapped[head]} {head}\nprepare\ncommit\n"
    git(repo, "update-ref", "--stdin", data=transaction.encode())
    return {"head": mapped[head], "backup": backup, "rewritten": sum(old != new for old, new in mapped.items())}


@router.post("/rewrite")
def rewrite_message(body: RewriteRequest):
    with write_lock:
        return rewrite(body)


def replacement_plan(body: ReplaceRequest):
    repo = repository(body.path)
    ref, head = writable_head(repo, body.expected_head, body.expected_branch)
    if "\0" in body.find or "\0" in body.replacement:
        raise HTTPException(400, "El texto no puede contener caracteres nulos.")
    ids = git(repo, "rev-list", "--reverse", "--topo-order", "--max-count=10001", head).decode().splitlines()
    if len(ids) > 10000:
        raise HTTPException(400, "Buscar y reemplazar admite ramas de hasta 10.000 commits.")
    raw_stream = io.BytesIO(git(repo, "cat-file", "--batch", data=("\n".join(ids) + "\n").encode()))
    raw_commits = {}
    pattern = re.compile(re.escape(body.find), 0 if body.case_sensitive else re.IGNORECASE)
    changes = []
    messages = {}
    for oid in ids:
        header = raw_stream.readline().split()
        raw = raw_stream.read(int(header[2]))
        raw_stream.read(1)
        raw_commits[oid] = raw
        message = raw.split(b"\n\n", 1)[1]
        try:
            before = message.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(400, f"El mensaje {oid[:10]} no usa UTF-8. No se modificó el historial.")
        after, count = pattern.subn(lambda match: body.replacement, before)
        if before == after:
            continue
        if not after.strip():
            raise HTTPException(400, f"El reemplazo dejaría vacío el mensaje {oid[:10]}. No se modificó el historial.")
        if len(after) > 100000:
            raise HTTPException(400, f"El mensaje {oid[:10]} resultante supera los 100.000 caracteres.")
        messages[oid] = after.encode()
        changes.append({"hash": oid, "before": before, "after": after, "occurrences": count})
    return repo, ref, head, ids, messages, raw_commits, changes


@router.post("/replace-preview")
def preview_replacement(body: ReplaceRequest):
    _, _, head, _, _, _, changes = replacement_plan(body)
    return {"head": head, "branch": body.expected_branch, "matched": len(changes), "occurrences": sum(item["occurrences"] for item in changes), "commits": changes}


@router.post("/replace")
def replace_messages(body: ReplaceRequest):
    if not body.confirmed:
        raise HTTPException(400, "Revisá la vista previa y confirmá el reemplazo.")
    with write_lock:
        repo, ref, head, ids, messages, raw_commits, changes = replacement_plan(body)
        if not changes:
            raise HTTPException(400, "No hay mensajes para reemplazar.")
        result = rewrite_messages(repo, ref, head, ids, messages, raw_commits)
        return {**result, "changed": len(changes), "occurrences": sum(item["occurrences"] for item in changes)}
