"""Servicio de descarga para la app Alabanza.

Contrato HTTP (si se reemplaza el servicio, basta con respetarlo):
  GET  /health                      -> {"ok": true, "yt_dlp": "<versión>"}
  GET  /search?q=texto              -> {"results": [{id,title,channel,duration,thumbnail,url}]}
  POST /download {url, song_id, fill_metadata?} -> Job
  GET  /jobs/{id}                   -> Job
  GET  /lyrics?track_name=&artist_name=&q=  -> respuesta de LRCLIB /api/search (respaldo)
  Job = {id, song_id, status: queued|downloading|uploading|done|error, progress, error}

Autenticación: header "Authorization: Bearer <access_token de Supabase>".
Para /download el usuario debe ser admin del grupo de la canción.
Si API_TOKEN está definido, además se exige el header "X-Api-Token".
"""

import asyncio
import logging
import shutil
import time
import uuid
from dataclasses import asdict, dataclass, field

import yt_dlp
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from . import config, supa, ytdl

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("downloader")

app = FastAPI(title="Alabanza downloader", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Api-Token"],
)


@app.exception_handler(Exception)
async def unhandled(_request: Request, exc: Exception) -> JSONResponse:
    log.exception("error no controlado: %r", exc)
    return JSONResponse(
        {"detail": "El servicio de descarga tuvo un error. Intenta de nuevo o sube el MP3 manualmente."},
        status_code=500,
    )


# ---------------------------------------------------------------- auth

async def current_user(
    authorization: str | None = Header(default=None),
    x_api_token: str | None = Header(default=None),
) -> dict:
    if config.API_TOKEN and x_api_token != config.API_TOKEN:
        raise HTTPException(401, "Token de la app inválido.")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Debes iniciar sesión en la app.")
    try:
        user = await supa.get_user(authorization.split(" ", 1)[1])
    except Exception as e:  # noqa: BLE001
        log.warning("no se pudo validar la sesión: %r", e)
        raise HTTPException(503, "No se pudo verificar tu sesión con Supabase. Intenta en un momento.") from e
    if not user:
        raise HTTPException(401, "Tu sesión expiró. Vuelve a iniciar sesión.")
    return user


# ---------------------------------------------------------------- jobs

@dataclass
class Job:
    id: str
    song_id: str
    url: str
    fill_metadata: bool
    group_id: str
    status: str = "queued"
    progress: float | None = None
    error: str | None = None
    created_at: float = field(default_factory=time.time)

    def public(self) -> dict:
        d = asdict(self)
        for k in ("url", "fill_metadata", "group_id", "created_at"):
            d.pop(k)
        return d


JOBS: dict[str, Job] = {}
QUEUE: asyncio.Queue[str] = asyncio.Queue()
JOB_TTL = 6 * 3600


def _cleanup_jobs() -> None:
    now = time.time()
    for jid in [j.id for j in JOBS.values() if now - j.created_at > JOB_TTL and j.status in ("done", "error")]:
        JOBS.pop(jid, None)


async def run_job(job: Job) -> None:
    loop = asyncio.get_running_loop()
    job.status = "downloading"
    job.progress = 0

    def on_progress(p: float) -> None:
        job.progress = round(p, 1)

    try:
        mp3, info = await loop.run_in_executor(None, ytdl.download_mp3, job.url, job.id, on_progress)
        job.status = "uploading"
        job.progress = None
        path = f"{job.group_id}/{job.song_id}.mp3"
        await supa.upload_audio(path, mp3)
        patch = {
            "audio_path": path,
            "audio_status": "ready",
            "audio_error": None,
            "duration_sec": int(info["duration"]) if info.get("duration") else None,
        }
        if not patch["duration_sec"]:
            patch.pop("duration_sec")
        if info.get("thumbnail"):
            patch["thumbnail_url"] = info["thumbnail"]
        if job.fill_metadata:
            title, artist = ytdl.guess_title_artist(info)
            patch["title"] = title[:200]
            patch["artist"] = artist
        await supa.update_song(job.song_id, patch)
        job.status = "done"
        log.info("job %s listo (%s)", job.id, job.url)
    except Exception as e:  # noqa: BLE001
        message = str(e) if isinstance(e, ytdl.DownloadError) else "Error interno al procesar el audio. Sube el MP3 manualmente."
        log.warning("job %s falló: %r", job.id, e)
        job.status = "error"
        job.error = message
        try:
            await supa.update_song(job.song_id, {"audio_status": "error", "audio_error": message})
        except Exception:  # noqa: BLE001
            log.exception("no se pudo marcar el error en la canción %s", job.song_id)
    finally:
        shutil.rmtree(f"{config.WORK_DIR}/{job.id}", ignore_errors=True)


async def worker(n: int) -> None:
    while True:
        jid = await QUEUE.get()
        job = JOBS.get(jid)
        if job:
            await run_job(job)
        QUEUE.task_done()
        _cleanup_jobs()


@app.on_event("startup")
async def startup() -> None:
    if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_ROLE_KEY:
        log.error("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY")
    log.info("yt-dlp %s, cookies: %s", yt_dlp.version.__version__, "sí" if config.cookies_path() else "no")
    for n in range(max(1, config.MAX_CONCURRENT_JOBS)):
        asyncio.create_task(worker(n))


# ---------------------------------------------------------------- rutas

@app.get("/health")
async def health() -> dict:
    return {"ok": True, "yt_dlp": yt_dlp.version.__version__, "queue": QUEUE.qsize()}


@app.get("/search")
async def search(q: str = Query(min_length=2, max_length=200), _user: dict = Depends(current_user)) -> dict:
    loop = asyncio.get_running_loop()
    try:
        results = await loop.run_in_executor(None, ytdl.search, q, 5)
    except ytdl.DownloadError as e:
        raise HTTPException(502, str(e).replace("No se pudo descargar el audio.", "No se pudo buscar.")) from e
    return {"results": results}


class DownloadRequest(BaseModel):
    url: str
    song_id: str
    fill_metadata: bool = False


@app.post("/download")
async def download(body: DownloadRequest, user: dict = Depends(current_user)) -> dict:
    url = body.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "El link no es válido.")
    try:
        uuid.UUID(body.song_id)
    except ValueError as e:
        raise HTTPException(400, "Canción inválida.") from e

    song = await supa.get_song(body.song_id)
    if not song:
        raise HTTPException(404, "La canción no existe.")
    role = await supa.get_role(song["group_id"], user["id"])
    if role != "admin":
        raise HTTPException(403, "Solo el administrador del grupo puede descargar canciones.")

    # Evitar trabajos duplicados para la misma canción.
    for j in JOBS.values():
        if j.song_id == body.song_id and j.status in ("queued", "downloading", "uploading"):
            return j.public()

    job = Job(id=uuid.uuid4().hex, song_id=body.song_id, url=url, fill_metadata=body.fill_metadata, group_id=song["group_id"])
    JOBS[job.id] = job
    await supa.update_song(body.song_id, {"audio_status": "processing", "audio_error": None, "source_url": url})
    await QUEUE.put(job.id)
    return job.public()


@app.get("/jobs/{job_id}")
async def get_job(job_id: str, _user: dict = Depends(current_user)) -> dict:
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "El trabajo ya no existe (el servicio se reinició). Reintenta la descarga.")
    return job.public()


@app.get("/lyrics")
async def lyrics(
    track_name: str | None = Query(default=None, max_length=200),
    artist_name: str | None = Query(default=None, max_length=200),
    q: str | None = Query(default=None, max_length=300),
    _user: dict = Depends(current_user),
) -> list:
    """Respaldo para LRCLIB cuando el navegador no puede consultarlo directo."""
    params = {k: v for k, v in {"track_name": track_name, "artist_name": artist_name, "q": q}.items() if v}
    if not params:
        raise HTTPException(400, "Falta el título.")
    r = await supa._client.get(
        "https://lrclib.net/api/search",
        params=params,
        headers={"User-Agent": "Alabanza PWA (https://github.com/carok19/listas)"},
    )
    if r.status_code != 200:
        raise HTTPException(502, "No se pudo consultar LRCLIB.")
    return r.json()
