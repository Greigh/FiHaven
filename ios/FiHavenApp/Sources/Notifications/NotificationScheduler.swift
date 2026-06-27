import Foundation
import UserNotifications
import FiHavenCore

/// Schedules on-device bill-due reminders from synced data. There's no server
/// push: each device mirrors the user's reminder settings as local
/// notifications, so they fire even offline. We reschedule whenever the data
/// or settings change (AppStore) — cancelling our pending requests and
/// re-adding from the current bills.
enum NotificationScheduler {
    private static var center: UNUserNotificationCenter { .current() }

    // iOS keeps at most 64 pending requests; stay comfortably under it.
    private static let maxPending = 60

    /// Ask for alert/sound/badge permission. Returns whether it's granted.
    @discardableResult
    static func requestAuthorization() async -> Bool {
        do { return try await center.requestAuthorization(options: [.alert, .badge, .sound]) }
        catch { return false }
    }

    static func authorizationStatus() async -> UNAuthorizationStatus {
        await center.notificationSettings().authorizationStatus
    }

    /// Cancel existing bill/trial reminders and reschedule from the current data.
    /// Off (or no permission) simply clears everything we'd scheduled.
    static func reschedule(bills: [Bill], cards: [Card] = [], settings: Settings, tz: TimeZone) {
        center.removeAllPendingNotificationRequests()
        guard settings.localNotifications else { return }

        let cal = DateLogic.calendar(tz: tz)
        let now = Date()
        let lead = settings.reminderLeadDays
        let hour = settings.notifyHour
        // One notification per lead-day offset; due-day (0) only when enabled.
        let offsets = (settings.remindOnDueDay ? Set([lead, 0]) : Set([lead])).sorted(by: >)

        var scheduled = 0
        // Soonest-due first, so a long bill list still gets the most relevant
        // reminders within the pending-request budget.
        let upcoming = bills.compactMap { bill -> (Bill, Date)? in
            guard let due = BillSchedule.nextDueDate(bill, tz: tz, from: now) else { return nil }
            return (bill, due)
        }.sorted { $0.1 < $1.1 }

        for (bill, due) in upcoming {
            if scheduled >= maxPending { break }
            for off in offsets {
                guard scheduled < maxPending else { break }
                guard let fireDay = cal.date(byAdding: .day, value: -off, to: due) else { continue }
                var comps = cal.dateComponents([.year, .month, .day], from: fireDay)
                comps.hour = hour
                comps.minute = 0
                guard let fireDate = cal.date(from: comps), fireDate > now else { continue }

                let content = UNMutableNotificationContent()
                content.title = "Bill reminder"
                let name = bill.name.isEmpty ? "A bill" : bill.name
                content.body = "\(name) \(phrase(off)) — \(Money.fmt(bill.amount))."
                content.sound = .default

                let trigger = UNCalendarNotificationTrigger(
                    dateMatching: cal.dateComponents([.year, .month, .day, .hour, .minute], from: fireDate),
                    repeats: false
                )
                center.add(UNNotificationRequest(
                    identifier: "bill-\(bill.id)-\(off)", content: content, trigger: trigger
                ))
                scheduled += 1
            }
        }

        // Trial-ending reminders for subscription bills with trialEnds set.
        let trials = bills.compactMap { bill -> (Bill, Date)? in
            guard let end = trialEndDate(bill, tz: tz) else { return nil }
            return (bill, end)
        }.sorted { $0.1 < $1.1 }

        for (bill, end) in trials {
            if scheduled >= maxPending { break }
            for off in offsets {
                guard scheduled < maxPending else { break }
                guard let fireDay = cal.date(byAdding: .day, value: -off, to: end) else { continue }
                var comps = cal.dateComponents([.year, .month, .day], from: fireDay)
                comps.hour = hour
                comps.minute = 0
                guard let fireDate = cal.date(from: comps), fireDate > now else { continue }

                let content = UNMutableNotificationContent()
                content.title = "Trial ending soon"
                let name = bill.name.isEmpty ? "A subscription" : bill.name
                content.body = "\(name) free trial \(phrase(off))."
                content.sound = .default

                let trigger = UNCalendarNotificationTrigger(
                    dateMatching: cal.dateComponents([.year, .month, .day, .hour, .minute], from: fireDate),
                    repeats: false
                )
                center.add(UNNotificationRequest(
                    identifier: "trial-\(bill.id)-\(off)", content: content, trigger: trigger
                ))
                scheduled += 1
            }
        }

        // Card-linked offer expiry reminders (Pro; mirrors the server email,
        // gated on offerReminders). Nudges the user before an activated offer
        // lapses.
        if settings.offerReminders {
            let offers = cards.flatMap { card in
                card.offers.filter { !$0.used && !$0.expires.isEmpty }
                    .compactMap { offer -> (CardOffer, Date)? in
                        guard let end = DateLogic.parseDate(offer.expires, tz: tz) else { return nil }
                        return (offer, end)
                    }
            }.sorted { $0.1 < $1.1 }

            for (offer, end) in offers {
                if scheduled >= maxPending { break }
                for off in offsets {
                    guard scheduled < maxPending else { break }
                    guard let fireDay = cal.date(byAdding: .day, value: -off, to: end) else { continue }
                    var comps = cal.dateComponents([.year, .month, .day], from: fireDay)
                    comps.hour = hour
                    comps.minute = 0
                    guard let fireDate = cal.date(from: comps), fireDate > now else { continue }

                    let content = UNMutableNotificationContent()
                    content.title = "Offer expiring soon"
                    let merchant = offer.merchant.isEmpty ? "A card offer" : offer.merchant
                    content.body = offer.detail.isEmpty
                        ? "\(merchant) offer \(offerPhrase(off))."
                        : "\(merchant) (\(offer.detail)) \(offerPhrase(off))."
                    content.sound = .default

                    let trigger = UNCalendarNotificationTrigger(
                        dateMatching: cal.dateComponents([.year, .month, .day, .hour, .minute], from: fireDate),
                        repeats: false
                    )
                    center.add(UNNotificationRequest(
                        identifier: "offer-\(offer.id)-\(off)", content: content, trigger: trigger
                    ))
                    scheduled += 1
                }
            }
        }
    }

    private static func offerPhrase(_ off: Int) -> String {
        switch off {
        case ..<1: return "expires today"
        case 1: return "expires tomorrow"
        default: return "expires in \(off) days"
        }
    }

    private static func trialEndDate(_ bill: Bill, tz: TimeZone) -> Date? {
        guard let raw = bill.trialEnds,
              raw.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil
        else { return nil }
        return DateLogic.parseDate(raw, tz: tz)
    }

    private static func phrase(_ off: Int) -> String {
        switch off {
        case ..<1: return "is due today"
        case 1: return "is due tomorrow"
        default: return "is due in \(off) days"
        }
    }
}
