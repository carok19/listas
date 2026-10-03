"""Acceso mínimo a Supabase (Auth, PostgREST y Storage) con la service_role key."""

import httpx

from . import config

_client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=300.0))


def _service_headers(extra: dict | None = None) -> dict:
    key = config.SUPABASE_SERVICE_ROLE_KEY
    h = {"apikey": key}
    # Las llaves nuevas (sb_secret_...) no son JWT: basta con el header apikey.
    # Las legacy (service_role, eyJ...) también van como Bearer.
    if not key.startswith("sb_"):
        h["Authorization"] = f"Bearer {key}"
    if extra:
        h.update(extra)
    return h


async def get_user(access_token: str) -> dict | None:
    """Valida el token de sesión del usuario contra Supabase Auth."""
    r = await _client.get(
        f"{config.SUPABASE_URL}/auth/v1/user",
        headers={"apikey": config.SUPABASE_SERVICE_ROLE_KEY, "Authorization": f"Bearer {access_token}"},
    )
    if r.status_code != 200:
        return None
    return r.json()


async def get_song(song_id: str) -> dict | None:
    r = await _client.get(
        f"{config.SUPABASE_URL}/rest/v1/songs",
        params={"id": f"eq.{song_id}", "select": "id,group_id,title,artist,thumbnail_url,duration_sec,audio_status"},
        headers=_service_headers(),
    )
    r.raise_for_status()
    rows = r.json()
    return rows[0] if rows else None


async def get_role(group_id: str, user_id: str) -> str | None:
    r = await _client.get(
        f"{config.SUPABASE_URL}/rest/v1/group_members",
        params={"group_id": f"eq.{group_id}", "user_id": f"eq.{user_id}", "select": "role"},
        headers=_service_headers(),
    )
    r.raise_for_status()
    rows = r.json()
    return rows[0]["role"] if rows else None


async def update_song(song_id: str, patch: dict) -> None:
    r = await _client.patch(
        f"{config.SUPABASE_URL}/rest/v1/songs",
        params={"id": f"eq.{song_id}"},
        json=patch,
        headers=_service_headers({"Prefer": "return=minimal"}),
    )
    r.raise_for_status()


async def upload_audio(path: str, file_path: str) -> None:
    with open(file_path, "rb") as f:
        data = f.read()
    r = await _client.post(
        f"{config.SUPABASE_URL}/storage/v1/object/{config.AUDIO_BUCKET}/{path}",
        content=data,
        headers=_service_headers(
            {"Content-Type": "audio/mpeg", "x-upsert": "true", "Cache-Control": "max-age=31536000"}
        ),
    )
    if r.status_code >= 300:
        raise RuntimeError(f"Storage respondió {r.status_code}: {r.text[:200]}")


async def youtube_title(url: str) -> str | None:
    """Título del video vía oEmbed (no lo afecta el bloqueo anti-bots)."""
    try:
        r = await _client.get("https://www.youtube.com/oembed", params={"url": url, "format": "json"}, timeout=15)
        if r.status_code == 200:
            return r.json().get("title")
    except Exception:  # noqa: BLE001
        pass
    return None
