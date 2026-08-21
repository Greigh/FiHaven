package app.fihaven.core.logic

import java.time.Instant
import java.time.ZoneId

/// Per-device "snooze until tomorrow" for dashboard rows, ported from
/// snoozes.svelte.js (mirrors Snoozes.swift).
///
/// A snooze is a map entry `"type:refId"` → the epoch-millisecond it expires,
/// which is midnight at the start of tomorrow in the user's timezone. Web
/// keeps the map in localStorage and never syncs it; the native apps keep it
/// in SharedPreferences / UserDefaults for the same reason — hiding a row is a
/// "not on this screen, not right now" gesture, so it belongs to the device you
/// made it on, not to the account.
object Snoozes {
    /** Map key for one dashboard row. [type] is "bill" or "card". */
    fun key(type: String, refId: String): String = "$type:$refId"

    /** Midnight at the start of tomorrow in [zone], in epoch milliseconds —
     *  the moment a fresh snooze expires. */
    fun tomorrow(zone: ZoneId, now: Instant = Instant.now()): Long =
        DateLogic.today(zone, now).plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()

    /** Is this row snoozed *right now*? An expired entry reads as not snoozed
     *  even before it is pruned, so a stale map can never keep a row hidden
     *  past its deadline. */
    fun isSnoozed(
        map: Map<String, Long>,
        type: String,
        refId: String,
        now: Instant = Instant.now(),
    ): Boolean {
        val until = map[key(type, refId)] ?: return false
        return now.toEpochMilli() < until
    }

    /** The map with this row snoozed until tomorrow. */
    fun snoozed(
        map: Map<String, Long>,
        type: String,
        refId: String,
        zone: ZoneId,
        now: Instant = Instant.now(),
    ): Map<String, Long> = map + (key(type, refId) to tomorrow(zone, now))

    /** The map with this row's snooze lifted. */
    fun unsnoozed(map: Map<String, Long>, type: String, refId: String): Map<String, Long> =
        map - key(type, refId)

    /** Drop expired entries so the stored map stays tidy. */
    fun pruned(map: Map<String, Long>, now: Instant = Instant.now()): Map<String, Long> {
        val ms = now.toEpochMilli()
        return map.filterValues { it > ms }
    }
}
