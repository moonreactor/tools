# Tools Hub

Hub de herramientas con frontend Next.js y backend FastAPI, desplegado con Docker.

## Herramientas disponibles

- **Conversor de imágenes** — Convierte HEIC, AVIF y WEBP a JPG o PNG
- **Editor de imágenes** — Recorte, brillo/contraste/saturación y filtros; reemplaza o guarda copia
- **Imágenes a PDF** — Combina varias imágenes en un PDF, una por página
- **Descargador YouTube** — Descarga video, audio o transcripción desde un link
- **GIF a JPG (carpeta)** — Recorre una carpeta, convierte `.gif` → `.jpg` y elimina los originales

## Requisitos

- Docker y Docker Compose
- `yt-dlp` en el host (solo para sincronizar cookies de YouTube): `brew install yt-dlp`

## Inicio rápido

### Desarrollo (hot reload)

Para que los cambios en el código se reflejen solos, sin `make build` en cada edit:

```bash
make down   # si ya tenías contenedores corriendo
make dev
```

- Frontend (`next dev`) y backend (`uvicorn --reload`) montan el código local
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- Docs API: http://localhost:8000/docs

### Producción local (imagen build)

```bash
make up
```

O manualmente:

```bash
./scripts/sync-youtube-cookies.sh   # una vez (o cuando expiren las cookies)
docker compose up --build
```

## Estructura

```
tools-varias/
├── docker-compose.yml
├── frontend/          # Next.js — UI del hub
│   └── app/tools/
│       ├── image-converter/
│       ├── image-editor/
│       ├── images-to-pdf/
│       ├── youtube-downloader/
│       └── gif-to-jpg/
└── backend/           # FastAPI
    └── app/tools/
        ├── image_converter/
        ├── images_to_pdf/
        ├── youtube_downloader/
        └── gif_to_jpg/
├── workspace/         # Carpetas a convertir (GIF → JPG)
```
## Desarrollo local (sin Docker)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

> En macOS/Linux necesitás `libheif` instalado (`brew install libheif`).

### Frontend

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

## Agregar nuevas herramientas

1. Crear router en `backend/app/tools/<nombre>/router.py`
2. Registrar en `backend/app/main.py`
3. Crear página en `frontend/app/tools/<nombre>/page.tsx`
4. Agregar entrada en `frontend/components/Sidebar.tsx`

## Cookies de YouTube (automático)

YouTube bloquea descargas sin cookies. El backend las lee automáticamente desde `cookies/youtube.txt`, montado en Docker.

Para generar/actualizar las cookies desde tu navegador (Chrome por defecto):

```bash
make youtube-cookies
# o con otro navegador:
BROWSER=firefox make youtube-cookies
docker compose restart backend
```

El archivo `cookies/youtube.txt` está en `.gitignore` y no se commitea.

## GIF a JPG (carpeta)

En la UI (`/tools/gif-to-jpg`) hacé clic en **Elegir carpeta** y seleccioná cualquier carpeta de tu Mac (Chrome o Edge).

La tool:
1. Escanea `.gif` de forma recursiva
2. Convierte cada uno a `.jpg`
3. Escribe el `.jpg` en el mismo lugar y **borra el `.gif` original**

> Requiere permiso de lectura/escritura que el navegador pide al elegir la carpeta.