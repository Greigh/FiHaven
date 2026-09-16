package app.fihaven.core.net

import com.sun.net.httpserver.HttpServer
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class HttpTransportTest {

    private lateinit var server: HttpServer
    private var port: Int = 0

    @BeforeEach
    fun setUp() {
        server = HttpServer.create(InetSocketAddress(0), 0)
        server.start()
        port = server.address.port
    }

    @AfterEach
    fun tearDown() {
        server.stop(0)
    }

    @Test
    fun `default transport executes request and parses 200 response`() = runTest {
        server.createContext("/test-ok") { exchange ->
            val body = "{\"ok\":true}"
            exchange.sendResponseHeaders(200, body.toByteArray().size.toLong())
            exchange.responseBody.use { it.write(body.toByteArray()) }
        }

        val transport = DefaultHttpTransport()
        val response = transport.send(
            HttpRequest(
                method = HttpMethod.GET,
                url = "http://127.0.0.1:$port/test-ok",
            )
        )

        assertEquals(200, response.status)
        assertEquals("{\"ok\":true}", response.body)
    }

    @Test
    fun `default transport handles non-2xx status without error stream crash`() = runTest {
        server.createContext("/test-error") { exchange ->
            exchange.sendResponseHeaders(401, -1) // -1 produces null error stream in some JDKs / empty body
            exchange.close()
        }

        val transport = DefaultHttpTransport()
        val response = transport.send(
            HttpRequest(
                method = HttpMethod.GET,
                url = "http://127.0.0.1:$port/test-error",
            )
        )

        assertEquals(401, response.status)
        assertEquals("", response.body)
    }

    @Test
    fun `default transport sends post body and headers`() = runTest {
        server.createContext("/test-post") { exchange ->
            val auth = exchange.requestHeaders.getFirst("Authorization")
            val sent = exchange.requestBody.bufferedReader().readText()
            val reply = "auth=$auth,sent=$sent"
            exchange.sendResponseHeaders(200, reply.toByteArray().size.toLong())
            exchange.responseBody.use { it.write(reply.toByteArray()) }
        }

        val transport = DefaultHttpTransport()
        val response = transport.send(
            HttpRequest(
                method = HttpMethod.POST,
                url = "http://127.0.0.1:$port/test-post",
                headers = mapOf("Authorization" to "Bearer token123"),
                body = "hello-server",
            )
        )

        assertEquals(200, response.status)
        assertTrue(response.body.contains("auth=Bearer token123"))
        assertTrue(response.body.contains("sent=hello-server"))
    }
}
