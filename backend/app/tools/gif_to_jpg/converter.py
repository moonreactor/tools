import io
from pathlib import Path

from PIL import Image


def _gif_image_to_rgb(image: Image.Image) -> Image.Image:
    image.seek(0)
    frame = image.convert("RGBA") if image.mode in ("P", "RGBA", "LA") else image.convert("RGB")

    if frame.mode == "RGBA":
        background = Image.new("RGB", frame.size, (255, 255, 255))
        background.paste(frame, mask=frame.split()[-1])
        return background
    if frame.mode != "RGB":
        return frame.convert("RGB")
    return frame


def convert_gif_bytes_to_jpg(content: bytes, quality: int = 90) -> bytes:
    with Image.open(io.BytesIO(content)) as image:
        frame = _gif_image_to_rgb(image)
        buffer = io.BytesIO()
        frame.save(buffer, format="JPEG", quality=quality, optimize=True)
        return buffer.getvalue()


def convert_gif_to_jpg(gif_path: Path, quality: int = 90) -> Path:
    """Convert a GIF to JPG next to it, then remove the original GIF."""
    jpg_path = gif_path.with_suffix(".jpg")
    content = gif_path.read_bytes()
    jpg_bytes = convert_gif_bytes_to_jpg(content, quality=quality)
    jpg_path.write_bytes(jpg_bytes)
    gif_path.unlink(missing_ok=True)
    return jpg_path
