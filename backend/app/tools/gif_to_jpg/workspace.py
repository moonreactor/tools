import os
from pathlib import Path

DEFAULT_WORKSPACE = os.getenv("WORKSPACE_ROOT", "/workspace")


def get_workspace_root() -> Path:
    return Path(DEFAULT_WORKSPACE).resolve()


def resolve_under_workspace(relative_path: str) -> Path:
    """Resolve a path and ensure it stays inside the workspace root."""
    root = get_workspace_root()
    root.mkdir(parents=True, exist_ok=True)

    cleaned = (relative_path or "").strip().lstrip("/")
    if not cleaned or cleaned in {".", "./"}:
        target = root
    else:
        target = (root / cleaned).resolve()

    try:
        target.relative_to(root)
    except ValueError as exc:
        raise ValueError("Path is outside the workspace") from exc

    return target
