#!/bin/sh
set -e
# YouTube cambia seguido: actualizar yt-dlp en cada arranque.
echo "Actualizando yt-dlp..."
pip install --no-cache-dir -U "yt-dlp[default]" >/dev/null 2>&1 || echo "No se pudo actualizar yt-dlp; se usa la versión instalada."
python -c "import yt_dlp; print('yt-dlp', yt_dlp.version.__version__)"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers
