import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.tools.gif_to_jpg.router import router as gif_to_jpg_router
from app.tools.image_converter.router import router as image_converter_router
from app.tools.images_to_pdf.router import router as images_to_pdf_router
from app.tools.youtube_downloader.router import router as youtube_downloader_router

app = FastAPI(
    title="Tools API",
    description="Backend API for Moonreactor tools hub",
    version="1.0.0",
)

cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(image_converter_router, prefix="/api/tools")
app.include_router(images_to_pdf_router, prefix="/api/tools")
app.include_router(youtube_downloader_router, prefix="/api/tools")
app.include_router(gif_to_jpg_router, prefix="/api/tools")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/tools")
async def list_tools():
    return {
        "tools": [
            {
                "id": "image-converter",
                "name": "Conversor de imágenes",
                "description": "Convierte HEIC, AVIF y WEBP a JPG o PNG",
                "path": "/tools/image-converter",
                "icon": "image",
            },
            {
                "id": "images-to-pdf",
                "name": "Imágenes a PDF",
                "description": "Armá un PDF con varias imágenes, una por página",
                "path": "/tools/images-to-pdf",
                "icon": "file-image",
            },
            {
                "id": "youtube-downloader",
                "name": "Descargador YouTube",
                "description": "Descargá video, audio o transcripción desde un link",
                "path": "/tools/youtube-downloader",
                "icon": "youtube",
            },
            {
                "id": "gif-to-jpg",
                "name": "GIF a JPG (carpeta)",
                "description": "Recorre una carpeta, convierte .gif a .jpg y reemplaza los originales",
                "path": "/tools/gif-to-jpg",
                "icon": "folder-image",
            },
        ]
    }
