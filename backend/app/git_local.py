"""Run on the user's computer, never inside Docker: make git-local."""
import os
import subprocess
import sys

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.tools.git_history.router import router

app = FastAPI(title="Tools Hub · Git local")
origins = os.getenv("GIT_LOCAL_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


@app.middleware("http")
async def local_access(request: Request, call_next):
    if request.url.hostname not in {"127.0.0.1", "localhost"}:
        return JSONResponse({"detail": "Host no permitido."}, status_code=403)
    if request.headers.get("origin") not in [*origins, None]:
        return JSONResponse({"detail": "Origen no permitido."}, status_code=403)
    response = await call_next(request)
    if request.method == "OPTIONS" and request.headers.get("access-control-request-private-network") == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


@app.post("/api/tools/git-history/pick-folder")
def pick_folder():
    if sys.platform == "darwin":
        try:
            result = subprocess.run(
                ["osascript", "-e", 'POSIX path of (choose folder with prompt "Elegí el repositorio Git")'],
                capture_output=True, text=True, timeout=300,
            )
        except subprocess.TimeoutExpired:
            raise HTTPException(408, "Se agotó el tiempo para seleccionar la carpeta.")
        if result.returncode:
            if "(-128)" in result.stderr:
                return {"path": None}
            raise HTTPException(400, "No se pudo abrir el selector de carpetas de macOS.")
        return {"path": result.stdout.strip()}
    raise HTTPException(400, "El selector nativo está disponible en macOS. Podés ingresar la ruta de tu computadora manualmente.")


app.include_router(router, prefix="/api/tools")
