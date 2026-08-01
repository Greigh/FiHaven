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
import app.fihaven.core.model.reminderOffsets
import app.fihaven.core.model.theme
import app.fihaven.core.model.weeklyDigest
import app.fihaven.core.model.withBudgetBucketOverride
import app.fihaven.core.model.withEnvelopeAssignCategory
import app.fihaven.core.model.withReminderOffsets
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

    // Multi-day reminders. Must match reminderOffsets() in server/scheduler.js
    // and the iOS Settings.reminderOffsets accessor.
    @Test fun reminderOffsetsFallsBackToTheLegacyPair() {
        assertEquals(listOf(3), settings("{}").reminderOffsets)
        assertEquals(
            listOf(5, 0),
            settings("""{"reminderLeadDays":5,"remindOnDueDay":true}""").reminderOffsets,
        )
        // The due day is already the lead — don't list it twice.
        assertEquals(
            listOf(0),
            settings("""{"reminderLeadDays":0,"remindOnDueDay":true}""").reminderOffsets,
        )
    }

    @Test fun reminderOffsetsDedupesClampsAndCaps() {
        assertEquals(
            listOf(3, 0),
            settings("""{"reminderOffsets":[3,3,99,-1,0]}""").reminderOffsets,
        )
        assertEquals(
            listOf(14, 10, 7, 5, 3),
            settings("""{"reminderOffsets":[1,2,3,5,7,10,14]}""").reminderOffsets,
        )
    }

    @Test fun emptyReminderOffsetsDoesNotFallBack() {
        // "Don't remind me" is a real choice, not a missing value.
        assertEquals(
            emptyList(),
            settings("""{"reminderOffsets":[],"reminderLeadDays":3}""").reminderOffsets,
        )
    }

    @Test fun withReminderOffsetsMirrorsTheLegacyPair() {
        val s = settings("{}").withReminderOffsets(listOf(0, 7, 3))
        assertEquals(listOf(7, 3, 0), s.reminderOffsets)
        assertEquals(7, s.reminderLeadDays)
        assertTrue(s.remindOnDueDay)

        val noDueDay = s.withReminderOffsets(listOf(5))
        assertFalse(noDueDay.remindOnDueDay)
        assertEquals(5, noDueDay.reminderLeadDays)

        // Emptied: the legacy lead falls back to its default rather than
        // keeping a value the user just cleared.
        val cleared = s.withReminderOffsets(emptyList())
        assertEquals(emptyList(), cleared.reminderOffsets)
        assertEquals(3, cleared.reminderLeadDays)
        assertFalse(cleared.remindOnDueDay)
    }

    @Test fun withReminderOffsetsKeepsUnrelatedKeys() {
        val s = settings("""{"theme":"dark","notifyHour":19}""").withReminderOffsets(listOf(3))
        assertEquals("dark", s.theme)
        assertEquals(19, s.notifyHour)
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
