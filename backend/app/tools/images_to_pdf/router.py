import io
from enum import Enum

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

register_heif_opener()

router = APIRouter(prefix="/images-to-pdf", tags=["images-to-pdf"])

ALLOWED_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".bmp",
    ".tif",
    ".tiff",
    ".heic",
    ".heif",
}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB per image
MAX_TOTAL_SIZE = 100 * 1024 * 1024  # 100 MB total
MAX_FILES = 50
TARGET_DPI = 150
A4_INCHES = (8.27, 11.69)
LETTER_INCHES = (8.5, 11.0)


class PageSize(str, Enum):
    auto = "auto"
    a4 = "a4"
    letter = "letter"


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
            detail=f"Unsupported format '{filename}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )


def _open_rgb(content: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(content))
    image = ImageOps.exif_transpose(image) or image
    image.load()
    if getattr(image, "n_frames", 1) > 1:
        image.seek(0)
    if image.mode != "RGB":
        image = image.convert("RGB")
    return image


def _fit_to_page(image: Image.Image, page_size: PageSize) -> Image.Image:
    if page_size == PageSize.auto:
        return image

    inches = A4_INCHES if page_size == PageSize.a4 else LETTER_INCHES
    img_w, img_h = image.size
    if img_w > img_h:
        page_w_in, page_h_in = inches[1], inches[0]
    else:
        page_w_in, page_h_in = inches

    page_w = max(1, int(page_w_in * TARGET_DPI))
    page_h = max(1, int(page_h_in * TARGET_DPI))
    canvas = Image.new("RGB", (page_w, page_h), "white")

    margin = int(min(page_w, page_h) * 0.03)
    max_w = max(1, page_w - 2 * margin)
    max_h = max(1, page_h - 2 * margin)
    ratio = min(max_w / img_w, max_h / img_h)
    new_w = max(1, int(img_w * ratio))
    new_h = max(1, int(img_h * ratio))
    resized = image.resize((new_w, new_h), Image.Resampling.LANCZOS)
    canvas.paste(resized, ((page_w - new_w) // 2, (page_h - new_h) // 2))
    return canvas


@router.post("/convert")
async def images_to_pdf(
    files: list[UploadFile] = File(...),
    page_size: PageSize = Form(PageSize.a4),
    quality: int = Form(90),
):
    if not files:
        raise HTTPException(status_code=400, detail="At least one image is required")
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_FILES} images allowed")
    if not 1 <= quality <= 100:
        raise HTTPException(status_code=400, detail="Quality must be between 1 and 100")

    pages: list[Image.Image] = []
    total_size = 0

    try:
        for upload in files:
            _validate_file(upload.filename)
            content = await upload.read()
            if len(content) > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=400,
                    detail=f"File '{upload.filename}' exceeds 20 MB limit",
                )
            total_size += len(content)
            if total_size > MAX_TOTAL_SIZE:
                raise HTTPException(status_code=400, detail="Total upload exceeds 100 MB limit")

            try:
                image = _open_rgb(content)
            except Exception as exc:
                raise HTTPException(
                    status_code=422,
                    detail=f"Could not read image '{upload.filename}': {exc}",
                ) from exc
            page = _fit_to_page(image, page_size)
            if page is not image:
                image.close()
            pages.append(page)

        try:
            buffer = io.BytesIO()
            first, rest = pages[0], pages[1:]
            first.save(
                buffer,
                format="PDF",
                save_all=True,
                append_images=rest,
                resolution=TARGET_DPI,
                quality=quality,
            )
            buffer.seek(0)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Could not generate PDF: {exc}") from exc

        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="images.pdf"'},
        )
    finally:
        for page in pages:
            page.close()


@router.get("/info")
async def images_to_pdf_info():
    return {
        "name": "Images to PDF",
        "description": "Combine multiple images into a PDF, one image per page",
        "input_formats": list(ALLOWED_EXTENSIONS),
        "output_formats": ["pdf"],
        "page_sizes": [item.value for item in PageSize],
        "max_files": MAX_FILES,
        "max_file_size_mb": MAX_FILE_SIZE // (1024 * 1024),
        "max_total_size_mb": MAX_TOTAL_SIZE // (1024 * 1024),
    }
