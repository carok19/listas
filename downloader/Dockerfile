FROM python:3.12-slim

# ffmpeg para convertir a MP3; deno como runtime de JavaScript que yt-dlp
# necesita para YouTube.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=denoland/deno:bin /deno /usr/local/bin/deno

WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY entrypoint.sh .

ENV PYTHONUNBUFFERED=1 PORT=8000
EXPOSE 8000
CMD ["./entrypoint.sh"]
