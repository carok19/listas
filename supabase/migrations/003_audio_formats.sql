-- =====================================================================
-- Aceptar más formatos de audio además de MP3: la APK descarga de YouTube
-- en M4A (sin convertir) y desde el celular se suben M4A/OGG/WAV.
-- =====================================================================

update storage.buckets
set allowed_mime_types = array[
  'audio/mpeg', 'audio/mp3',
  'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac',
  'audio/ogg', 'audio/opus', 'audio/webm',
  'audio/wav', 'audio/x-wav', 'audio/wave'
]
where id = 'audio';
