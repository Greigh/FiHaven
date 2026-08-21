import Foundation
import FiHavenCore

/// Mirrors SnoozesTest.kt and snoozes.test.js.
func runSnoozeChecks() {
    let ny = TimeZone(identifier: "America/New_York")!
    // 2026-08-20 18:00 in New York (22:00 UTC).
    let now = Date(timeIntervalSince1970: 1_787_263_200)

    section("Snoozes — snooze and un-snooze") {
        check(!Snoozes.isSnoozed([:], type: "bill", refId: "1", now: now), "nothing starts snoozed")
        let map = Snoozes.snoozed([:], type: "bill", refId: "1", tz: ny, now: now)
        check(Snoozes.isSnoozed(map, type: "bill", refId: "1", now: now), "a snoozed row reads snoozed")
        check(!Snoozes.isSnoozed(map, type: "card", refId: "1", now: now), "the type is part of the key")
        let cleared = Snoozes.unsnoozed(map, type: "bill", refId: "1")
        check(!Snoozes.isSnoozed(cleared, type: "bill", refId: "1", now: now), "un-snooze clears it")
    }

    section("Snoozes — expiry is midnight in the user's zone") {
        let until = Snoozes.tomorrow(tz: ny, now: now)
        // Midnight starting 2026-08-21 in New York is 04:00 UTC.
        checkEqual(until, 1_787_284_800_000, "expires at the next local midnight")
        let map = ["bill:1": until]
        check(Snoozes.isSnoozed(map, type: "bill", refId: "1",
                                now: Date(timeIntervalSince1970: until / 1000 - 60)),
              "still snoozed a minute before midnight")
        check(!Snoozes.isSnoozed(map, type: "bill", refId: "1",
                                 now: Date(timeIntervalSince1970: until / 1000 + 60)),
              "awake a minute after midnight")
        // 22:00 UTC on the 20th is already the 21st in Tokyo, so its
        // "tomorrow" is the 22nd there.
        let tokyo = Snoozes.tomorrow(tz: TimeZone(identifier: "Asia/Tokyo")!, now: now)
        checkEqual(tokyo, 1_787_324_400_000, "the zone decides which day is tomorrow")
    }

    section("Snoozes — pruning") {
        let ms = now.timeIntervalSince1970 * 1000
        let map = ["bill:old": ms - 1000, "bill:future": ms + 60_000]
        check(!Snoozes.isSnoozed(map, type: "bill", refId: "old", now: now),
              "an expired entry reads as awake before it is pruned")
        let pruned = Snoozes.pruned(map, now: now)
        checkEqual(Set(pruned.keys), ["bill:future"], "only expired keys are dropped")
    }
}
