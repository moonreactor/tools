import io
import unittest

from fastapi import HTTPException, UploadFile
from PIL import Image

from app.tools.optimize_for_web.router import convert_file, optimize_image


def image_bytes(mode="RGB", format="PNG", **options):
    output = io.BytesIO()
    Image.new(mode, (24, 16)).save(output, format=format, **options)
    return output.getvalue()


class OptimizeForWebTests(unittest.TestCase):
    def test_formats_and_transparency(self):
        for format, mode in [("JPEG", "RGB"), ("PNG", "RGBA"), ("BMP", "RGB"), ("TIFF", "RGB")]:
            with self.subTest(format=format):
                with Image.open(io.BytesIO(optimize_image(image_bytes(mode, format)))) as image:
                    self.assertEqual(image.format, "WEBP")
                    self.assertEqual(image.size, (24, 16))
                    if mode == "RGBA":
                        self.assertEqual(image.getpixel((0, 0))[3], 0)

    def test_orientation_and_metadata(self):
        exif = Image.Exif()
        exif[274] = 6
        exif[270] = "private metadata"
        result = optimize_image(image_bytes(format="JPEG", exif=exif))
        with Image.open(io.BytesIO(result)) as image:
            self.assertEqual(image.size, (16, 24))
            self.assertFalse(image.getexif())

    def test_animation(self):
        output = io.BytesIO()
        Image.new("RGB", (24, 16), "red").save(
            output, format="GIF", save_all=True,
            append_images=[Image.new("RGB", (24, 16), "blue")], duration=[100, 200], loop=2,
        )
        with Image.open(io.BytesIO(optimize_image(output.getvalue()))) as image:
            self.assertEqual(image.n_frames, 2)
            self.assertEqual(image.info["loop"], 2)
            durations = []
            for frame in range(image.n_frames):
                image.seek(frame)
                image.load()
                durations.append(image.info["duration"])
            self.assertEqual(durations, [100, 200])

    def test_endpoint_and_validation(self):
        response = convert_file(UploadFile(filename="PHOTO.JPG", file=io.BytesIO(image_bytes(format="JPEG"))), 80)
        self.assertEqual(response.media_type, "image/webp")
        for filename, content, quality, status in [
            ("image.webp", image_bytes(format="WEBP"), 80, 400),
            ("image.png", image_bytes(format="WEBP"), 80, 422),
            ("image.png", b"invalid", 80, 422),
            ("image.jpg", b"", 80, 400),
            ("image.jpg", image_bytes(), 101, 400),
        ]:
            with self.subTest(filename=filename, quality=quality):
                with self.assertRaises(HTTPException) as raised:
                    convert_file(UploadFile(filename=filename, file=io.BytesIO(content)), quality)
                self.assertEqual(raised.exception.status_code, status)
