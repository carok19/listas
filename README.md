# Alabanza 🎶

App web instalable (PWA) para grupos de alabanza: biblioteca de canciones con letra y audio, listas por servicio, y modo ensayo/presentación que funciona sin internet.

```
listas/
├── web/          App (React + Vite + TS + Tailwind): PWA → Vercel, y APK Android (Capacitor, web/android)
├── downloader/   Servicio de descarga (FastAPI + yt-dlp + ffmpeg, Docker) → Render
├── supabase/     Migraciones SQL (tablas, RLS, Storage)
└── render.yaml   Blueprint de Render
```

## Cómo funciona

- **Supabase**: login (enlace por correo o Google), base de datos Postgres con RLS (cada miembro solo ve los datos de sus grupos) y Storage privado para los MP3 (`audio/{group_id}/{song_id}.mp3`).
- **Roles**: `admin` (director, edita todo) y `member` (solo ve y escucha). Quien crea el grupo es admin. Un usuario puede estar en varios grupos.
- **Invitaciones**: código de 6 caracteres, QR y link `/unirse/CODIGO` para compartir por WhatsApp (ver [Compartir la app](#compartir-la-app)).
- **Agregar canciones**: buscar por nombre (`ytsearch5:`), pegar un link (YouTube u otro sitio compatible con yt-dlp) o subir MP3: se pueden elegir **varios a la vez**; el título y artista salen del nombre del archivo y se pueden corregir antes de subir.
- **Letras**: se buscan solas (primero [LRCLIB](https://lrclib.net), luego [letras.com](https://www.letras.com)) y solo se aceptan si el título coincide. En **Buscar letra** se ven los resultados de las dos fuentes con vista previa. Si no aparece, los botones **Google** / **letras.com** abren el navegador; ahí se copia la letra (o el link de la página) y **Pegar lo copiado** la trae. Siempre se puede editar.
  - letras.com no tiene API: se usa el autocompletado del sitio y se lee la letra de la página. En la APK la petición sale del celular; en la web pasa por el servicio de descarga (`/page`). Si el sitio cambia, sigue funcionando el camino de copiar y pegar.
- **Escuchar con la letra**: en cada canción el reproductor queda fijo abajo mientras se lee la letra (como en letras.com, sin karaoke). El tamaño de la letra se ajusta con A−/A+ y la pantalla no se apaga mientras suena.
- **Descargar MP3**: todos los miembros pueden bajar el MP3 de una canción o todos los de una lista (numerados en orden). En la APK quedan en **Documentos › Alabanza** (se ven en *Archivos* y en las apps de música); en el navegador, en *Descargas*.
- **Listas**: por fecha, se reordenan arrastrando y se puede cambiar el tono de una canción solo para ese servicio. El inicio del grupo muestra la próxima lista.
- **Ensayo/presentación**: letra grande, modo claro/oscuro, tamaño de letra ajustable, pantalla siempre encendida (Wake Lock), reproductor con anterior/siguiente y botón **Sin internet** que guarda los MP3 y las letras en el celular.

### Servicio de descarga (desacoplado)

La app solo conoce su URL y este contrato. Si deja de funcionar, se puede reemplazar por otro que lo respete, y mientras tanto la opción **"Sube el MP3 manualmente"** sigue funcionando.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado y versión de yt-dlp (sin autenticación) |
| GET | `/search?q=` | Hasta 5 resultados: `{id, title, channel, duration, thumbnail, url}` |
| POST | `/download` | `{url, song_id, fill_metadata?}` → trabajo `{id, song_id, status, progress, error}` |
| GET | `/jobs/{id}` | Estado: `queued` → `downloading` → `uploading` → `done` / `error` |
| GET | `/lyrics` | Respaldo para LRCLIB si el navegador no puede consultarlo directo |
| GET | `/page?url=` | Lee una página de un sitio de letras permitido (`LYRICS_HOSTS`: letras.com, Genius…) para la versión web |

- **Seguridad**: cada petición lleva el token de sesión de Supabase del usuario (`Authorization: Bearer …`). El servicio lo valida con Supabase y para `/download` exige que el usuario sea **admin** del grupo de la canción. La `service_role` key vive solo en el servidor. `API_TOKEN` es una capa extra opcional (header `X-Api-Token`). Ojo: no es secreta, porque el frontend la expone.
- **Cola**: en memoria, con `MAX_CONCURRENT_JOBS` trabajos a la vez. El servicio marca la canción como `processing`, `ready` o `error` directamente en la base de datos, así que la app ve el resultado aunque se cierre.
- **yt-dlp se actualiza en cada arranque** (`entrypoint.sh`), porque YouTube cambia seguido.
- **Cookies**: si YouTube bloquea la IP del servidor ("Sign in to confirm you're not a bot"), exporta las cookies de una cuenta de YouTube en formato Netscape y configúralas (ver más abajo).

---

## APK Android (sin Vercel ni Render)

GitHub Actions compila la APK sola cada vez que cambia algo en `web/` (workflow **APK Android**) y la publica en *Releases*.

- **Link fijo de descarga:** https://github.com/carok19/listas/releases/latest/download/Alabanza.apk
- Para instalarla: abre el link en el celular, descarga el archivo y ábrelo. La primera vez, Android pide permitir "instalar apps de este origen".
- Las actualizaciones se instalan encima de la versión anterior sin perder la sesión ni las listas descargadas, porque se firman siempre con la misma llave (`web/android/app/alabanza.keystore`).
- Para compilarla a mano: pestaña *Actions* → **APK Android** → *Run workflow*.

**Configuración en Supabase para la APK** (Authentication):
1. *URL Configuration → Redirect URLs*: agrega `com.alabanza.app://**`. Sirve para entrar con Google o con enlace por correo desde la APK.
2. *Sign In / Providers → Email*: desactiva **Confirm email** para que la gente cree su cuenta con correo y contraseña al instante, sin depender del correo (Supabase gratis manda muy pocos por hora).

**Qué funciona sin servidor de descarga:** todo, excepto *Buscar* y *Link* en "Agregar canción". Las canciones se agregan subiendo el MP3. Las letras (LRCLIB y letras.com) sí funcionan, porque la APK las pide directo desde el celular.

**Guardar MP3:** van a *Documentos › Alabanza*. En Android 11 o más nuevo no pide permisos; en Android 10 o anterior la primera vez pide permiso de almacenamiento. Si algo falla, el botón *Descargar con el navegador* lo baja a *Descargas*. Si algún día hay un servicio de descarga (ver `downloader/`), pon su URL en *Settings → Secrets and variables → Actions → Variables* como `DOWNLOADER_URL` y la próxima APK lo usará.

> La llave de firma está en el repo para que todo funcione sin configurar secretos. Si el repo es público, cualquiera podría firmar una APK que se haga pasar por esta. Para un uso más serio, crea una llave propia y ponla en los secretos `ANDROID_KEYSTORE_*`. El workflow ya lee esas variables de entorno si existen.

## Compartir la app

1. El administrador entra al grupo → **Inicio › Invita a tu equipo** (o pestaña **Grupo › Invitar**) → **WhatsApp**. El mensaje lleva el link de la APK y el código del grupo.
2. Cada persona abre el link en su celular Android, instala la APK, crea su cuenta y toca **Unirme con código**.
3. En persona: **QR › 1. Descargar la app** para que la instalen y **2. Ya tengo la app** para que se unan.

Los miembros ven canciones y listas, ensayan con la letra, guardan listas para usar sin internet y descargan los MP3. Solo los administradores agregan o editan.

**iPhone:** la APK es solo para Android. Para iPhone hay que publicar la versión web (paso 3, Vercel) y poner su URL en la variable `WEB_URL` de GitHub Actions; así los links de invitación abren la web, que en iPhone se instala con *Compartir › Agregar a pantalla de inicio*.

## Despliegue

### 1. Supabase

> El proyecto **`alabanza`** (organización *carok*) ya está creado y con las migraciones aplicadas. Para otro proyecto, ejecuta `supabase/migrations/001_init.sql` y luego `002_private_helpers.sql` en **SQL Editor → Run**.

1. **Authentication → URL Configuration**
   - *Site URL*: la URL de Vercel (ej. `https://alabanza.vercel.app`).
   - *Redirect URLs*: agrega `https://alabanza.vercel.app/**` y `http://localhost:5173/**`.
2. **Authentication → Sign In / Providers → Email**: déjalo activado (enlace mágico).
   - ⚠️ El correo integrado de Supabase permite **muy pocos envíos por hora**. Para uso real, configura un SMTP propio en *Authentication → Emails → SMTP Settings* (por ejemplo [Resend](https://resend.com), que es gratis) o usa Google.
3. **Google** (opcional pero recomendado):
   1. En [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → *Create credentials → OAuth client ID → Web application*.
   2. *Authorized redirect URI*: `https://embojyywfplaihikfcyw.supabase.co/auth/v1/callback`.
   3. Copia el *Client ID* y el *Client secret* en Supabase → *Authentication → Providers → Google* y actívalo.
4. **Project Settings → API**: copia la *Project URL*, la *anon/publishable key* (para Vercel) y la *service_role key* (solo para Render).

### 2. Render (servicio de descarga)

1. En [Render](https://dashboard.render.com): **New → Blueprint** → elige el repo `carok19/listas` (usa `render.yaml`). También puedes crear un *Web Service* con runtime **Docker** y *Root Directory* `downloader`.
2. Variables de entorno:

| Variable | Obligatoria | Valor |
|---|---|---|
| `SUPABASE_URL` | sí | `https://embojyywfplaihikfcyw.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | sí | service_role key (**secreta**) |
| `ALLOWED_ORIGINS` | recomendada | `https://alabanza.vercel.app` (separa con comas si hay varias) |
| `API_TOKEN` | no | capa extra; usa el mismo valor en `VITE_DOWNLOADER_TOKEN` |
| `YTDLP_COOKIES_FILE` | no | ruta a un *Secret File*, ej. `/etc/secrets/cookies.txt` |
| `YTDLP_COOKIES` | no | alternativa: el contenido completo de `cookies.txt` |
| `MAX_DURATION_SEC` | no | `1200` (20 min) |
| `MAX_CONCURRENT_JOBS` | no | `2` |
| `MP3_QUALITY` | no | `128` (kbps; 128 ≈ 1 MB por minuto) |
| `LYRICS_HOSTS` | no | sitios que `/page` puede leer, separados por coma (por defecto letras.com, letras.mus.br, Genius y lyrics.com) |

3. Cuando termine el deploy, abre `https://TU-SERVICIO.onrender.com/health` y verifica que responda `{"ok": true, ...}`.

**Cookies de YouTube** (solo si hay bloqueos): en una computadora, inicia sesión en YouTube (mejor con una cuenta secundaria), exporta las cookies con la extensión *"Get cookies.txt LOCALLY"* y súbelas en Render → *Environment → Secret Files* como `cookies.txt`. Luego define `YTDLP_COOKIES_FILE=/etc/secrets/cookies.txt`.

> El plan gratis de Render **se duerme** después de 15 minutos sin uso. La primera búsqueda o descarga puede tardar cerca de 1 minuto mientras despierta (la app lo despierta sola al abrir "Agregar canción").

### 3. Vercel (frontend)

1. En [Vercel](https://vercel.com/new) importa `carok19/listas` y configura:
   - *Root Directory*: `web`
   - *Framework*: Vite (build `npm run build`, output `dist`)
2. Variables de entorno:

| Variable | Valor |
|---|---|
| `VITE_SUPABASE_URL` | `https://embojyywfplaihikfcyw.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon o publishable key |
| `VITE_DOWNLOADER_URL` | `https://TU-SERVICIO.onrender.com` (sin `/` final) |
| `VITE_DOWNLOADER_TOKEN` | opcional, igual a `API_TOKEN` |

3. Deploy. Después vuelve a Supabase (paso 1.1) y a Render (`ALLOWED_ORIGINS`) y pon la URL final.

### Instalar en el celular

Abre la URL en el celular. En **Android/Chrome**: menú ⋮ → *Instalar app*. En **iPhone/Safari**: Compartir → *Agregar a pantalla de inicio*.

---

## Desarrollo local

```bash
# Frontend
cd web
cp .env.example .env.local   # completa las variables
npm install
npm run dev                  # http://localhost:5173

# Servicio de descarga (requiere ffmpeg instalado)
cd downloader
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
uvicorn app.main:app --reload --port 8000

# o con Docker
docker build -t alabanza-dl downloader
docker run -p 8000:8000 -e SUPABASE_URL=... -e SUPABASE_SERVICE_ROLE_KEY=... alabanza-dl
```

## Esquema de base de datos

| Tabla | Contenido |
|---|---|
| `profiles` | nombre y foto (se crea solo al registrarse) |
| `groups` | nombre, `invite_code` único |
| `group_members` | `(group_id, user_id)`, `role` admin/member |
| `songs` | título, artista, tono, BPM, letra, notas, audio (`audio_path`, `audio_status`), link de origen, `multitrack_ref` (Fase 2) |
| `setlists` | título, `service_date`, notas |
| `setlist_songs` | canción, `position`, `key_override` |

RPC: `create_group`, `join_group`, `group_preview`, `regenerate_invite_code`, `reorder_setlist`. Las funciones internas de las políticas (`is_member`, `is_admin`…) están en el esquema `private`, que no se expone en la API. Un grupo nunca se queda sin administrador.

## Límites del plan gratis

- Supabase Storage: 1 GB ≈ 1000 minutos de audio a 128 kbps (~250 canciones).
- Render free: se duerme sin uso y la cola en memoria se pierde si se reinicia (la canción queda en *error* y se puede reintentar).

## Próximo: Fase 2 (vínculo con Daw)

La app de escritorio multitrack (`carok19/Daw`) leerá la próxima lista del grupo desde esta misma base de datos y abrirá los multitracks en orden. Cada canción guarda en `songs.multitrack_ref` el proyecto multitrack enlazado en la compu. Los archivos de las pistas se quedan en la computadora.
