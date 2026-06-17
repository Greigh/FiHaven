package app.fihaven.ui

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.heightIn
import androidx.compose.ui.viewinterop.AndroidView
import org.json.JSONObject

/** Cloudflare Turnstile widget in a WebView — mirrors iOS TurnstileView. */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun TurnstileView(
    siteKey: String,
    baseUrl: String = "https://fihaven.app",
    reloadKey: Any,
    onToken: (String) -> Unit,
    onError: () -> Unit = {},
    onHeight: (Int) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    key(reloadKey) {
        AndroidView(
            modifier = modifier.heightIn(min = 0.dp, max = 120.dp),
            factory = { context ->
                WebView(context).apply {
                    setBackgroundColor(Color.TRANSPARENT)
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    isVerticalScrollBarEnabled = false
                    isHorizontalScrollBarEnabled = false
                    webViewClient = WebViewClient()
                    val main = Handler(Looper.getMainLooper())
                    addJavascriptInterface(
                        TurnstileBridge(
                            onToken = { main.post { onToken(it) } },
                            onError = { main.post(onError) },
                            onHeight = { main.post { onHeight(it) } },
                        ),
                        "AndroidTurnstile",
                    )
                    loadDataWithBaseURL(
                        baseUrl,
                        turnstileHtml(siteKey),
                        "text/html",
                        "UTF-8",
                        null,
                    )
                }
            },
        )
    }
}

private class TurnstileBridge(
    private val onToken: (String) -> Unit,
    private val onError: () -> Unit,
    private val onHeight: (Int) -> Unit,
) {
    @JavascriptInterface
    fun onMessage(json: String) {
        runCatching {
            val body = JSONObject(json)
            when (body.optString("type")) {
                "token" -> onToken(body.optString("token"))
                "height" -> onHeight(body.optString("value").toDoubleOrNull()?.toInt() ?: 0)
                else -> onError()
            }
        }.onFailure { onError() }
    }
}

private fun turnstileHtml(siteKey: String): String = """
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
  <style>
    html, body { margin: 0; padding: 0; background: transparent; }
    .wrap { display: flex; justify-content: center; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="cf-turnstile"
         data-sitekey="$siteKey"
         data-theme="auto"
         data-callback="onOK"
         data-error-callback="onErr"
         data-expired-callback="onExp"
         data-timeout-callback="onErr"></div>
  </div>
  <script>
    function send(type, payload) {
      try {
        AndroidTurnstile.onMessage(JSON.stringify(Object.assign({ type: type }, payload || {})));
      } catch (e) {}
    }
    function onOK(t)  { send("token", { token: t || "" }); }
    function onErr()  { send("error"); }
    function onExp()  { send("expired"); }
    function postHeight() { send("height", { value: String(Math.ceil(document.body.scrollHeight)) }); }
    try { new ResizeObserver(postHeight).observe(document.body); } catch (e) {}
    window.addEventListener("load", function () { postHeight(); setTimeout(postHeight, 600); });
  </script>
</body>
</html>
""".trimIndent()
