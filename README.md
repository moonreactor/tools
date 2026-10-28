# Tools Hub

Hub de herramientas con frontend Next.js y backend FastAPI, desplegado con Docker.

## Herramientas disponibles

- **Optimizar para web** — Convierte una carpeta de imágenes a WebP y guarda los originales en un backup con timestamp
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

## Optimizar para web

En `/tools/optimize-for-web`, elegí una carpeta local desde Chrome o Edge y presioná
**Optimizar imágenes a WebP**. Recorre también las subcarpetas y admite JPG, JPEG,
PNG, GIF, BMP, TIFF, HEIC, HEIF y AVIF (hasta 100 MB por archivo). Omite los WebP
existentes y las carpetas `backup` y `backup-*`.

La calidad predeterminada es 80%, ajustable. Conserva dimensiones, transparencia
y animaciones, y elimina metadatos. Guarda los originales en
`backup/<timestamp-UTC>-<id>/`, manteniendo la estructura de subcarpetas, y los
WebP junto a las imágenes de origen. Si un nombre ya existe, agrega un número.
Retira cada original solo después de completar su backup y escribir el WebP.
Ante un error conserva el original y continúa con las demás imágenes. Al terminar,
muestra los archivos convertidos, el peso antes/después, los errores y el backup.

Pruebas del manejo de carpetas: `cd frontend && node --test tests/webOptimizer.test.cjs`.

## Historial Git

Disponible en `/tools/git-history`: explorador de carpetas, grafo de ramas y merges,
búsqueda literal (sin distinguir mayúsculas) en el título y cuerpo, y edición del
mensaje completo de cualquier commit de la rama activa. Se muestran 100 commits
por página. Las otras ramas locales y remotas se pueden consultar sin hacer checkout.

### Acceso a repositorios de tu computadora

Iniciá el servicio local **fuera de Docker**, desde la raíz de este proyecto:

```bash
make git-local
```

Requiere Python 3.10+ y Git. El comando prepara un entorno Python aislado con
FastAPI y Uvicorn, y escucha únicamente en `127.0.0.1:8766`. Mantené esa terminal
abierta mientras usás la herramienta. Tools Hub puede seguir corriendo en Docker.
El servicio recarga automáticamente los cambios del backend. Si estaba abierto
desde una versión anterior y una función devuelve `Not Found`, detenelo con
Ctrl+C y volvé a ejecutar `make git-local`.

Presioná **Elegir carpeta de mi computadora** para abrir el selector nativo de
macOS. Al elegir el repositorio se carga su historial automáticamente. Cancelar
el selector conserva el repositorio abierto. También podés escribir una ruta local.
Si el navegador pide acceso a la red local, permitilo para conectar con el servicio.
No necesitás montar tus repositorios dentro de Docker.

Por defecto se permiten repositorios dentro de tu carpeta de usuario. Para elegir
otra raíz, usá `GIT_REPOS_ROOT=/ruta make git-local`. Los orígenes autorizados son
`http://localhost:3000` y `http://127.0.0.1:3000`; se pueden configurar con
`GIT_LOCAL_ORIGINS` (separados por coma). En otros sistemas operativos podés ingresar
la ruta manualmente; el selector nativo requiere macOS.

### Edición y respaldos

Para **buscar y reemplazar**, ingresá el texto en el buscador y completá
**Reemplazar por** (vacío permite eliminarlo). Presioná **Ver vista previa del
reemplazo** para revisar cada mensaje antes y después, y confirmá para aplicar.
El reemplazo es literal, con opción de distinguir mayúsculas, y alcanza el título
y cuerpo de todos los commits de la rama activa, incluidas las páginas no visibles.
Admite ramas de hasta 10.000 commits y mensajes UTF-8. Si la rama o su HEAD cambian
desde que cargaste el historial, se rechaza la operación y debés actualizarlo.
Los reemplazos que dejan mensajes vacíos se rechazan sin modificar el historial.
Cada aplicación crea un único respaldo y actualiza la rama de forma atómica.

Guardar requiere confirmar en la interfaz y tener el directorio de trabajo limpio,
una rama activa, un clon completo y ninguna operación Git en curso. Se conserva
el contenido de los archivos, autores, fechas y estructura de merges. Cambian el
hash del commit editado y los de sus descendientes; se eliminan sus firmas
criptográficas. Las demás ramas y etiquetas no se mueven y no se ejecuta push.

Cada edición crea una referencia `refs/tools-hub/backups/<id>` con el HEAD anterior.
La actualización de la rama y la creación del respaldo son atómicas. Si la rama
avanzó desde que se abrió el editor, se rechaza la edición y se pide actualizar.
Para recuperar el historial anterior sin tocar la rama actual, creá una rama:

```bash
git branch recuperar-mensajes refs/tools-hub/backups/<id>
```

Si los commits ya estaban publicados, coordiná con tus colaboradores antes de
actualizar el remoto con el historial reescrito. Usá esta herramienta en tu entorno
local; el servicio local tiene acceso de escritura a los repositorios permitidos.

Pruebas de la herramienta (desde la raíz):

```bash
PYTHONPATH=backend python3 -m unittest discover -s backend/tests -v
```
