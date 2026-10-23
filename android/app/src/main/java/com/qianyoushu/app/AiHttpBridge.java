package com.qianyoushu.app;

import android.app.Activity;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;
import java.net.URL;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import javax.net.ssl.SSLException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;

/** Dedicated AI transport. Never logs credentials, prompts, or provider bodies. */
final class AiHttpBridge {
    private final Activity activity;
    private final WebView webView;
    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(2, 2, 30,
            TimeUnit.SECONDS, new ArrayBlockingQueue<>(16));
    private final ConcurrentHashMap<String, Job> pending = new ConcurrentHashMap<>();
    private volatile boolean closed;
    private static final int LIMIT = 2 * 1024 * 1024;
    private static final class Job {
        volatile HttpURLConnection connection;
        volatile Future<?> future;
        volatile boolean cancelled;
        void cancel() {
            cancelled = true;
            if (connection != null) connection.disconnect();
            if (future != null) future.cancel(true);
        }
    }
    AiHttpBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }
    @JavascriptInterface public void request(String id, String requestJson) {
        if (closed || id == null || !id.matches("qys-ai-[0-9]+-[0-9]+")) return;
        activity.runOnUiThread(() -> {
            String current = webView.getUrl();
            if (closed || current == null || !current.startsWith("file:///android_asset/index.html")) return;
            Job job = new Job();
            if (pending.putIfAbsent(id, job) != null) return;
            try {
                job.future = executor.submit(() -> execute(id, requestJson, job));
                if (job.cancelled) job.future.cancel(true);
            } catch (RejectedExecutionException error) {
                pending.remove(id, job);
                reply(id, failure("BUSY", "请求较多，请稍后重试"));
            }
        });
    }
    private void execute(String id, String requestJson, Job job) {
        HttpURLConnection connection = null;
        try {
            if (job.cancelled) return;
            if (requestJson == null || requestJson.length() > LIMIT) throw new IllegalArgumentException();
            JSONObject spec = new JSONObject(requestJson);
            URL url = new URL(spec.getString("url"));
            String scheme = url.getProtocol(), host = url.getHost();
            boolean loopback = host.equals("127.0.0.1") || host.equals("localhost") || host.equals("[::1]");
            if (!(scheme.equals("https") || (scheme.equals("http") && loopback))
                    || url.getUserInfo() != null || url.getRef() != null || url.getQuery() != null
                    || !url.getPath().endsWith("/chat/completions")) throw new IllegalArgumentException();
            String auth = spec.optString("authorization", "");
            if (auth.contains("\r") || auth.contains("\n")) throw new IllegalArgumentException();
            byte[] payload = spec.getString("body").getBytes(StandardCharsets.UTF_8);
            if (payload.length > LIMIT) throw new IllegalArgumentException();
            connection = (HttpURLConnection) url.openConnection();
            job.connection = connection;
            if (job.cancelled) return;
            connection.setRequestMethod("POST");
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(60000);
            connection.setUseCaches(false);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Accept", "application/json");
            if (!auth.isEmpty()) connection.setRequestProperty("Authorization", auth);
            connection.setFixedLengthStreamingMode(payload.length);
            try (OutputStream out = connection.getOutputStream()) { out.write(payload); }
            int status = connection.getResponseCode();
            InputStream raw = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            String body = "";
            if (raw != null) {
                try (InputStream in = raw; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[8192]; int n;
                    while ((n = in.read(buffer)) != -1) {
                        if (job.cancelled) return;
                        if (out.size() + n > LIMIT) {
                            reply(id, failure("RESPONSE_TOO_LARGE", "模型响应过大，请缩短问题后重试")); return;
                        }
                        out.write(buffer, 0, n);
                    }
                    body = new String(out.toByteArray(), StandardCharsets.UTF_8);
                }
            }
            JSONObject result = new JSONObject();
            result.put("status", status); result.put("body", body);
            if (!job.cancelled) reply(id, result);
        } catch (SocketTimeoutException error) {
            if (!job.cancelled) reply(id, failure("TIMEOUT", "连接或响应超时，请稍后重试"));
        } catch (SSLException error) {
            if (!job.cancelled) reply(id, failure("TLS", "安全连接失败，请检查接口地址与证书"));
        } catch (IllegalArgumentException | org.json.JSONException error) {
            if (!job.cancelled) reply(id, failure("INVALID_REQUEST", "接口地址或请求格式无效，请检查配置"));
        } catch (Exception error) {
            if (!job.cancelled) reply(id, failure("NETWORK", "无法连接模型服务，请检查网络、域名或代理"));
        } finally {
            pending.remove(id, job);
            if (connection != null) connection.disconnect();
        }
    }
    private JSONObject failure(String code, String message) {
        JSONObject data = new JSONObject();
        try { data.put("error", code); data.put("message", message); } catch (Exception ignored) {}
        return data;
    }
    private void reply(String id, JSONObject result) {
        activity.runOnUiThread(() -> {
            if (closed || activity.isDestroyed()) return;
            String current = webView.getUrl();
            if (current != null && current.startsWith("file:///android_asset/index.html"))
                webView.evaluateJavascript("window.QYSAITransport&&window.QYSAITransport.receive("
                        + JSONObject.quote(id) + "," + result.toString() + ");", null);
        });
    }
    @JavascriptInterface public void cancel(String id) {
        if (id == null) return;
        Job job = pending.remove(id); if (job != null) job.cancel();
    }
    void close() {
        closed = true;
        for (Job job : pending.values()) job.cancel();
        pending.clear(); executor.shutdownNow();
    }
}
