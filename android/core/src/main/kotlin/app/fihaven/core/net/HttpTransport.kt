package app.fihaven.core.net

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

enum class HttpMethod { GET, POST, PUT, DELETE }

data class HttpRequest(
    val method: HttpMethod,
    val url: String,
    val headers: Map<String, String> = emptyMap(),
    val body: String? = null,
)

data class HttpResponse(val status: Int, val body: String)

/// Transport seam: production uses HttpURLConnection (available on both
/// Android and the JVM — java.net.http is JDK-only and absent on Android);
/// tests inject a fake.
interface HttpTransport {
    suspend fun send(request: HttpRequest): HttpResponse
}

class DefaultHttpTransport : HttpTransport {
    override suspend fun send(request: HttpRequest): HttpResponse = withContext(Dispatchers.IO) {
        val conn = (URL(request.url).openConnection() as HttpURLConnection).apply {
            requestMethod = request.method.name
            connectTimeout = 15_000
            readTimeout = 20_000
            request.headers.forEach { (k, v) -> setRequestProperty(k, v) }
            if (request.body != null) {
                doOutput = true
                outputStream.use { it.write(request.body.toByteArray(Charsets.UTF_8)) }
            }
        }
        try {
            val status = conn.responseCode
            val stream = if (status in 200..299) conn.inputStream else (conn.errorStream ?: conn.inputStream)
            val body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            HttpResponse(status, body)
        } finally {
            conn.disconnect()
        }
    }
}
