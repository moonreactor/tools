import io
from enum import Enum

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

register_heif_opener()

try:
    from pillow_heif import register_avif_opener

    register_avif_opener()
except ImportError:
    pass

router = APIRouter(prefix="/image-converter", tags=["image-converter"])

ALLOWED_EXTENSIONS = {".heic", ".heif", ".avif", ".webp"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


class OutputFormat(str, Enum):
    jpg = "jpg"
    png = "png"


def _extension(filename: str | None) -> str:
    if not filename or "." not in filename:
        return ""
    return "." + filename.rsplit(".", 1)[-1].lower()


def _validate_file(filename: str | None) -> None:
    if not filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    ext = _extension(filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )


def _prepare_image(image: Image.Image, output_format: OutputFormat) -> Image.Image:
    image = ImageOps.exif_transpose(image) or image
    if getattr(image, "n_frames", 1) > 1:
        image.seek(0)

    if output_format == OutputFormat.jpg:
        if image.mode in ("RGBA", "LA", "P"):
            background = Image.new("RGB", image.size, (255, 255, 255))
            rgba = image.convert("RGBA")
            background.paste(rgba, mask=rgba.split()[-1])
            return background
        if image.mode != "RGB":
            return image.convert("RGB")
        return image

    if image.mode not in ("RGB", "RGBA"):
        return image.convert("RGBA") if "A" in image.getbands() else image.convert("RGB")
    return image


@router.post("/convert")
async def convert_image(
    file: UploadFile = File(...),
    output_format: OutputFormat = Form(OutputFormat.jpg),
    quality: int = Form(90),
):
    _validate_file(file.filename)

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 50 MB limit")

    if not 1 <= quality <= 100:
        raise HTTPException(status_code=400, detail="Quality must be between 1 and 100")

    try:
        image = Image.open(io.BytesIO(content))
        image = _prepare_image(image, output_format)

        buffer = io.BytesIO()
        if output_format == OutputFormat.png:
            image.save(buffer, format="PNG", optimize=True)
            media_type = "image/png"
            ext = "png"
        else:
            image.save(buffer, format="JPEG", quality=quality, optimize=True)
            media_type = "image/jpeg"
            ext = "jpg"

        buffer.seek(0)
        original_name = file.filename.rsplit(".", 1)[0] if file.filename else "converted"
        output_filename = f"{original_name}.{ext}"

        return StreamingResponse(
            buffer,
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{output_filename}"'},
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not convert image: {exc}") from exc


@router.get("/info")
async def converter_info():
    return {
        "name": "Image Converter",
        "description": "Convert HEIC, AVIF and WEBP images to JPG or PNG",
        "input_formats": sorted(ALLOWED_EXTENSIONS),
        "output_formats": ["jpg", "png"],
        "max_file_size_mb": MAX_FILE_SIZE // (1024 * 1024),
    }
