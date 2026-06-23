package app.fihaven.core

import app.fihaven.core.model.FiHavenJson
import app.fihaven.core.model.dashboardLayout
import app.fihaven.core.model.dashboardWidgets
import app.fihaven.core.model.localNotifications
import app.fihaven.core.model.notifyHour
import app.fihaven.core.model.remindOnDueDay
import app.fihaven.core.model.reminderLeadDays
import app.fihaven.core.model.weeklyDigest
import kotlinx.serialization.json.JsonObject
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

// The notification + dashboard settings accessors that back the new email/
// notification options and the widget dashboard — kept in parity with the
// web (client/js/dashboardWidgets.js) and iOS (SettingsChecks.swift).
class SettingsTest {
    private fun settings(json: String): JsonObject =
        FiHavenJson.decodeFromString(JsonObject.serializer(), json)

    @Test fun defaultsOnEmptySettings() {
        val s = settings("{}")
        assertEquals("classic", s.dashboardLayout)
        assertEquals(emptyList(), s.dashboardWidgets)
        assertEquals(3, s.reminderLeadDays)
        assertEquals(8, s.notifyHour)
        assertFalse(s.remindOnDueDay)
        assertFalse(s.weeklyDigest)
        assertFalse(s.localNotifications)
    }

    @Test fun readsStoredValues() {
        val s = settings(
            """{"dashboardLayout":"widgets","dashboardWidgets":["goals","stats","networth"],
               "reminderLeadDays":5,"notifyHour":19,"remindOnDueDay":true,
               "weeklyDigest":true,"localNotifications":true}""",
        )
        assertEquals("widgets", s.dashboardLayout)
        assertEquals(listOf("goals", "stats", "networth"), s.dashboardWidgets)
        assertEquals(5, s.reminderLeadDays)
        assertEquals(19, s.notifyHour)
        assertTrue(s.remindOnDueDay)
        assertTrue(s.weeklyDigest)
        assertTrue(s.localNotifications)
    }

    @Test fun clampsLeadTimeAndNotifyHour() {
        assertEquals(14, settings("""{"reminderLeadDays":50}""").reminderLeadDays)
        assertEquals(0, settings("""{"reminderLeadDays":-5}""").reminderLeadDays)
        assertEquals(23, settings("""{"notifyHour":99}""").notifyHour)
        assertEquals(0, settings("""{"notifyHour":-1}""").notifyHour)
    }

    @Test fun dashboardWidgetsDropsJsonNulls() {
        // A malformed array shouldn't crash — JSON nulls are dropped. (Catalog
        // validation of the ids themselves happens at render time.)
        val s = settings("""{"dashboardWidgets":["stats",null,"goals"]}""")
        assertEquals(listOf("stats", "goals"), s.dashboardWidgets)
    }
}
