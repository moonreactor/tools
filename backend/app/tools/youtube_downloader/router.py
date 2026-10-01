import glob
import json
import os
import re
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from enum import Enum
from typing import Any
from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, BackgroundTasks, Form, HTTPException
from fastapi.responses import FileResponse
from youtube_transcript_api import YouTubeTranscriptApi

from app.tools.youtube_downloader.cookies import cookies_args, cookies_configured, get_cookies_path

router = APIRouter(prefix="/youtube-downloader", tags=["youtube-downloader"])

VIDEO_ID_RE = re.compile(r"^[0-9A-Za-z_-]{11}$")


class VideoQuality(str, Enum):
    best = "best"
    uhd = "2160"
    qhd = "1440"
    fhd = "1080"
    hd = "720"
    sd = "480"
    low = "360"


def _video_format_args(
    quality: VideoQuality,
    *,
    clipping: bool = False,
    prefer_h264: bool = False,
) -> list[str]:
    # Prefer separate DASH (bv*+ba). Live streams often only have muxed HLS (m3u8),
    # so always fall back to a combined format (b / best).
    if quality == VideoQuality.best:
        sort = "res,fps"
        fmt = "bv*+ba/b"
    else:
        height = quality.value
        sort = f"res:{height},fps"
        fmt = f"bv*[height<={height}]+ba/b[height<={height}]/b"

    if prefer_h264:
        sort = f"{sort},vcodec:h264"

    args = [
        "-f",
        fmt,
        "-S",
        sort,
        "--merge-output-format",
        "mp4",
        "--concurrent-fragments",
        "16" if prefer_h264 else "8",
        "--retries",
        "5",
        "--fragment-retries",
        "10",
    ]
    # --check-formats probes URLs and can fail on live HLS / SABR streams.
    if not clipping:
        args.extend(["--check-formats"])
    return args


def _extractor_args(clients: str) -> str:
    return f"youtube:player_client={clients};player_js_version=actual"


DOWNLOAD_STRATEGIES = [
    (False, _extractor_args("android_vr,web_embedded")),
    (False, _extractor_args("web_safari,web_embedded,-tv_downgraded")),
    (True, _extractor_args("web_safari,web_embedded,-tv_downgraded")),
]

YTDLP_BASE_ARGS = [
    "--no-playlist",
    "--no-warnings",
    "--no-progress",
    "--js-runtimes",
    "deno",
    "--add-header",
    "Referer:https://www.youtube.com/",
    "--add-header",
    "Origin:https://www.youtube.com",
    "--downloader-args",
    "ffmpeg:-referer https://www.youtube.com/ -user_agent Mozilla/5.0",
]


def _extract_video_id(url: str) -> str:
    try:
        parsed = urlparse(url)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid URL: {exc}") from exc

    host = (parsed.netloc or "").lower()
    path = parsed.path or ""
    video_id: str | None = None

    if host.endswith("youtu.be"):
        video_id = path.lstrip("/").split("/", 1)[0]
    elif "youtube.com" in host or host.endswith("youtube-nocookie.com"):
        query = parse_qs(parsed.query or "")
        if "v" in query and query["v"]:
            video_id = query["v"][0]
        if not video_id:
            match = re.search(r"/(shorts|embed)/([^/?#&]+)", path)
            if match:
                video_id = match.group(2)

    if not video_id or not VIDEO_ID_RE.match(video_id):
        raise HTTPException(
            status_code=400,
            detail="Unsupported YouTube URL or unable to extract video id",
        )

    return video_id


def _build_yt_dlp_args(
    workdir: str,
    extra: list[str],
    *,
    use_cookies: bool,
    extractor_args: str,
) -> list[str]:
    cookie_args = cookies_args(workdir) if use_cookies else []
    return [
        *cookie_args,
        *YTDLP_BASE_ARGS,
        "--extractor-args",
        extractor_args,
        *extra,
    ]


def _run_yt_dlp(args: list[str], timeout_seconds: int) -> tuple[str, str]:
    try:
        proc = subprocess.run(
            ["yt-dlp", *args],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="Download timed out") from exc

    if proc.returncode != 0:
        stderr_tail = (proc.stderr or "").strip()[-2000:]
        raise HTTPException(status_code=422, detail=f"yt-dlp failed: {stderr_tail}")

    return (proc.stdout or "", proc.stderr or "")


def _should_retry_download(detail: str) -> bool:
    lowered = detail.lower()
    return any(
        token in lowered
        for token in (
            "403",
            "sign in",
            "login",
            "private",
            "age-restricted",
            "confirm your age",
            "ffmpeg exited",
            "access denied",
            "page needs to be reloaded",
            "no video formats",
            "requested format is not available",
        )
    )


def _run_yt_dlp_download(workdir: str, extra: list[str], timeout_seconds: int) -> tuple[str, str]:
    last_error: HTTPException | None = None
    for use_cookies, extractor_args in DOWNLOAD_STRATEGIES:
        if use_cookies and not cookies_configured():
            continue
        try:
            return _run_yt_dlp(
                _build_yt_dlp_args(
                    workdir,
                    extra,
                    use_cookies=use_cookies,
                    extractor_args=extractor_args,
                ),
                timeout_seconds,
            )
        except HTTPException as exc:
            last_error = exc
            if not _should_retry_download(str(exc.detail)):
                raise
            continue
    if last_error:
        raise last_error
    raise HTTPException(status_code=422, detail="Could not download video")


def _parse_timestamp(value: str) -> tuple[str, int]:
    raw = value.strip()
    if not re.fullmatch(r"\d{1,3}(?::[0-5]?\d){0,2}", raw):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid timestamp '{value}'. Use MM:SS or HH:MM:SS",
        )

    parts = [int(part) for part in raw.split(":")]
    if len(parts) == 1:
        total = parts[0]
        hours, remainder = divmod(total, 3600)
        minutes, seconds = divmod(remainder, 60)
    elif len(parts) == 2:
        minutes, seconds = parts
        if seconds >= 60:
            raise HTTPException(status_code=400, detail=f"Invalid timestamp '{value}'")
        hours = 0
        total = minutes * 60 + seconds
    else:
        hours, minutes, seconds = parts
        if minutes >= 60 or seconds >= 60:
            raise HTTPException(status_code=400, detail=f"Invalid timestamp '{value}'")
        total = hours * 3600 + minutes * 60 + seconds

    if hours > 0:
        return f"{hours}:{minutes:02d}:{seconds:02d}", total
    return f"{minutes}:{seconds:02d}", total


def _clip_section_args(start_time: str, end_time: str) -> list[str]:
    start_raw = (start_time or "").strip()
    end_raw = (end_time or "").strip()
    if not start_raw and not end_raw:
        return []

    start_label, start_seconds = ("0:00", 0)
    end_label = "inf"
    if start_raw:
        start_label, start_seconds = _parse_timestamp(start_raw)
    if end_raw:
        end_label, end_seconds = _parse_timestamp(end_raw)
        if end_seconds <= start_seconds:
            raise HTTPException(status_code=400, detail="End time must be after start time")

    return [
        "--download-sections",
        f"*{start_label}-{end_label}",
    ]


def _clip_seconds(start_time: str, end_time: str) -> tuple[float, float | None] | None:
    start_raw = (start_time or "").strip()
    end_raw = (end_time or "").strip()
    if not start_raw and not end_raw:
        return None

    start_seconds = 0.0
    end_seconds: float | None = None
    if start_raw:
        _, start_seconds_int = _parse_timestamp(start_raw)
        start_seconds = float(start_seconds_int)
    if end_raw:
        _, end_seconds_int = _parse_timestamp(end_raw)
        end_seconds = float(end_seconds_int)
        if end_seconds <= start_seconds:
            raise HTTPException(status_code=400, detail="End time must be after start time")
    return start_seconds, end_seconds


MIN_USABLE_BYTES = 500_000  # Reject empty/broken post-live section downloads (~145 KB)


def _probe_video_meta(url: str, workdir: str) -> dict[str, Any]:
    """Fetch live_status / duration without downloading media."""
    args = _build_yt_dlp_args(
        workdir,
        [
            "--skip-download",
            "--print",
            "%(live_status)s\t%(is_live)s\t%(duration)s\t%(title)s",
            url,
        ],
        use_cookies=False,
        extractor_args=_extractor_args("android_vr,web_embedded"),
    )
    try:
        stdout, _ = _run_yt_dlp(args, timeout_seconds=60)
    except HTTPException:
        return {"live_status": None, "is_live": False, "duration": None, "title": None}

    line = (stdout or "").strip().splitlines()[-1] if stdout.strip() else ""
    parts = line.split("\t")
    live_status = parts[0] if parts and parts[0] not in {"NA", "None", ""} else None
    is_live = len(parts) > 1 and parts[1].lower() in {"1", "true", "yes"}
    duration: float | None = None
    if len(parts) > 2 and parts[2] not in {"NA", "None", ""}:
        try:
            duration = float(parts[2])
        except ValueError:
            duration = None
    title = parts[3] if len(parts) > 3 else None
    return {
        "live_status": live_status,
        "is_live": is_live,
        "duration": duration,
        "title": title,
    }


def _needs_download_then_cut(meta: dict[str, Any]) -> bool:
    # Post-live / recently ended lives only expose DASH; ffmpeg --download-sections seek fails
    # and yields tiny broken files. Download full with native DASH, then cut locally.
    status = (meta.get("live_status") or "").lower()
    return status in {"post_live", "is_live"} or bool(meta.get("is_live"))


def _run_ffmpeg(args: list[str], timeout_seconds: int) -> None:
    try:
        proc = subprocess.run(
            ["ffmpeg", *args],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="ffmpeg timed out while cutting clip") from exc

    if proc.returncode != 0:
        stderr_tail = (proc.stderr or "").strip()[-1500:]
        raise HTTPException(status_code=422, detail=f"ffmpeg failed: {stderr_tail}")


def _cut_with_ffmpeg(
    source_path: str,
    output_path: str,
    start_seconds: float,
    end_seconds: float | None,
    timeout_seconds: int,
) -> None:
    duration = None if end_seconds is None else max(0.1, end_seconds - start_seconds)
    args = [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{start_seconds:.3f}",
        "-i",
        source_path,
    ]
    if duration is not None:
        args.extend(["-t", f"{duration:.3f}"])
    args.extend(["-c", "copy", "-movflags", "+faststart", output_path])
    _run_ffmpeg(args, timeout_seconds=timeout_seconds)


def _assert_usable_media(path: str, *, expected_min_seconds: float | None = None) -> None:
    size = os.path.getsize(path) if os.path.isfile(path) else 0
    if size < MIN_USABLE_BYTES:
        raise HTTPException(
            status_code=422,
            detail=(
                "El archivo descargado está incompleto (común en lives recién terminados). "
                "YouTube todavía está procesando el video: esperá unos minutos y reintentá, "
                "o bajá el video completo sin recorte."
            ),
        )

    if expected_min_seconds is None:
        return

    try:
        proc = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=nk=1:nw=1",
                path,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except Exception:
        return

    if proc.returncode != 0:
        return
    try:
        duration = float((proc.stdout or "").strip())
    except ValueError:
        return

    # Allow some slack for keyframe alignment / encoding.
    if duration < max(5.0, expected_min_seconds * 0.5):
        raise HTTPException(
            status_code=422,
            detail=(
                f"El clip quedó demasiado corto ({duration:.1f}s). "
                "En lives recién terminados YouTube a veces no permite recortar bien aún. "
                "Reintentá más tarde o sin recorte."
            ),
        )


def _find_first(workdir: str, exts: list[str]) -> str | None:
    for ext in exts:
        matches = glob.glob(os.path.join(workdir, f"*.{ext}"))
        if matches:
            matches.sort(key=lambda p: os.path.getsize(p), reverse=True)
            return matches[0]
    return None


def _fetch_oembed(canonical_url: str) -> dict[str, Any]:
    oembed_url = (
        "https://www.youtube.com/oembed?"
        f"url={urllib.parse.quote(canonical_url, safe='')}&format=json"
    )
    req = urllib.request.Request(
        oembed_url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; ToolsHub/1.0)"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


@router.get("/preview")
async def youtube_preview(url: str) -> dict[str, Any]:
    video_id = _extract_video_id(url)
    canonical_url = f"https://www.youtube.com/watch?v={video_id}"
    thumbnail_url = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"

    title: str | None = None
    author: str | None = None

    try:
        data = _fetch_oembed(canonical_url)
        title = data.get("title")
        author = data.get("author_name")
        thumbnail_url = data.get("thumbnail_url", thumbnail_url)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError):
        pass

    return {
        "video_id": video_id,
        "title": title or "Video de YouTube",
        "author": author,
        "thumbnail_url": thumbnail_url,
        "watch_url": canonical_url,
    }


@router.get("/info")
async def youtube_downloader_info() -> dict[str, Any]:
    return {
        "name": "YouTube Downloader",
        "description": "Download YouTube video, audio, or transcript",
        "input": ["url", "start_time", "end_time", "quality"],
        "output_formats": ["video/mp4", "audio/mpeg", "text/plain (transcript)"],
        "video_qualities": [item.value for item in VideoQuality],
        "cookies_configured": cookies_configured(),
        "cookies_path": str(get_cookies_path()),
    }


@router.post("/video")
async def download_youtube_video(
    url: str = Form(...),
    quality: VideoQuality = Form(VideoQuality.best),
    start_time: str = Form(""),
    end_time: str = Form(""),
    timeout_seconds: int = Form(600),
):
    video_id = _extract_video_id(url)
    clip = _clip_seconds(start_time, end_time)

    workdir = tempfile.mkdtemp(prefix=f"ytdlp_{video_id}_")
    background = BackgroundTasks()
    background.add_task(shutil.rmtree, workdir, ignore_errors=True)

    meta = _probe_video_meta(url, workdir)
    download_then_cut = bool(clip) and _needs_download_then_cut(meta)

    # Post-live full downloads can take a long time (many DASH fragments).
    effective_timeout = max(timeout_seconds, 3600) if download_then_cut else timeout_seconds

    outtmpl = os.path.join(workdir, "%(title).180s-%(height)sp.%(ext)s")
    if download_then_cut:
        # Native DASH works; --download-sections uses ffmpeg seek and breaks on post_live.
        # Prefer H.264 so the local ffmpeg cut with stream copy is reliable.
        extra = [
            *_video_format_args(quality, clipping=True, prefer_h264=True),
            "--output",
            outtmpl,
            url,
        ]
    else:
        clip_args = _clip_section_args(start_time, end_time)
        extra = [
            *_video_format_args(quality, clipping=bool(clip_args)),
            *clip_args,
            "--output",
            outtmpl,
            url,
        ]

    _run_yt_dlp_download(workdir, extra, effective_timeout)

    video_path = _find_first(workdir, ["mp4", "mkv", "webm", "mov"])
    if not video_path:
        raise HTTPException(status_code=422, detail="Could not locate downloaded video")

    if download_then_cut and clip:
        start_seconds, end_seconds = clip
        clip_path = os.path.join(workdir, f"clip-{video_id}.mp4")
        _cut_with_ffmpeg(
            video_path,
            clip_path,
            start_seconds,
            end_seconds,
            timeout_seconds=min(600, effective_timeout),
        )
        video_path = clip_path
        expected = None if end_seconds is None else max(1.0, end_seconds - start_seconds)
        _assert_usable_media(video_path, expected_min_seconds=expected)
    else:
        _assert_usable_media(video_path)

    ext = os.path.splitext(video_path)[1].lstrip(".").lower()
    media_types = {
        "mp4": "video/mp4",
        "mkv": "video/x-matroska",
        "webm": "video/webm",
        "mov": "video/quicktime",
    }

    return FileResponse(
        video_path,
        media_type=media_types.get(ext, "video/mp4"),
        filename=os.path.basename(video_path),
        background=background,
    )


@router.post("/audio")
async def download_youtube_audio(
    url: str = Form(...),
    audio_format: str = Form("mp3"),
    start_time: str = Form(""),
    end_time: str = Form(""),
    timeout_seconds: int = Form(600),
):
    if audio_format not in {"mp3"}:
        raise HTTPException(status_code=400, detail="Only 'mp3' is supported for audio")

    video_id = _extract_video_id(url)
    clip_args = _clip_section_args(start_time, end_time)

    workdir = tempfile.mkdtemp(prefix=f"ytdlp_{video_id}_")
    background = BackgroundTasks()
    background.add_task(shutil.rmtree, workdir, ignore_errors=True)

    outtmpl = os.path.join(workdir, "%(title).200s.%(ext)s")
    extra = [
        "--extract-audio",
        "--audio-format",
        audio_format,
        "--audio-quality",
        "0",
        *clip_args,
        "--output",
        outtmpl,
        url,
    ]
    _run_yt_dlp_download(workdir, extra, timeout_seconds)

    audio_path = _find_first(workdir, ["mp3", "m4a", "aac", "opus"])
    if not audio_path:
        raise HTTPException(status_code=422, detail="Could not locate downloaded audio")

    return FileResponse(
        audio_path,
        media_type="audio/mpeg",
        filename=os.path.basename(audio_path),
        background=background,
    )


@router.post("/transcript")
async def get_youtube_transcript(
    url: str = Form(...),
    language: str = Form(""),
    include_timestamps: bool = Form(False),
    start_time: str = Form(""),
    end_time: str = Form(""),
):
    video_id = _extract_video_id(url)
    clip = _clip_seconds(start_time, end_time)

    try:
        transcript_list = YouTubeTranscriptApi().list(video_id)
        if language:
            selected = transcript_list.find_transcript([language])
        else:
            selected = next(iter(transcript_list))
        transcript = selected.fetch().to_raw_data()
    except StopIteration:
        raise HTTPException(status_code=404, detail="No transcripts available for this video")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not fetch transcript: {exc}") from exc

    if clip:
        start_seconds, end_seconds = clip
        transcript = [
            seg
            for seg in transcript
            if float(seg.get("start") or 0) >= start_seconds
            and (end_seconds is None or float(seg.get("start") or 0) < end_seconds)
        ]

    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript is empty")

    if include_timestamps:
        segments = [
            {
                "start": seg.get("start"),
                "duration": seg.get("duration"),
                "text": seg.get("text", "").strip(),
            }
            for seg in transcript
        ]
        text = "\n".join(s["text"] for s in segments if s["text"])
        return {"video_id": video_id, "language": language or None, "text": text, "segments": segments}

    text = " ".join((seg.get("text") or "").strip() for seg in transcript).strip()
    return {"video_id": video_id, "language": language or None, "text": text}
