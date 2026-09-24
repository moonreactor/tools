from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response

from app.tools.gif_to_jpg.converter import convert_gif_bytes_to_jpg, convert_gif_to_jpg
from app.tools.gif_to_jpg.workspace import get_workspace_root, resolve_under_workspace

router = APIRouter(prefix="/gif-to-jpg", tags=["gif-to-jpg"])


def _list_gifs(folder: Path) -> list[Path]:
    return sorted(folder.rglob("*.gif")) + sorted(folder.rglob("*.GIF"))


def _unique_gifs(folder: Path) -> list[Path]:
    seen: set[Path] = set()
    result: list[Path] = []
    for path in _list_gifs(folder):
        resolved = path.resolve()
        if resolved in seen:
            continue
        if path.is_file():
            seen.add(resolved)
            result.append(path)
    return result


@router.get("/info")
async def gif_to_jpg_info() -> dict[str, Any]:
    root = get_workspace_root()
    root.mkdir(parents=True, exist_ok=True)
    return {
        "name": "GIF to JPG",
        "description": "Convert GIF files to JPG and replace originals",
        "workspace_root": str(root),
        "overwrite": True,
        "supports_local_folder": True,
    }


@router.post("/convert-file")
async def convert_uploaded_gif(
    file: UploadFile = File(...),
    quality: int = Form(90),
):
    if not 1 <= quality <= 100:
        raise HTTPException(status_code=400, detail="Quality must be between 1 and 100")

    filename = file.filename or "image.gif"
    if not filename.lower().endswith(".gif"):
        raise HTTPException(status_code=400, detail="Only .gif files are supported")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(content) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File exceeds 100 MB limit")

    try:
        jpg_bytes = convert_gif_bytes_to_jpg(content, quality=quality)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not convert GIF: {exc}") from exc

    out_name = filename.rsplit(".", 1)[0] + ".jpg"
    return Response(
        content=jpg_bytes,
        media_type="image/jpeg",
        headers={"Content-Disposition": f'attachment; filename="{out_name}"'},
    )


@router.get("/browse")
async def browse_workspace(path: str = Query("")) -> dict[str, Any]:
    try:
        target = resolve_under_workspace(path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not target.exists():
        raise HTTPException(status_code=404, detail="Folder not found")
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="Path is not a folder")

    root = get_workspace_root()
    relative = "" if target == root else str(target.relative_to(root))

    entries = []
    for child in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
        if child.name.startswith("."):
            continue
        child_rel = str(child.relative_to(root))
        entries.append(
            {
                "name": child.name,
                "path": child_rel,
                "type": "dir" if child.is_dir() else "file",
            }
        )

    return {
        "path": relative,
        "parent": str(Path(relative).parent) if relative else None,
        "entries": entries,
    }


@router.get("/scan")
async def scan_gifs(path: str = Query("")) -> dict[str, Any]:
    try:
        target = resolve_under_workspace(path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not target.exists():
        raise HTTPException(status_code=404, detail="Folder not found")
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="Path is not a folder")

    root = get_workspace_root()
    gifs = _unique_gifs(target)

    return {
        "folder": "" if target == root else str(target.relative_to(root)),
        "count": len(gifs),
        "files": [
            {
                "path": str(gif.relative_to(root)),
                "name": gif.name,
                "size_bytes": gif.stat().st_size,
            }
            for gif in gifs
        ],
    }


@router.post("/convert")
async def convert_folder(
    path: str = Form(""),
    quality: int = Form(90),
) -> dict[str, Any]:
    if not 1 <= quality <= 100:
        raise HTTPException(status_code=400, detail="Quality must be between 1 and 100")

    try:
        target = resolve_under_workspace(path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not target.exists():
        raise HTTPException(status_code=404, detail="Folder not found")
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="Path is not a folder")

    root = get_workspace_root()
    gifs = _unique_gifs(target)

    converted: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []

    for gif in gifs:
        try:
            jpg = convert_gif_to_jpg(gif, quality=quality)
            converted.append(
                {
                    "from": str(gif.relative_to(root)),
                    "to": str(jpg.relative_to(root)),
                }
            )
        except Exception as exc:
            errors.append(
                {
                    "path": str(gif.relative_to(root)),
                    "error": str(exc),
                }
            )

    return {
        "folder": "" if target == root else str(target.relative_to(root)),
        "found": len(gifs),
        "converted": len(converted),
        "failed": len(errors),
        "results": converted,
        "errors": errors,
    }
