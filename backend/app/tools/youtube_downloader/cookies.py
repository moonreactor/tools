import os
import shutil
from pathlib import Path

DEFAULT_COOKIES_PATH = os.getenv("YOUTUBE_COOKIES_PATH", "/app/cookies/youtube.txt")


def get_cookies_path() -> Path:
    return Path(DEFAULT_COOKIES_PATH)


def cookies_configured() -> bool:
    path = get_cookies_path()
    return path.is_file() and path.stat().st_size > 0


def cookies_args(workdir: str | None = None) -> list[str]:
    if not cookies_configured():
        return []

    source = get_cookies_path()

    # yt-dlp writes cookies back on exit; copy to a writable temp dir when mounted ro.
    if workdir:
        dest = os.path.join(workdir, "cookies.txt")
        shutil.copy2(source, dest)
        return ["--cookies", dest]

    return ["--cookies", str(source)]
