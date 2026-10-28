#!/bin/sh
set -eu
TASK_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TASK_ENV="$TASK_ROOT/.venv/git-local"
if [ ! -x "$TASK_ENV/bin/python" ]; then
  python3 -m venv "$TASK_ENV"
fi
if ! "$TASK_ENV/bin/python" -c 'import fastapi, uvicorn' 2>/dev/null; then
  "$TASK_ENV/bin/python" -m pip install 'fastapi==0.115.6' 'uvicorn==0.34.0'
fi
cd "$TASK_ROOT/backend"
printf '%s\n' 'Git local listo en http://127.0.0.1:8766. Mantené esta terminal abierta.'
exec "$TASK_ENV/bin/python" -m uvicorn app.git_local:app --host 127.0.0.1 --port 8766 --reload --reload-dir app
