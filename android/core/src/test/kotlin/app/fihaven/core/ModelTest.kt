package app.fihaven.core

import app.fihaven.core.model.AppData
import app.fihaven.core.model.decodeAppData
import app.fihaven.core.model.FiHavenJson
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
        assertEquals(1450.0, d.bills[0].amount, 1e-6)
        assertEquals(1, d.bills[0].dueDay)
        assertTrue(d.bills[0].autopay)
        assertEquals("2026-10-01", d.cards[0].promoEndDate)
        assertEquals(2340.0, d.cards[0].promoBalance!!, 1e-6)
        assertNull(d.cards[1].promoEndDate)
        assertNull(d.cards[1].promoBalance)
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
