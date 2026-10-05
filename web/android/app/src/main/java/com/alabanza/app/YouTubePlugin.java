package com.alabanza.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import com.yausername.youtubedl_android.YoutubeDLResponse;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import kotlin.Unit;

/**
 * Busca y descarga audio con yt-dlp dentro del celular. YouTube bloquea las IP de
 * servidores, pero no la de un teléfono.
 */
@CapacitorPlugin(name = "YouTube")
public class YouTubePlugin extends Plugin {
    private static final String TAG = "YouTubePlugin";
    private static final long UPDATE_EVERY_MS = 24L * 60 * 60 * 1000;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private boolean ready = false;

    /** Prepara Python/yt-dlp y, una vez al día, baja la última versión de yt-dlp. */
    private synchronized void prepare() throws Exception {
        Context ctx = getContext().getApplicationContext();
        if (!ready) {
            YoutubeDL.getInstance().init(ctx);
            ready = true;
        }
        SharedPreferences prefs = ctx.getSharedPreferences("youtube", Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        if (now - prefs.getLong("lastUpdate", 0) > UPDATE_EVERY_MS) {
            try {
                YoutubeDL.getInstance().updateYoutubeDL(ctx, YoutubeDL.UpdateChannel._STABLE);
                prefs.edit().putLong("lastUpdate", now).apply();
            } catch (Exception e) {
                // Sin internet o GitHub no responde: se usa la versión que ya hay.
                Log.w(TAG, "No se pudo actualizar yt-dlp", e);
            }
        }
    }

    private File workDir(String id) {
        return new File(getContext().getCacheDir(), "youtube/" + id.replaceAll("[^A-Za-z0-9_-]", ""));
    }

    private static void deleteRecursively(File f) {
        File[] children = f.listFiles();
        if (children != null) {
            for (File c : children) deleteRecursively(c);
        }
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    private static String readText(File f) throws IOException {
        try (FileInputStream in = new FileInputStream(f); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }

    private static String message(Exception e) {
        String m = e.getMessage();
        if (m == null || m.trim().isEmpty()) m = e.getClass().getSimpleName();
        return m.length() > 600 ? m.substring(m.length() - 600) : m;
    }

    @PluginMethod
    public void search(PluginCall call) {
        String query = call.getString("query", "").trim();
        int limit = call.getInt("limit", 8);
        if (query.isEmpty()) {
            call.reject("Escribe el nombre de la canción.");
            return;
        }
        executor.execute(() -> {
            try {
                prepare();
                YoutubeDLRequest request = new YoutubeDLRequest("ytsearch" + limit + ":" + query);
                request.addOption("--flat-playlist");
                request.addOption("--dump-single-json");
                request.addOption("--no-warnings");
                YoutubeDLResponse response = YoutubeDL.getInstance().execute(request);
                JSObject result = new JSObject();
                result.put("json", response.getOut());
                call.resolve(result);
            } catch (Exception e) {
                Log.w(TAG, "Búsqueda fallida", e);
                call.reject(message(e));
            }
        });
    }

    /** Descarga solo el audio (M4A, sin convertir) y devuelve la ruta del archivo. */
    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url", "").trim();
        String id = call.getString("id", String.valueOf(System.currentTimeMillis()));
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            call.reject("El link no es válido.");
            return;
        }
        executor.execute(() -> {
            File dir = workDir(id);
            try {
                prepare();
                deleteRecursively(dir);
                if (!dir.mkdirs() && !dir.isDirectory()) throw new Exception("No se pudo preparar la carpeta temporal.");
                YoutubeDLRequest request = new YoutubeDLRequest(url);
                request.addOption("--no-playlist");
                request.addOption("-f", "140/bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio");
                request.addOption("--max-filesize", "50M");
                request.addOption("--match-filters", "!is_live & duration <? 1800");
                request.addOption("--no-mtime");
                request.addOption("--newline");
                // Sin ffmpeg no se puede "arreglar" el contenedor; el audio igual se reproduce bien.
                request.addOption("--fixup", "never");
                request.addOption("--write-info-json");
                request.addOption("-o", new File(dir, "audio.%(ext)s").getAbsolutePath());
                YoutubeDL.getInstance().execute(request, id, (progress, eta, line) -> {
                    JSObject data = new JSObject();
                    data.put("id", id);
                    data.put("progress", progress);
                    notifyListeners("progress", data);
                    return Unit.INSTANCE;
                });
                File audio = null;
                File info = new File(dir, "audio.info.json");
                File[] files = dir.listFiles();
                if (files != null) {
                    for (File f : files) {
                        String name = f.getName();
                        if (f.isFile() && f.length() > 0 && !name.endsWith(".json") && !name.endsWith(".part") && !name.endsWith(".ytdl")) {
                            audio = f;
                            break;
                        }
                    }
                }
                if (audio == null) {
                    throw new Exception("No se generó el audio (puede ser una transmisión en vivo, durar más de 30 minutos o pesar más de 50 MB).");
                }
                JSObject result = new JSObject();
                result.put("path", audio.getAbsolutePath());
                if (info.isFile()) {
                    JSONObject json = new JSONObject(readText(info));
                    for (String key : new String[] { "title", "track", "artist", "uploader", "channel", "thumbnail" }) {
                        String value = json.optString(key, "");
                        if (!value.isEmpty()) result.put(key, value);
                    }
                    double duration = json.optDouble("duration", 0);
                    if (duration > 0) result.put("duration", duration);
                }
                call.resolve(result);
            } catch (YoutubeDL.CanceledException e) {
                deleteRecursively(dir);
                call.reject("Descarga cancelada.", "CANCELED");
            } catch (Exception e) {
                Log.w(TAG, "Descarga fallida", e);
                deleteRecursively(dir);
                call.reject(message(e));
            }
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String id = call.getString("id");
        if (id != null) YoutubeDL.getInstance().destroyProcessById(id);
        call.resolve();
    }

    /** Borra el archivo temporal cuando la app ya lo subió. */
    @PluginMethod
    public void cleanup(PluginCall call) {
        String id = call.getString("id");
        if (id != null) deleteRecursively(workDir(id));
        call.resolve();
    }
}
