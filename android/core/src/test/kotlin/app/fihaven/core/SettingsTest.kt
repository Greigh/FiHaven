package app.fihaven.core

import app.fihaven.core.model.FiHavenJson
import app.fihaven.core.model.budgetBucketOverrides
import app.fihaven.core.model.dashboardLayout
import app.fihaven.core.model.dashboardWidgets
import app.fihaven.core.model.envelopeAssign
import app.fihaven.core.model.envelopeRollover
import app.fihaven.core.model.localNotifications
import app.fihaven.core.model.notifyHour
import app.fihaven.core.model.remindOnDueDay
import app.fihaven.core.model.reminderLeadDays
import app.fihaven.core.model.weeklyDigest
import app.fihaven.core.model.withBudgetBucketOverride
import app.fihaven.core.model.withEnvelopeAssignCategory
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

    @Test fun envelopeAndBucketSettings() {
        val s = settings(
            """{"envelopeRollover":true,"envelopeAssign":{"goals":{"g1":50},"categories":{"Groceries":200}},
               "budgetBucketOverrides":{"bills":{"Housing":"wants"},"spending":{"Dining":"needs"}}}""",
        )
        assertTrue(s.envelopeRollover)
        assertEquals(50.0, s.envelopeAssign.goals["g1"])
        assertEquals(200.0, s.envelopeAssign.categories["Groceries"])
        assertEquals("wants", s.budgetBucketOverrides.bills["Housing"])
        assertEquals("needs", s.budgetBucketOverrides.spending["Dining"])
        val next = s.withBudgetBucketOverride("spending", "Dining", null)
        assertTrue(next.budgetBucketOverrides.spending.isEmpty())
        val env = s.withEnvelopeAssignCategory("Transport", 75.0)
        assertEquals(75.0, env.envelopeAssign.categories["Transport"])
    }
}
