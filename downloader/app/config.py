import os
import tempfile


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


SUPABASE_URL = _env("SUPABASE_URL").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = _env("SUPABASE_SERVICE_ROLE_KEY")
AUDIO_BUCKET = _env("AUDIO_BUCKET", "audio")

# Capa extra opcional: si se define, el cliente debe mandar X-Api-Token.
API_TOKEN = _env("API_TOKEN")

# Orígenes permitidos para CORS, separados por coma. "*" = cualquiera.
ALLOWED_ORIGINS = [o.strip() for o in _env("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

# Sitios que /page puede leer para la versión web (el navegador no puede por CORS).
LYRICS_HOSTS = {
    h.strip().lower()
    for h in _env(
        "LYRICS_HOSTS",
        "letras.com,www.letras.com,letras.mus.br,www.letras.mus.br,solr.sscdn.co,genius.com,www.lyrics.com",
    ).split(",")
    if h.strip()
}

MAX_DURATION_SEC = int(_env("MAX_DURATION_SEC", "1200"))  # 20 minutos
MAX_CONCURRENT_JOBS = int(_env("MAX_CONCURRENT_JOBS", "2"))
MP3_QUALITY = _env("MP3_QUALITY", "128")  # kbps

# Cookies de YouTube (formato Netscape). Se puede pasar el contenido
# completo en YTDLP_COOKIES o la ruta a un archivo en YTDLP_COOKIES_FILE
# (por ejemplo un "Secret File" de Render en /etc/secrets/cookies.txt).
YTDLP_COOKIES = os.environ.get("YTDLP_COOKIES", "")
YTDLP_COOKIES_FILE = _env("YTDLP_COOKIES_FILE")

WORK_DIR = _env("WORK_DIR", os.path.join(tempfile.gettempdir(), "alabanza-dl"))


def cookies_path() -> str | None:
    """Devuelve una ruta de cookies utilizable, o None si no hay."""
    if YTDLP_COOKIES_FILE and os.path.isfile(YTDLP_COOKIES_FILE):
        # yt-dlp reescribe el archivo de cookies; copiarlo a un lugar escribible
        # (los Secret Files de Render son de solo lectura).
        dst = os.path.join(WORK_DIR, "cookies.txt")
        os.makedirs(WORK_DIR, exist_ok=True)
        with open(YTDLP_COOKIES_FILE, "rb") as src, open(dst, "wb") as out:
            out.write(src.read())
        return dst
    if YTDLP_COOKIES.strip():
        dst = os.path.join(WORK_DIR, "cookies.txt")
        os.makedirs(WORK_DIR, exist_ok=True)
        with open(dst, "w", encoding="utf-8") as f:
            f.write(YTDLP_COOKIES.replace("\\n", "\n"))
        return dst
    return None
