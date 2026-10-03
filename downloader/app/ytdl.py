"""Envoltorio de yt-dlp: búsqueda y descarga de audio en MP3."""

import glob
import os
import re
from typing import Callable

import yt_dlp

from . import config


class DownloadError(Exception):
    """Error con mensaje en español listo para mostrar al usuario."""

    def __init__(self, message: str, blocked: bool = False):
        super().__init__(message)
        # True cuando el sitio bloqueó al servidor (no es culpa del link).
        self.blocked = blocked


def is_blocked(err: Exception) -> bool:
    low = str(err).lower()
    return any(s in low for s in ("sign in to confirm", "not a bot", "429", "too many requests"))


def _base_opts() -> dict:
    opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "socket_timeout": 30,
        "retries": 3,
        "extractor_retries": 2,
    }
    cookies = config.cookies_path()
    if cookies:
        opts["cookiefile"] = cookies
    return opts


def friendly_error(err: Exception) -> str:
    msg = str(err)
    low = msg.lower()
    if "sign in to confirm" in low or "not a bot" in low or "429" in low or "too many requests" in low:
        return (
            "YouTube bloqueó la descarga desde el servidor. Sube el MP3 manualmente "
            "o pide al administrador que configure las cookies del servicio."
        )
    if "private video" in low:
        return "El video es privado. Sube el MP3 manualmente."
    if "video unavailable" in low or "not available" in low or "has been removed" in low:
        return "El video no está disponible (borrado o bloqueado en tu país). Sube el MP3 manualmente."
    if "age" in low and ("restricted" in low or "confirm your age" in low):
        return "El video tiene restricción de edad. Sube el MP3 manualmente."
    if "unsupported url" in low:
        return "Ese link no es compatible. Usa un link de YouTube u otro sitio de video, o sube el MP3 manualmente."
    if "live event" in low or "is live" in low or "premiere" in low:
        return "No se pueden descargar transmisiones en vivo. Sube el MP3 manualmente."
    if "ffmpeg" in low:
        return "Error al convertir el audio a MP3. Sube el MP3 manualmente."
    if "timed out" in low or "timeout" in low or "connection" in low:
        return "Se agotó el tiempo de conexión con el sitio. Intenta de nuevo o sube el MP3 manualmente."
    return "No se pudo descargar el audio. Intenta otra vez o sube el MP3 manualmente."


def search(query: str, limit: int = 5) -> list[dict]:
    opts = _base_opts() | {"extract_flat": "in_playlist", "skip_download": True}
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)
    except Exception as e:  # noqa: BLE001
        raise DownloadError(friendly_error(e)) from e
    results = []
    for entry in (info or {}).get("entries") or []:
        if not entry:
            continue
        vid = entry.get("id")
        thumbs = entry.get("thumbnails") or []
        thumb = thumbs[-1]["url"] if thumbs else (f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg" if vid else None)
        results.append(
            {
                "id": vid,
                "title": entry.get("title") or "",
                "channel": entry.get("channel") or entry.get("uploader"),
                "duration": entry.get("duration"),
                "thumbnail": thumb,
                "url": entry.get("url") if str(entry.get("url", "")).startswith("http") else f"https://www.youtube.com/watch?v={vid}",
            }
        )
    return results


_CLEAN_RE = re.compile(
    r"\s*[\(\[](?:official|oficial|video|lyric|letra|audio|en vivo|live|hd|4k)[^\)\]]*[\)\]]", re.IGNORECASE
)


def guess_title_artist(info: dict) -> tuple[str, str | None]:
    if info.get("track"):
        return info["track"], info.get("artist") or info.get("creator")
    raw = _CLEAN_RE.sub("", info.get("title") or "").split("|")[0].strip()
    parts = re.split(r"\s+[-–—]\s+", raw, maxsplit=1)
    if len(parts) == 2:
        return parts[1].strip(), parts[0].strip()
    channel = (info.get("channel") or info.get("uploader") or "").replace(" - Topic", "").strip()
    return raw or "Sin título", channel or None


def download_mp3(url: str, job_id: str, on_progress: Callable[[float], None]) -> tuple[str, dict]:
    """Descarga el audio y lo convierte a MP3. Devuelve (ruta_mp3, info)."""
    out_dir = os.path.join(config.WORK_DIR, job_id)
    os.makedirs(out_dir, exist_ok=True)

    def hook(d: dict) -> None:
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            if total:
                on_progress(min(99.0, d.get("downloaded_bytes", 0) * 100 / total))

    def check_duration(info: dict, *, incomplete: bool) -> str | None:
        dur = info.get("duration")
        if info.get("is_live"):
            return "No se pueden descargar transmisiones en vivo."
        if dur and dur > config.MAX_DURATION_SEC:
            return f"El audio dura más de {config.MAX_DURATION_SEC // 60} minutos."
        return None

    opts = _base_opts() | {
        "format": "bestaudio/best",
        "outtmpl": os.path.join(out_dir, "audio.%(ext)s"),
        "progress_hooks": [hook],
        "match_filter": check_duration,
        "postprocessors": [
            {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": config.MP3_QUALITY}
        ],
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
    except Exception as e:  # noqa: BLE001
        raise DownloadError(friendly_error(e), blocked=is_blocked(e)) from e

    if info is None:
        raise DownloadError("No se pudo leer la información del video.")
    files = glob.glob(os.path.join(out_dir, "*.mp3"))
    if not files:
        reason = check_duration(info, incomplete=False)
        raise DownloadError((reason + " Sube el MP3 manualmente.") if reason else "No se generó el MP3. Sube el MP3 manualmente.")
    return files[0], info


def find_soundcloud(query: str, target_duration: int | None) -> str | None:
    """Busca la canción en SoundCloud (plan B cuando YouTube bloquea al servidor).

    Descarta previews de 30 s y resultados con duración muy distinta.
    """
    opts = _base_opts() | {"extract_flat": "in_playlist", "skip_download": True}
    opts.pop("cookiefile", None)
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"scsearch8:{query}", download=False)
    except Exception:  # noqa: BLE001
        return None
    for entry in (info or {}).get("entries") or []:
        if not entry or not entry.get("url"):
            continue
        dur = entry.get("duration")
        if dur and dur < 60:
            continue
        if target_duration and dur and abs(dur - target_duration) > max(30, target_duration * 0.25):
            continue
        return entry["url"]
    return None
