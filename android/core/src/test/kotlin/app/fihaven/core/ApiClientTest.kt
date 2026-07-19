package app.fihaven.core

import app.fihaven.core.net.ApiClient
import app.fihaven.core.net.ApiConfig
import app.fihaven.core.net.ApiError
import app.fihaven.core.net.HttpMethod
import app.fihaven.core.net.HttpRequest
import app.fihaven.core.net.HttpResponse
import app.fihaven.core.net.HttpTransport
import app.fihaven.core.net.InMemoryTokenStore
import app.fihaven.core.net.LoginOutcome
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class FakeTransport : HttpTransport {
    var last: HttpRequest? = null
    var responder: (HttpRequest) -> HttpResponse = { HttpResponse(200, "{}") }
    var error: Throwable? = null

    override suspend fun send(request: HttpRequest): HttpResponse {
        last = request
        error?.let { throw it }
        return responder(request)
    }
}

class ApiClientTest {
    private val cfg = ApiConfig.localhost

    private fun client(tokens: InMemoryTokenStore = InMemoryTokenStore(), transport: FakeTransport) =
        ApiClient(cfg, tokens, transport)

    @Test fun dataGetCarriesBearerNoAuthMode() = runTest {
        val t = FakeTransport().apply { responder = { HttpResponse(200, SEED_JSON) } }
        val data = client(InMemoryTokenStore("abc123"), t).fetchData()
        assertEquals(2, data.bills.size)
        assertEquals("http://localhost:5222/api/data", t.last?.url)
        assertEquals("Bearer abc123", t.last?.headers?.get("Authorization"))
        assertNull(t.last?.headers?.get("X-Auth-Mode"))
    }

    @Test fun loginAuthenticatedStoresTokenAndBody() = runTest {
        val tokens = InMemoryTokenStore()
        val t = FakeTransport().apply {
            responder = { HttpResponse(200, """{"user":{"email":"d@e.com","name":"D"},"token":"TKN"}""") }
        }
        val outcome = client(tokens, t).login("d@e.com", "pw", "tok", 123)
        assertTrue(outcome is LoginOutcome.Authenticated)
        assertEquals("TKN", (outcome as LoginOutcome.Authenticated).session.token)
        assertEquals("TKN", tokens.get())
        assertEquals("token", t.last?.headers?.get("X-Auth-Mode"))
        assertEquals("application/json", t.last?.headers?.get("Content-Type"))
        val body = Json.parseToJsonElement(t.last!!.body!!).jsonObject
        assertEquals("d@e.com", body["email"]?.jsonPrimitive?.contentOrNull)
        assertEquals("", body["website"]?.jsonPrimitive?.contentOrNull)
    }

    @Test fun loginMfaRequired() = runTest {
        val t = FakeTransport().apply {
            responder = { HttpResponse(200, """{"mfaRequired":true,"mfaToken":"MFA","methods":["totp","email"]}""") }
        }
        val outcome = client(transport = t).login("x", "y", "t", 0)
        assertTrue(outcome is LoginOutcome.MfaRequired)
        val ch = (outcome as LoginOutcome.MfaRequired).challenge
        assertEquals("MFA", ch.mfaToken)
        assertEquals(listOf("totp", "email"), ch.methods)
    }

    @Test fun verifyMfaStoresToken() = runTest {
        val tokens = InMemoryTokenStore()
        val t = FakeTransport().apply {
            responder = { HttpResponse(200, """{"user":{"email":"d@e.com","name":null},"token":"TKN2"}""") }
        }
        val session = client(tokens, t).verifyMfa("MFA", "123456")
        assertEquals("TKN2", session.token)
        assertNull(session.user.name)
        assertEquals("TKN2", tokens.get())
        assertEquals("token", t.last?.headers?.get("X-Auth-Mode"))
    }

    @Test fun unauthenticatedMapsToError() = runTest {
        val t = FakeTransport().apply { responder = { HttpResponse(401, """{"error":"unauthenticated"}""") } }
        assertFailsWith<ApiError.Unauthenticated> { client(InMemoryTokenStore("t"), t).fetchData() }
    }

    @Test fun loginInvalidCredentialsCarriesCode() = runTest {
        val t = FakeTransport().apply {
            responder = { HttpResponse(401, """{"error":"invalid-credentials"}""") }
        }
        val e = assertFailsWith<ApiError.Http> { client(transport = t).login("a@b.com", "wrong", "tok", 0) }
        assertEquals("invalid-credentials", e.code)
        assertEquals("Incorrect email or password.", e.userMessage)
    }

    @Test fun serverErrorCarriesCode() = runTest {
        val t = FakeTransport().apply { responder = { HttpResponse(400, """{"error":"weak-password"}""") } }
        val e = assertFailsWith<ApiError.Http> { client(transport = t).signup("a@b.com", "short", "t", 0) }
        assertEquals("weak-password", e.code)
    }

    @Test fun logoutClearsToken() = runTest {
        val tokens = InMemoryTokenStore("t")
        val t = FakeTransport().apply { responder = { HttpResponse(204, "") } }
        client(tokens, t).logout()
        assertNull(tokens.get())
    }

    @Test fun mfaStatusDecodes() = runTest {
        val body = """
            {"totp":{"enabled":true,"enabledAt":1730000000000,"lastUsedAt":null},
             "passkeys":[{"id":3,"name":"Pixel","transports":["internal"],"createdAt":1730000000000,"lastUsedAt":null}],
             "backupCodes":{"total":10,"unused":7},
             "emailMfa":{"enabled":false,"email":"d@e.com"}}
        """.trimIndent()
        val t = FakeTransport().apply { responder = { HttpResponse(200, body) } }
        val status = client(InMemoryTokenStore("t"), t).mfaStatus()
        assertTrue(status.totp.enabled)
        assertEquals(7, status.backupCodes.unused)
        assertEquals(1, status.passkeys.size)
        assertEquals("Pixel", status.passkeys[0].name)
    }

    @Test fun totpSetupAndConfirm() = runTest {
        val tokens = InMemoryTokenStore("t")
        val t = FakeTransport().apply {
            responder = { HttpResponse(200, """{"uri":"otpauth://x","qrDataUrl":"data:image/png;base64,AAAA","secret":"ABCD"}""") }
        }
        val c = client(tokens, t)
        val setup = c.totpSetup("pw")
        assertEquals("ABCD", setup.secret)
        assertTrue(setup.qrDataUrl.startsWith("data:image/png"))

        t.responder = { HttpResponse(200, """{"ok":true,"backupCodes":["a-b","c-d"]}""") }
        assertEquals(listOf("a-b", "c-d"), c.totpConfirm("123456"))
    }

    @Test fun changeNamePath() = runTest {
        val t = FakeTransport().apply { responder = { HttpResponse(200, """{"ok":true,"name":"Dana"}""") } }
        val name = client(InMemoryTokenStore("t"), t).changeName("Dana")
        assertEquals("Dana", name)
        assertTrue(t.last!!.url.endsWith("/api/account/change-name"))
    }

    @Test fun fetchCardPresets() = runTest {
        val body = """
            {"presets":[{"id":"amex-gold","issuer":"American Express","name":"Gold Card","network":"Amex",
             "rewardBase":1,"rewardCategories":{"Dining":4},"pointValue":2,"updatedAt":123}]}
        """.trimIndent()
        val t = FakeTransport().apply { responder = { HttpResponse(200, body) } }
        val presets = client(InMemoryTokenStore("t"), t).fetchCardPresets()
        assertEquals(1, presets.size)
        assertEquals("amex-gold", presets[0].id)
        assertEquals(123.0, presets[0].updatedAt)
        assertEquals(4.0, presets[0].rewardCategories["Dining"])
        assertTrue(t.last!!.url.endsWith("/api/card-presets"))
    }
}
