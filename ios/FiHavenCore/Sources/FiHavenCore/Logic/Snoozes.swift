import Foundation

/// Per-device "snooze until tomorrow" for dashboard rows, ported from
/// snoozes.svelte.js.
///
/// A snooze is a map entry `"type:refId"` → the epoch-millisecond it
/// expires, which is midnight at the start of tomorrow in the user's
/// timezone. Web keeps the map in localStorage and never syncs it; the
/// native apps keep it in UserDefaults / SharedPreferences for the same
/// reason — hiding a row is a "not on this screen, not right now" gesture,
/// so it belongs to the device you made it on, not to the account.
public enum Snoozes {
    /// Map key for one dashboard row. `type` is "bill" or "card".
    public static func key(type: String, refId: String) -> String {
        type + ":" + refId
    }

    /// Midnight at the start of tomorrow in `tz`, in epoch milliseconds —
    /// the moment a fresh snooze expires.
    public static func tomorrow(tz: TimeZone, now: Date = Date()) -> Double {
        let cal = DateLogic.calendar(tz: tz)
        let start = cal.date(byAdding: .day, value: 1, to: DateLogic.today(tz: tz, now: now)) ?? now
        return start.timeIntervalSince1970 * 1000
    }

    /// Is this row snoozed *right now*? An expired entry reads as not
    /// snoozed even before it is pruned, so a stale map can never keep a
    /// row hidden past its deadline.
    public static func isSnoozed(
        _ map: [String: Double], type: String, refId: String, now: Date = Date()
    ) -> Bool {
        guard let until = map[key(type: type, refId: refId)] else { return false }
        return now.timeIntervalSince1970 * 1000 < until
    }

    /// The map with this row snoozed until tomorrow.
    public static func snoozed(
        _ map: [String: Double], type: String, refId: String,
        tz: TimeZone, now: Date = Date()
    ) -> [String: Double] {
        var out = map
        out[key(type: type, refId: refId)] = tomorrow(tz: tz, now: now)
        return out
    }

    /// The map with this row's snooze lifted.
    public static func unsnoozed(
        _ map: [String: Double], type: String, refId: String
    ) -> [String: Double] {
        var out = map
        out.removeValue(forKey: key(type: type, refId: refId))
        return out
    }

    /// Drop expired entries so the stored map stays tidy.
    public static func pruned(_ map: [String: Double], now: Date = Date()) -> [String: Double] {
        let ms = now.timeIntervalSince1970 * 1000
        return map.filter { $0.value > ms }
    }
}
