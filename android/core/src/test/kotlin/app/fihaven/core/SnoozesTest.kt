package app.fihaven.core

import app.fihaven.core.logic.Snoozes
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.ZoneId
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Mirrors snoozes.test.js and SnoozeChecks.swift. */
class SnoozesTest {
    private val ny: ZoneId = ZoneId.of("America/New_York")
    // 2026-08-20 18:00 in New York (22:00 UTC).
    private val now: Instant = Instant.parse("2026-08-20T22:00:00Z")

    @Test fun snoozeMarksAnItemSnoozed() {
        assertFalse(Snoozes.isSnoozed(emptyMap(), "bill", "1", now))
        val map = Snoozes.snoozed(emptyMap(), "bill", "1", ny, now)
        assertTrue(Snoozes.isSnoozed(map, "bill", "1", now))
        assertFalse(Snoozes.isSnoozed(map, "card", "1", now), "the type is part of the key")
    }

    @Test fun unsnoozeClearsTheSnooze() {
        val map = Snoozes.snoozed(emptyMap(), "card", "x", ny, now)
        assertFalse(Snoozes.isSnoozed(Snoozes.unsnoozed(map, "card", "x"), "card", "x", now))
    }

    @Test fun snoozeExpiresAtMidnightInTheUsersZone() {
        val until = Snoozes.tomorrow(ny, now)
        // Midnight starting 2026-08-21 in New York is 04:00 UTC.
        assertEquals(Instant.parse("2026-08-21T04:00:00Z").toEpochMilli(), until)
        // Still snoozed a minute before, awake a minute after.
        val map = mapOf("bill:1" to until)
        assertTrue(Snoozes.isSnoozed(map, "bill", "1", Instant.ofEpochMilli(until - 60_000)))
        assertFalse(Snoozes.isSnoozed(map, "bill", "1", Instant.ofEpochMilli(until + 60_000)))
    }

    @Test fun tomorrowFollowsTheZoneNotTheDevice() {
        // 22:00 UTC on the 20th is already the 21st in Tokyo, so its
        // "tomorrow" is the 22nd there.
        val tokyo = Snoozes.tomorrow(ZoneId.of("Asia/Tokyo"), now)
        assertEquals(Instant.parse("2026-08-21T15:00:00Z").toEpochMilli(), tokyo)
    }

    @Test fun isSnoozedIsFalseOnceTheTimestampIsPast() {
        val map = mapOf("bill:past" to now.toEpochMilli() - 1000)
        assertFalse(Snoozes.isSnoozed(map, "bill", "past", now))
    }

    @Test fun pruneDropsOnlyExpiredKeys() {
        val map = mapOf(
            "bill:old" to now.toEpochMilli() - 1000,
            "bill:future" to now.toEpochMilli() + 60_000,
        )
        val pruned = Snoozes.pruned(map, now)
        assertEquals(setOf("bill:future"), pruned.keys)
    }
}
