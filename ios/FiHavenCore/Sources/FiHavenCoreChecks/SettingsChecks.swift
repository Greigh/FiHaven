import Foundation
import FiHavenCore

// Notification + dashboard settings accessors — these back the new email/
// notification options and the widget dashboard, and must stay in parity
// with the web (client/js/dashboardWidgets.js) and Android equivalents.
func runSettingsChecks() {
    section("Settings — notification/dashboard defaults") {
        let s = Settings()
        checkEqual(s.dashboardLayout, "classic", "dashboardLayout default")
        checkEqual(s.dashboardWidgets, [], "dashboardWidgets default empty")
        checkEqual(s.reminderLeadDays, 3, "reminderLeadDays default")
        checkEqual(s.notifyHour, 8, "notifyHour default")
        check(!s.remindOnDueDay, "remindOnDueDay default false")
        check(!s.weeklyDigest, "weeklyDigest default false")
        check(!s.localNotifications, "localNotifications default false")
    }

    section("Settings — round-trips through the raw bag") {
        var s = Settings()
        s.dashboardLayout = "widgets"
        s.dashboardWidgets = ["goals", "stats", "networth"]
        s.reminderLeadDays = 5
        s.notifyHour = 19
        s.remindOnDueDay = true
        s.weeklyDigest = true
        s.localNotifications = true

        checkEqual(s.dashboardLayout, "widgets", "dashboardLayout set")
        checkEqual(s.dashboardWidgets, ["goals", "stats", "networth"], "dashboardWidgets set")
        checkEqual(s.reminderLeadDays, 5, "reminderLeadDays set")
        checkEqual(s.notifyHour, 19, "notifyHour set")
        check(s.remindOnDueDay, "remindOnDueDay set")
        check(s.weeklyDigest, "weeklyDigest set")
        check(s.localNotifications, "localNotifications set")

        // Survives a JSON encode/decode (the way settings are persisted).
        let encoded = try JSONEncoder().encode(s)
        let again = try JSONDecoder().decode(Settings.self, from: encoded)
        checkEqual(again.dashboardWidgets, ["goals", "stats", "networth"], "widgets survive save")
        checkEqual(again.notifyHour, 19, "notifyHour survives save")
    }

    section("Settings — Plaid opt-ins default off and persist") {
        var s = Settings()
        check(!s.plaidUpdateBalances, "plaidUpdateBalances defaults off")
        check(!s.plaidUpdatePurchases, "plaidUpdatePurchases defaults off")

        s.plaidUpdatePurchases = true
        let again = try JSONDecoder().decode(Settings.self, from: JSONEncoder().encode(s))
        check(again.plaidUpdatePurchases, "plaidUpdatePurchases survives save")
        check(!again.plaidUpdateBalances, "balances stays off independently")

        // A value only the web has written must not be dropped by a native save.
        let fromWeb = try JSONDecoder().decode(
            Settings.self, from: Data(#"{"plaidUpdatePurchases":true}"#.utf8))
        check(fromWeb.plaidUpdatePurchases, "reads a web-written plaidUpdatePurchases")
        let reencoded = String(data: try JSONEncoder().encode(fromWeb), encoding: .utf8) ?? ""
        check(reencoded.contains("plaidUpdatePurchases"), "native re-encode keeps the flag")
    }

    section("Settings — lead time and notify hour are clamped") {
        // On set.
        var s = Settings()
        s.reminderLeadDays = 99
        checkEqual(s.reminderLeadDays, 14, "lead clamps high on set")
        s.reminderLeadDays = -5
        checkEqual(s.reminderLeadDays, 0, "lead clamps low on set")
        s.notifyHour = 30
        checkEqual(s.notifyHour, 23, "hour clamps high on set")
        s.notifyHour = -1
        checkEqual(s.notifyHour, 0, "hour clamps low on set")

        // And on get, for values that arrived from another platform.
        let fromWeb = Settings(["reminderLeadDays": .number(50), "notifyHour": .number(99)])
        checkEqual(fromWeb.reminderLeadDays, 14, "lead clamps high on get")
        checkEqual(fromWeb.notifyHour, 23, "hour clamps high on get")
    }

    // Multi-day reminders. Must match reminderOffsets() in server/scheduler.js
    // and the Android JsonObject.reminderOffsets accessor.
    section("Settings — reminderOffsets") {
        // Absent: falls back to the legacy single lead + due-day pair.
        checkEqual(Settings().reminderOffsets, [3], "default falls back to [3]")
        checkEqual(
            Settings(["reminderLeadDays": .number(5), "remindOnDueDay": .bool(true)]).reminderOffsets,
            [5, 0], "legacy lead + due day → [5, 0]")
        checkEqual(
            Settings(["reminderLeadDays": .number(0), "remindOnDueDay": .bool(true)]).reminderOffsets,
            [0], "due day already the lead → no duplicate")

        // Present: deduped, clamped, longest-first, capped.
        let messy = Settings(["reminderOffsets": .array([
            .number(3), .number(3), .number(99), .number(-1), .number(0),
        ])])
        checkEqual(messy.reminderOffsets, [3, 0], "dedupes and drops out-of-range")
        let many = Settings(["reminderOffsets": .array(
            [1, 2, 3, 5, 7, 10, 14].map { .number(Double($0)) })])
        checkEqual(many.reminderOffsets, [14, 10, 7, 5, 3], "caps at maxReminderOffsets")

        // Empty is a real choice, not a reason to fall back.
        let none = Settings(["reminderOffsets": .array([]), "reminderLeadDays": .number(3)])
        checkEqual(none.reminderOffsets, [], "empty array does not fall back")

        // The setter mirrors the legacy pair so older clients stay correct.
        var s = Settings()
        s.reminderOffsets = [0, 7, 3]
        checkEqual(s.reminderOffsets, [7, 3, 0], "setter sorts longest-first")
        checkEqual(s.reminderLeadDays, 7, "setter mirrors reminderLeadDays")
        check(s.remindOnDueDay, "setter mirrors remindOnDueDay")
        s.reminderOffsets = [5]
        check(!s.remindOnDueDay, "clearing the due day clears the legacy flag")
        s.reminderOffsets = []
        checkEqual(s.reminderLeadDays, 3, "empty leaves the legacy lead at its default")
    }

    section("Settings — categoryIcons emoji + image") {
        let emojiOnly = Settings(["categoryIcons": .object([
            "Housing": .string("🏡"),
            "Utilities": .object(["type": .string("emoji"), "value": .string("💡")]),
        ])])
        checkEqual(emojiOnly.categoryIcons["Housing"], .emoji("🏡"), "plain emoji string")
        checkEqual(emojiOnly.categoryIcons["Utilities"], .emoji("💡"), "typed emoji object")
        checkEqual(emojiOnly.categoryIconEmojis["Housing"], "🏡", "emoji map exposes Housing")

        let withImage = Settings(["categoryIcons": .object([
            "Auto": .object([
                "type": .string("image"),
                "value": .string("data:image/png;base64,abc"),
            ]),
            "Loan": .string("🏦"),
        ])])
        checkEqual(withImage.categoryIcons["Auto"], .image(dataURI: "data:image/png;base64,abc"), "image override")
        checkEqual(withImage.categoryIcons["Loan"], .emoji("🏦"), "emoji alongside image")
        check(withImage.categoryIconEmojis["Auto"] == nil, "image omitted from emoji map")
        checkEqual(
            CTConstants.iconInfo(forCategory: "Auto", overrides: withImage.categoryIcons),
            .image(dataURI: "data:image/png;base64,abc"),
            "resolver returns image"
        )
        checkEqual(
            CTConstants.icon(forCategory: "Auto", overrides: withImage.categoryIcons),
            "🚗",
            "emoji helper falls back for images"
        )

        let rejected = Settings(["categoryIcons": .object([
            "Housing": .string("Housing"),
            "Utilities": .object([
                "type": .string("image"),
                "value": .string("http://evil.example/x.png"),
            ]),
            "Loan": .object([
                "type": .string("image"),
                "value": .string("data:text/plain;base64,abc"),
            ]),
        ])])
        check(rejected.categoryIcons["Housing"] == nil, "plain text rejected")
        check(rejected.categoryIcons["Utilities"] == nil, "http image rejected")
        check(rejected.categoryIcons["Loan"] == nil, "non-image data URI rejected")
        check(CategoryIcon.isSafeDataURI("data:image/png;base64,abc"), "png data URI ok")
        check(!CategoryIcon.isSafeDataURI("data:text/plain;base64,abc"), "text data URI rejected")
    }
}
