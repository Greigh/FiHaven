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
}
