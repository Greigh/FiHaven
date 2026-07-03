package app.fihaven.core

import app.fihaven.core.net.ApiClient
import app.fihaven.core.net.ApiConfig
import app.fihaven.core.net.HttpMethod
import app.fihaven.core.net.HttpResponse
import app.fihaven.core.net.InMemoryTokenStore
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Household REST contract (mirrors the Swift HouseholdChecks). Reuses the
 *  FakeTransport from ApiClientTest. */
class HouseholdApiTest {
    private val cfg = ApiConfig.localhost
    private fun client(t: FakeTransport) = ApiClient(cfg, InMemoryTokenStore("tk"), t)

    @Test fun getHouseholdDecodesInfo() = runTest {
        val t = FakeTransport().apply { responder = { HttpResponse(200, """{"household":null,"canCreate":true,"memberMax":3}""") } }
        val info = client(t).getHousehold()
        assertNull(info.household)
        assertTrue(info.canCreate)
        assertEquals(3, info.memberMax)
        assertEquals("http://localhost:5222/api/household", t.last?.url)
    }

    @Test fun createHouseholdPostsNameDecodesView() = runTest {
        val viewJson = """{"household":{"household":{"id":1,"name":"Casa","ownerUserId":7},"role":"owner","memberCount":1,"memberMax":3,"members":[{"userId":7,"email":"o@e.com","role":"owner"}]}}"""
        val t = FakeTransport().apply { responder = { HttpResponse(200, viewJson) } }
        val view = client(t).createHousehold("Casa")
        assertEquals("Casa", view.household.name)
        assertEquals("owner", view.role)
        assertEquals(1, view.members.size)
        assertEquals(HttpMethod.POST, t.last?.method)
    }

    @Test fun shareEntityPostsKindAndItem() = runTest {
        val entJson = """{"entity":{"id":"b1","kind":"bill","data":{"name":"Rent","amount":1500},"ownerUserId":7,"updatedAt":9,"deleted":false}}"""
        val t = FakeTransport().apply { responder = { HttpResponse(200, entJson) } }
        val item = buildJsonObject { put("id", "b1"); put("name", "Rent"); put("amount", 1500) }
        val ent = client(t).shareHouseholdEntity("bill", item)
        assertEquals("bill", ent.kind)
        assertEquals("b1", ent.id)
        assertEquals("http://localhost:5222/api/household/entities", t.last?.url)
        assertTrue(t.last?.body?.contains("\"kind\":\"bill\"") == true)
    }

    @Test fun sharedDataDecodesEntities() = runTest {
        val dataJson = """{"householdId":1,"version":5,"seq":2,"entities":[{"id":"b1","kind":"bill","data":{"name":"Rent","amount":1500},"ownerUserId":7,"updatedAt":5,"deleted":false}]}"""
        val t = FakeTransport().apply { responder = { HttpResponse(200, dataJson) } }
        val shared = client(t).getHouseholdSharedData()
        assertEquals(2L, shared.seq)
        assertEquals(1, shared.entities.size)
        assertEquals("Rent", shared.entities[0].data.jsonObject["name"]?.jsonPrimitive?.content)
        assertEquals("bill:b1", shared.entities[0].uid)
    }

    @Test fun deleteEntityUsesDeletePath() = runTest {
        val t = FakeTransport().apply { responder = { HttpResponse(200, "{\"ok\":true}") } }
        client(t).deleteHouseholdEntity("goal", "g1")
        assertEquals("http://localhost:5222/api/household/entities/goal/g1", t.last?.url)
        assertEquals(HttpMethod.DELETE, t.last?.method)
    }

    @Test fun rollupDecodesTotals() = runTest {
        val json = """{"householdId":1,"asOf":9,"totals":{"billsMonthly":1500,"cardDebt":800,"goalsTarget":5000},"byMember":[],"entityCount":{"bill":1}}"""
        val t = FakeTransport().apply { responder = { HttpResponse(200, json) } }
        val rollup = client(t).getHouseholdRollup()
        assertEquals(1500.0, rollup?.totals?.billsMonthly)
        assertEquals("http://localhost:5222/api/household/rollup", t.last?.url)
    }
}
