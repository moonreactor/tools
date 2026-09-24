import io
from enum import Enum

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pillow_heif import register_heif_opener
from PIL import Image

register_heif_opener()

router = APIRouter(prefix="/image-converter", tags=["image-converter"])

ALLOWED_EXTENSIONS = {".heic", ".heif"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


class OutputFormat(str, Enum):
    jpg = "jpg"
    png = "png"


def _validate_file(filename: str | None) -> None:
    if not filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )


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
        if image.mode in ("RGBA", "P") and output_format == OutputFormat.jpg:
            image = image.convert("RGB")
        elif image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGB")

        buffer = io.BytesIO()
        if output_format == OutputFormat.png:
            image.save(buffer, format="PNG", optimize=True)
            media_type = "image/png"
            ext = "png"
        else:
            if image.mode == "RGBA":
                image = image.convert("RGB")
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
        "description": "Convert HEIC/HEIF images to JPG or PNG",
        "input_formats": list(ALLOWED_EXTENSIONS),
        "output_formats": ["jpg", "png"],
        "max_file_size_mb": MAX_FILE_SIZE // (1024 * 1024),
    }
