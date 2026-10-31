package app.fihaven.core

import app.fihaven.core.model.AppData
import app.fihaven.core.model.Card
import app.fihaven.core.model.decodeAppData
import app.fihaven.core.model.FiHavenJson
import app.fihaven.core.model.promoList
import app.fihaven.core.model.income
import app.fihaven.core.model.incomes
import app.fihaven.core.model.theme
import app.fihaven.core.model.timezoneSetting
import kotlinx.serialization.json.JsonObject
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ModelTest {
    private fun seed(): AppData = FiHavenJson.decodeFromString(AppData.serializer(), SEED_JSON)

    @Test fun decodesSeed() {
        val d = seed()
        assertEquals("demo@fihaven.app", d.email)
        assertEquals(2, d.bills.size)
        assertEquals(2, d.cards.size)
        assertEquals(1, d.payments.size)
        assertEquals("Rent", d.bills[0].name)
        assertEquals(1450.0, d.bills[0].amountOrZero, 1e-6)
        assertEquals(1, d.bills[0].dueDay)
        assertTrue(d.bills[0].autopay)
        assertEquals("2026-10-01", d.cards[0].promoEndDate)
        assertEquals(2340.0, d.cards[0].promoBalance!!, 1e-6)
        assertNull(d.cards[1].promoEndDate)
        assertNull(d.cards[1].promoBalance)
    }

    @Test fun promosDecodeRoundTripAndFallback() {
        // Web-written JSON with a promos array decodes, keeping every field.
        val webJSON = """
        {"id":"c1","name":"Chase","promos":[
            {"id":"p1","label":"Balance transfer","apr":0,"balance":1000,"endDate":"2026-12-01"},
            {"id":"p2","label":"Purchases","apr":3.99,"endDate":"2027-06-01"}
        ],"hasPromo":true,"promoEndDate":"2026-12-01","promoBalance":1000}
        """
        val web = FiHavenJson.decodeFromString(Card.serializer(), webJSON)
        assertEquals(2, web.promos.size)
        assertEquals("Balance transfer", web.promos[0].label)
        assertEquals(3.99, web.promos[1].apr, 1e-9)
        assertNull(web.promos[1].balance)
        assertEquals("p1", web.promoList.first().id)

        // Round-trip survives a native re-encode for the server.
        val rt = FiHavenJson.decodeFromString(Card.serializer(),
            FiHavenJson.encodeToString(Card.serializer(), web))
        assertEquals(2, rt.promos.size)
        assertEquals("2027-06-01", rt.promos[1].endDate)

        // Legacy-only card synthesizes one promo; explicit hasPromo=false wins.
        val legacy = FiHavenJson.decodeFromString(Card.serializer(),
            """{"id":"c2","name":"X","hasPromo":true,"promoEndDate":"2026-10-01","promoBalance":500}""")
        assertEquals(1, legacy.promoList.size)
        assertEquals("2026-10-01", legacy.promoList.first().endDate)
        assertEquals("legacy", legacy.promoList.first().id)

        val off = FiHavenJson.decodeFromString(Card.serializer(),
            """{"id":"c3","name":"Y","hasPromo":false,"promoEndDate":"2026-10-01"}""")
        assertTrue(off.promoList.isEmpty())

        // No flag but fields present → still a promo (old exports).
        val bare = FiHavenJson.decodeFromString(Card.serializer(),
            """{"id":"c4","name":"Z","promoEndDate":"2026-10-01"}""")
        assertEquals(1, bare.promoList.size)

        assertTrue(Card(id = "c5", name = "None").promoList.isEmpty())
    }

    @Test fun settingsAccessors() {
        val s = seed().settings
        assertEquals("America/New_York", s.timezoneSetting)
        assertEquals("dark", s.theme)
        assertEquals(4506.67, s.income, 1e-6)
        assertEquals(1, s.incomes.size)
        assertEquals("biweekly", s.incomes[0].frequency)
        assertEquals(2080.0, s.incomes[0].amount, 1e-6)
    }

    @Test fun roundTripPreservesUnknownKeys() {
        val d = seed()
        val json = FiHavenJson.encodeToString(AppData.serializer(), d)
        val again = FiHavenJson.decodeFromString(AppData.serializer(), json)
        assertTrue(again.settings.containsKey("unknownWebKey"))
        assertTrue(again.settings["unknownWebKey"] is JsonObject)
    }

    @Test fun emptyDetection() {
        assertTrue(AppData().isEmpty)
        assertTrue(!seed().isEmpty)
    }

    @Test fun decodeAppDataCoercesNumericPaymentId() {
        val d = decodeAppData(SEED_JSON)
        assertEquals(1, d.payments.size)
        assertEquals("1730000000000", d.payments[0].id)
    }
}
