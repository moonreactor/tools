import io
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image, ImageOps, ImageSequence, UnidentifiedImageError
from pillow_heif import register_heif_opener

register_heif_opener()
try:
    from pillow_heif import register_avif_opener

    register_avif_opener()
except ImportError:
    pass

router = APIRouter(prefix="/optimize-for-web", tags=["optimize-for-web"])
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tif", ".tiff", ".heic", ".heif", ".avif"}
MAX_FILE_SIZE = 100 * 1024 * 1024


def optimize_image(content: bytes, quality: int = 80) -> bytes:
    with Image.open(io.BytesIO(content)) as source:
        if source.format == "WEBP":
            raise ValueError("Las imágenes WebP existentes no se modifican")
        # Keep animation timing and transparency; omit EXIF/GPS and other metadata.
        animated = bool(getattr(source, "is_animated", False))
        frames = []
        durations = []
        for frame in ImageSequence.Iterator(source):
            oriented = ImageOps.exif_transpose(frame)
            mode = "RGBA" if "A" in oriented.getbands() or "transparency" in oriented.info else "RGB"
            frames.append(oriented.convert(mode))
            durations.append(frame.info.get("duration", 100))
            if not animated:
                break
        output = io.BytesIO()
        options = {"quality": quality, "method": 6}
        if animated:
            options.update(save_all=True, append_images=frames[1:], duration=durations, loop=source.info.get("loop", 0))
        frames[0].save(output, format="WEBP", **options)
        return output.getvalue()


@router.post("/convert-file")
def convert_file(file: UploadFile = File(...), quality: int = Form(80)):
    if Path(file.filename or "").suffix.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Formato no compatible; los WebP se omiten")
    if not 1 <= quality <= 100:
        raise HTTPException(status_code=400, detail="La calidad debe estar entre 1 y 100")
    content = file.file.read(MAX_FILE_SIZE + 1)
    if not content or len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="La imagen debe pesar entre 1 byte y 100 MB")
    try:
        return Response(content=optimize_image(content, quality), media_type="image/webp")
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=422, detail=f"No se pudo convertir la imagen: {exc}") from exc
