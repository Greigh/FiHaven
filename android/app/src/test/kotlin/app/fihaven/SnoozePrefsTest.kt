package app.fihaven

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** The stored form of the per-device snooze queue. The rules themselves are
 *  covered by SnoozesTest in :core; this is the part that only exists in the
 *  app — a queue has to survive a relaunch, and a corrupt one must never keep
 *  the dashboard from drawing. */
class SnoozePrefsTest {
    @Test fun roundTripsAQueue() {
        val map = mapOf("bill:1" to 1_787_284_800_000L, "card:42" to 1_787_371_200_000L)
        assertEquals(map, decodeSnoozes(encodeSnoozes(map)))
    }

    @Test fun emptyAndMissingValuesDecodeToAnEmptyQueue() {
        assertEquals(emptyMap(), decodeSnoozes(null))
        assertEquals(emptyMap(), decodeSnoozes(""))
        assertEquals(emptyMap(), decodeSnoozes("   "))
        assertTrue(encodeSnoozes(emptyMap()).isEmpty())
    }

    @Test fun junkLinesAreDroppedRatherThanThrowing() {
        val decoded = decodeSnoozes(
            listOf(
                "bill:1=1787284800000",
                "truncated",          // no separator
                "=123",               // no key
                "card:2=not-a-number",
            ).joinToString("\n")
        )
        assertEquals(mapOf("bill:1" to 1_787_284_800_000L), decoded)
    }
}
