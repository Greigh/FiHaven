import Foundation
import FiHavenCore

/// CRUD + mark-paid helpers. Each mutates the in-memory data and triggers
/// the debounced sync via `mutate`.
extension AppStore {
    // ── Bills ────────────────────────────────────────────────────────
    func upsertBill(_ bill: Bill) {
        mutate { data in
            if let i = data.bills.firstIndex(where: { $0.id == bill.id }) {
                data.bills[i] = bill
            } else {
                data.bills.append(bill)
            }
        }
    }

    func deleteBill(_ bill: Bill) {
        mutate { $0.bills.removeAll { $0.id == bill.id } }
    }

    // ── Cards ────────────────────────────────────────────────────────
    func upsertCard(_ card: Card) {
        mutate { data in
            if let i = data.cards.firstIndex(where: { $0.id == card.id }) {
                data.cards[i] = card
            } else {
                data.cards.append(card)
            }
        }
    }

    func deleteCard(_ card: Card) {
        mutate { $0.cards.removeAll { $0.id == card.id } }
    }

    // ── Mark paid ────────────────────────────────────────────────────
    /// Toggle the paid state of an upcoming item for the current month:
    /// add a payment if none exists, else remove it.
    func togglePaid(_ item: UpcomingItem) {
        let mk = currentMonthKey
        mutate { data in
            if let i = data.payments.firstIndex(where: {
                $0.type == item.type && $0.refId == item.refId && $0.monthKey == mk
            }) {
                data.payments.remove(at: i)
            } else {
                data.payments.append(Payment(
                    id: Self.newID(),
                    type: item.type,
                    refId: item.refId,
                    name: item.name,
                    amount: item.amount,
                    date: self.todayISO(),
                    monthKey: mk,
                    note: ""
                ))
            }
        }
    }

    /// Record a payment of `amount` toward a bill/card on `date`. Unlike
    /// the old one-tap toggle, payments accumulate toward the monthly
    /// goal (partial installments are kept). Card payments decrement the
    /// balance, mirroring confirmPay + applyCardPaymentDelta in the web.
    func recordPayment(type: String, refId: String, name: String, amount: Double, date: Date, note: String) {
        let iso = isoDay(date)
        let mk  = DateLogic.monthKey(date, tz: tz)
        mutate { data in
            data.payments.append(Payment(
                id: Self.newID(), type: type, refId: refId, name: name,
                amount: amount, date: iso, monthKey: mk, note: note
            ))
            if type == "card" { Self.applyCardPaymentDelta(refId, amount, in: &data) }
        }
    }

    /// Recording a card payment decrements its balance (and promo
    /// balance); reversing one adds it back. Mirrors applyCardPaymentDelta
    /// in modals.js. `delta` is positive for a new payment, negative to undo.
    static func applyCardPaymentDelta(_ refId: String, _ delta: Double, in data: inout AppData) {
        guard delta != 0,
              let i = data.cards.firstIndex(where: { String($0.id) == refId }) else { return }
        data.cards[i].balance = max(0, data.cards[i].balance - delta)
        if let pb = data.cards[i].promoBalance {
            data.cards[i].promoBalance = max(0, pb - delta)
        }
    }

    /// Mark a bill/card paid (idempotent helper used by row toggles).
    func setPaid(type: String, refId: String, name: String, amount: Double, paid: Bool) {
        let mk = currentMonthKey
        mutate { data in
            let existing = data.payments.firstIndex {
                $0.type == type && $0.refId == refId && $0.monthKey == mk
            }
            if paid, existing == nil {
                data.payments.append(Payment(
                    id: Self.newID(), type: type, refId: refId,
                    name: name, amount: amount, date: self.todayISO(),
                    monthKey: mk, note: ""
                ))
            } else if !paid, let i = existing {
                data.payments.remove(at: i)
            }
        }
    }

    // ── Income sources (settings.incomes) ───────────────────────────
    func upsertIncome(_ source: IncomeSource) {
        mutate { data in
            var list = data.settings.incomes
            if let i = list.firstIndex(where: { $0.id == source.id }) {
                list[i] = source
            } else {
                list.append(source)
            }
            data.settings.incomes = list
        }
    }

    func deleteIncome(_ source: IncomeSource) {
        mutate { $0.settings.incomes.removeAll { $0.id == source.id } }
    }

    // ── Preferences ──────────────────────────────────────────────────
    func setTimezone(_ tz: String?) {
        mutate { $0.settings.timezone = tz }
    }

    func setPaidGoal(_ policy: PaidGoalPolicy) {
        mutate { $0.settings.paidGoal = policy.rawValue }
    }

    func setCurrency(_ code: String) {
        Money.setCurrency(code)
        mutate { $0.settings.currency = code }
    }

    func setLandingView(_ view: String) {
        mutate { $0.settings.landingView = view }
    }

    func setBillReminders(_ on: Bool) {
        mutate { $0.settings.billReminders = on }
    }

    func setMonthlySummary(_ on: Bool) {
        mutate { $0.settings.monthlySummary = on }
    }

    // ── History ──────────────────────────────────────────────────────
    func deletePayment(_ payment: Payment) {
        mutate { data in
            data.payments.removeAll { $0.id == payment.id }
            // Undo the balance decrement a card payment applied.
            if payment.type == "card" {
                Self.applyCardPaymentDelta(payment.refId, -payment.amount, in: &data)
            }
        }
    }

    var paymentsByDateDesc: [Payment] {
        data.payments.sorted { $0.date > $1.date }
    }

    // ── helpers ──────────────────────────────────────────────────────
    /// A new unique id (timestamp ms), matching how the web mints ids.
    static func newID() -> Int { Int(Date().timeIntervalSince1970 * 1000) }

    func todayISO() -> String { isoDay(Date()) }

    /// "yyyy-MM-dd" for a date in the user's timezone.
    func isoDay(_ date: Date) -> String {
        let f = DateFormatter()
        f.timeZone = tz
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    var sortedBills: [Bill] {
        data.bills.sorted { ($0.dueDay ?? 99) < ($1.dueDay ?? 99) }
    }

    var sortedCards: [Card] {
        data.cards.sorted { $0.balance > $1.balance }
    }
}
