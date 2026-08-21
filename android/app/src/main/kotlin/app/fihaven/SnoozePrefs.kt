package app.fihaven

import android.content.Context
import androidx.core.content.edit
import app.fihaven.core.logic.Snoozes

/** Per-device "snooze until tomorrow" for dashboard rows, backed by
 *  SharedPreferences. Mirrors web's snoozes.svelte.js (localStorage) and
 *  iOS's SnoozeStore (UserDefaults): a snooze is never synced, so hiding a
 *  row on this phone leaves it alone on every other device.
 *
 *  The rules live in [Snoozes] (core, shared with iOS/web); this class only
 *  owns the storage. */
class SnoozePrefs(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** The stored queue, pruned of anything that has already expired.
     *  Expired entries already read as awake, so this is housekeeping — it
     *  keeps a long-lived queue from growing without bound. */
    fun load(): Map<String, Long> {
        val stored = decodeSnoozes(prefs.getString(KEY, null))
        val pruned = Snoozes.pruned(stored)
        if (pruned.size != stored.size) save(pruned)
        return pruned
    }

    fun save(map: Map<String, Long>) {
        prefs.edit { putString(KEY, encodeSnoozes(map)) }
    }

    companion object {
        // Same prefs file as theme/intro, and the same key web uses.
        private const val PREFS = "fh_prefs"
        const val KEY = "fh_snoozes"
    }
}

/** `"type:refId=millis"` pairs, newline-separated. Hand-rolled rather than
 *  JSON so the codec stays dependency-free and readable in `adb shell` — the
 *  map is device-local, so no other client ever has to parse it. */
internal fun encodeSnoozes(map: Map<String, Long>): String =
    map.entries.joinToString("\n") { (k, v) -> "$k=$v" }

/** Lenient by design: a truncated or hand-edited line is dropped rather than
 *  throwing, because a corrupt snooze queue must never keep the app from
 *  drawing its dashboard. */
internal fun decodeSnoozes(raw: String?): Map<String, Long> {
    if (raw.isNullOrBlank()) return emptyMap()
    return raw.lineSequence().mapNotNull { line ->
        val at = line.lastIndexOf('=')
        if (at <= 0) return@mapNotNull null
        val until = line.substring(at + 1).toLongOrNull() ?: return@mapNotNull null
        line.substring(0, at) to until
    }.toMap()
}
