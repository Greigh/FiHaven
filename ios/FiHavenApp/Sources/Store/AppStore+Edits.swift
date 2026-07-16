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

    /// Save a subscription's manage/cancel link on the user's own bill.
    func setBillManageUrl(billId: String, url: String) {
        mutate { data in
            guard let i = data.bills.firstIndex(where: { $0.id == billId }) else { return }
            data.bills[i].manageUrl = url
        }
    }

    /// The user's own rewards/offers link for a card (rewards panel).
    func setCardRewardsUrl(cardId: String, url: String) {
        mutate { data in
            guard let i = data.cards.firstIndex(where: { $0.id == cardId }) else { return }
            data.cards[i].rewardsUrl = url
        }
    }

    /// Correct one reward rate on a card. `category == nil` means the base rate.
    /// A category set to 0 is removed so it falls back to the base rate rather
    /// than claiming a 0% bonus.
    func setCardRewardRate(cardId: String, category: String?, rate: Double) {
        mutate { data in
            guard let i = data.cards.firstIndex(where: { $0.id == cardId }) else { return }
            guard let category else {
                data.cards[i].rewardBase = rate
                return
            }
            if rate > 0 {
                data.cards[i].rewardCategories[category] = rate
            } else {
                data.cards[i].rewardCategories.removeValue(forKey: category)
            }
        }
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

    // ── Asset accounts (net worth) ──────────────────────────────────
    func upsertAccount(_ account: Account) {
        mutate { data in
            if let i = data.accounts.firstIndex(where: { $0.id == account.id }) {
                data.accounts[i] = account
            } else {
                data.accounts.append(account)
            }
        }
    }

    func deleteAccount(_ account: Account) {
        mutate { $0.accounts.removeAll { $0.id == account.id } }
    }

    // ── Savings goals ───────────────────────────────────────────────
    func upsertGoal(_ goal: SavingsGoal) {
        mutate { data in
            if let i = data.goals.firstIndex(where: { $0.id == goal.id }) {
                data.goals[i] = goal
            } else {
                data.goals.append(goal)
            }
        }
    }

    func deleteGoal(_ goal: SavingsGoal) {
        mutate { $0.goals.removeAll { $0.id == goal.id } }
    }

    // ── Spending transactions + category budgets ────────────────────
    func addTransaction(amount: Double, category: String, merchant: String, note: String = "", date: Date) {
        let iso = isoDay(date)
        mutate { data in
            data.transactions.append(SpendTransaction(
                id: Self.newPaymentID(), date: iso, amount: amount,
                category: category, merchant: merchant, note: note
            ))
        }
    }

    /// Edit a transaction, preserving its id and provenance
    /// (a bank row's source/plaidId/pending stay intact).
    func updateTransaction(id: String, amount: Double, category: String, merchant: String, note: String = "", date: Date) {
        let iso = isoDay(date)
        mutate { data in
            guard let i = data.transactions.firstIndex(where: { $0.id == id }) else { return }
            data.transactions[i].amount = amount
            data.transactions[i].category = category
            data.transactions[i].merchant = merchant
            data.transactions[i].note = note
            data.transactions[i].date = iso
        }
    }

    func deleteTransaction(_ tx: SpendTransaction) {
        mutate { $0.transactions.removeAll { $0.id == tx.id } }
    }

    /// Accept a pending bank transaction: it's a real purchase, so clear the
    /// pending flag (it reads as a settled bank row and stops nagging).
    func acceptBankTransaction(_ tx: SpendTransaction) {
        mutate { data in
            guard let i = data.transactions.firstIndex(where: { $0.id == tx.id }) else { return }
            data.transactions[i].pending = false
        }
    }

    /// Decline a bank transaction: remove it and remember its Plaid id so a
    /// future sync never re-imports it (the server suppresses both the id and a
    /// pending charge's posted successor).
    func declineBankTransaction(_ tx: SpendTransaction) {
        let pid = tx.plaidId ?? (tx.id.hasPrefix("plaid-") ? String(tx.id.dropFirst(6)) : nil)
        mutate { data in
            data.transactions.removeAll { $0.id == tx.id }
            guard let pid else { return }
            var hidden = data.settings.plaidHidden
            if !hidden.contains(pid) { hidden.append(pid) }
            if hidden.count > 200 { hidden = Array(hidden.suffix(200)) }
            data.settings.plaidHidden = hidden
        }
    }

    func setCategoryBudget(_ category: String, _ amount: Double) {
        mutate { data in
            var b = data.settings.categoryBudgets
            if amount > 0 { b[category] = amount } else { b.removeValue(forKey: category) }
            data.settings.categoryBudgets = b
        }
    }

    func deleteCard(_ card: Card) {
        mutate { $0.cards.removeAll { $0.id == card.id } }
    }

    // ── Archive (soft delete) ─────────────────────────────────────────
    func archiveCard(_ card: Card) {
        mutate { data in
            if let i = data.cards.firstIndex(where: { $0.id == card.id }) { data.cards[i].archived = true }
        }
    }
    func restoreCard(_ card: Card) {
        mutate { data in
            if let i = data.cards.firstIndex(where: { $0.id == card.id }) { data.cards[i].archived = false }
        }
    }
    func archiveBill(_ bill: Bill) {
        mutate { data in
            if let i = data.bills.firstIndex(where: { $0.id == bill.id }) { data.bills[i].archived = true }
        }
    }
    func restoreBill(_ bill: Bill) {
        mutate { data in
            if let i = data.bills.firstIndex(where: { $0.id == bill.id }) { data.bills[i].archived = false }
        }
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
                    id: Self.newPaymentID(),
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
                id: Self.newPaymentID(), type: type, refId: refId, name: name,
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
    /// Like the Pay sheet, a card toggle reconciles the card balance:
    /// marking paid decrements it, un-marking restores the recorded amount.
    func setPaid(type: String, refId: String, name: String, amount: Double, paid: Bool) {
        let mk = currentMonthKey
        mutate { data in
            let existing = data.payments.firstIndex {
                $0.type == type && $0.refId == refId && $0.monthKey == mk
            }
            if paid, existing == nil {
                data.payments.append(Payment(
                    id: Self.newPaymentID(), type: type, refId: refId,
                    name: name, amount: amount, date: self.todayISO(),
                    monthKey: mk, note: ""
                ))
                if type == "card" { Self.applyCardPaymentDelta(refId, amount, in: &data) }
            } else if !paid, let i = existing {
                let removed = data.payments[i]
                data.payments.remove(at: i)
                if type == "card" { Self.applyCardPaymentDelta(refId, -removed.amount, in: &data) }
            }
        }
    }

    /// Skip a bill/card for the current period: records a `skipped` payment
    /// (amount 0) so the item owes nothing and drops out of "still owed".
    /// Matched by the active period (date range); the stored monthKey is
    /// the calendar month, for back-compat.
    func skipMonth(type: String, refId: String, name: String) {
        let bounds = currentBounds
        let mk = currentMonthKey
        mutate { data in
            let exists = data.payments.contains {
                $0.skipped && $0.type == type && $0.refId == refId && bounds.contains($0)
            }
            guard !exists else { return }
            data.payments.append(Payment(
                id: Self.newPaymentID(), type: type, refId: refId,
                name: name, amount: 0, date: self.todayISO(),
                monthKey: mk, note: "Skipped this period", skipped: true
            ))
        }
    }

    /// Reverse a skip for the current period.
    func unskip(type: String, refId: String) {
        let bounds = currentBounds
        mutate { data in
            data.payments.removeAll {
                $0.skipped && $0.type == type && $0.refId == refId && bounds.contains($0)
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

    // ── Income adjustments (settings.incomeAdjustments) ──────────────
    func upsertAdjustment(_ adj: IncomeAdjustment) {
        mutate { data in
            var list = data.settings.incomeAdjustments
            if let i = list.firstIndex(where: { $0.id == adj.id }) {
                list[i] = adj
            } else {
                list.append(adj)
            }
            data.settings.incomeAdjustments = list
        }
    }

    func deleteAdjustment(_ adj: IncomeAdjustment) {
        mutate { $0.settings.incomeAdjustments.removeAll { $0.id == adj.id } }
    }

    // ── Preferences ──────────────────────────────────────────────────
    func setTimezone(_ tz: String?) {
        mutate { $0.settings.timezone = tz }
    }

    func setPaidGoal(_ policy: PaidGoalPolicy) {
        mutate { $0.settings.paidGoal = policy.rawValue }
    }

    // ── Budget period ─────────────────────────────────────────────────
    func setPeriodMode(_ mode: String) { mutate { $0.settings.periodMode = mode } }
    func setPeriodStartDay(_ day: Int) { mutate { $0.settings.periodStartDay = min(max(day, 1), 28) } }
    func setPeriodLength(_ len: Int) { mutate { $0.settings.periodLength = min(max(len, 7), 90) } }
    /// Set/clear the rolling-window start anchor ("YYYY-MM-DD"; nil/empty = epoch).
    func setPeriodAnchor(_ anchor: String?) { mutate { $0.settings.periodAnchor = anchor } }

    func setHidePaidOnDashboard(_ on: Bool) { mutate { $0.settings.hidePaidOnDashboard = on } }
    func setArchiveInsteadOfDelete(_ on: Bool) { mutate { $0.settings.archiveInsteadOfDelete = on } }

    func setCurrency(_ code: String) {
        Money.setCurrency(code)
        mutate { $0.settings.currency = code }
    }

    func setLandingView(_ view: String) {
        mutate { $0.settings.landingView = view }
    }

    /// Persist the bottom-bar tab order (ids). Tabs not listed fall under More.
    func setTabs(_ ids: [String]) {
        mutate { $0.settings.tabs = ids }
    }

    func setBillReminders(_ on: Bool) {
        mutate { $0.settings.billReminders = on }
    }

    func setMonthlySummary(_ on: Bool) {
        mutate { $0.settings.monthlySummary = on }
    }

    func setWeeklyDigest(_ on: Bool) {
        mutate { $0.settings.weeklyDigest = on }
    }

    /// Card-linked offer expiry reminders (email + on-device). Reschedules so a
    /// device notification is (un)set immediately.
    func setOfferReminders(_ on: Bool) {
        mutate { $0.settings.offerReminders = on }
        refreshNotifications()
    }

    /// Opt-in: let synced bank balances update matching cards (server-applied).
    func setPlaidUpdateBalances(_ on: Bool) {
        mutate { $0.settings.plaidUpdateBalances = on }
    }

    /// Opt-in: import bank outflows into Spending (server-applied, additive).
    func setPlaidUpdatePurchases(_ on: Bool) {
        mutate { $0.settings.plaidUpdatePurchases = on }
    }

    func setDashboardLayout(_ layout: String) {
        mutate { $0.settings.dashboardLayout = layout }
    }
    func setDashboardWidgets(_ ids: [String]) {
        mutate { $0.settings.dashboardWidgets = ids }
    }
    func setReminderLeadDays(_ days: Int) {
        mutate { $0.settings.reminderLeadDays = min(14, max(0, days)) }
    }
    func setRemindOnDueDay(_ on: Bool) {
        mutate { $0.settings.remindOnDueDay = on }
    }
    func setNotifyHour(_ hour: Int) {
        mutate { $0.settings.notifyHour = min(23, max(0, hour)) }
    }
    /// On-device reminders. Turning on requests permission, then reschedules.
    func setLocalNotifications(_ on: Bool) {
        mutate { $0.settings.localNotifications = on }
        if on {
            Task {
                await NotificationScheduler.requestAuthorization()
                refreshNotifications()
            }
        } else {
            refreshNotifications()
        }
    }

    /// Server push (APNs). Registers this device when turned on.
    func setPushNotifications(_ on: Bool) {
        mutate { $0.settings.pushNotifications = on }
        PushRegistrar.shared.setEnabled(on)
    }

    func setAutopayMark(_ on: Bool) {
        mutate { $0.settings.autopayMark = on }
        if on { runAutopayMark() }
    }
    func setAutopayMarkHour(_ hour: Int) {
        mutate { $0.settings.autopayMarkHour = min(23, max(0, hour)) }
    }

    // ── Card-linked offers ───────────────────────────────────────────
    /// Mark a card-linked offer used (so it drops off the active list).
    func setOfferUsed(cardId: String, offerId: String, used: Bool) {
        mutate { d in
            guard let ci = d.cards.firstIndex(where: { String($0.id) == cardId }) else { return }
            guard let oi = d.cards[ci].offers.firstIndex(where: { $0.id == offerId }) else { return }
            d.cards[ci].offers[oi].used = used
        }
    }

    // ── Card credits & perks ─────────────────────────────────────────
    /// Log how much of a card perk's credit has been used this cycle.
    func setPerkUsage(cardId: String, perk: CardPerk, amount: Double) {
        let cal = DateLogic.calendar(tz: tz)
        let now = DateLogic.today(tz: tz)
        let next = Perks.applyUsage(data.settings.perkUsage, cardId: cardId, perk: perk,
                                    amount: amount, date: now, cal: cal)
        mutate { $0.settings.perkUsage = next }
    }

    // ── Budget lens settings ─────────────────────────────────────────
    func setBudgetRule(_ mode: String) {
        mutate { $0.settings.budgetRule = mode }
    }

    func setBudgetRuleSplits(needs: Int, wants: Int, save: Int) {
        mutate {
            $0.settings.budgetRuleSplits = Settings.BudgetRuleSplits(
                needs: min(100, max(0, needs)),
                wants: min(100, max(0, wants)),
                save: min(100, max(0, save))
            )
        }
    }

    func setDebtFocusExtra(_ amount: Double) {
        mutate { $0.settings.debtFocusExtra = max(0, amount) }
    }

    func setEnvelopeRollover(_ on: Bool) {
        mutate { $0.settings.envelopeRollover = on }
    }

    func setEnvelopeAssignGoal(_ goalId: String, _ amount: Double) {
        mutate { data in
            var assign = data.settings.envelopeAssign
            if amount > 0 { assign.goals[goalId] = amount } else { assign.goals.removeValue(forKey: goalId) }
            data.settings.envelopeAssign = assign
        }
    }

    func setEnvelopeAssignCategory(_ category: String, _ amount: Double) {
        mutate { data in
            var assign = data.settings.envelopeAssign
            if amount > 0 { assign.categories[category] = amount } else { assign.categories.removeValue(forKey: category) }
            data.settings.envelopeAssign = assign
        }
    }

    func setBudgetBucketOverride(kind: String, category: String, bucket: String?) {
        mutate { data in
            var o = data.settings.budgetBucketOverrides
            if kind == "bills" {
                if let bucket, !bucket.isEmpty { o.bills[category] = bucket } else { o.bills.removeValue(forKey: category) }
            } else {
                if let bucket, !bucket.isEmpty { o.spending[category] = bucket } else { o.spending.removeValue(forKey: category) }
            }
            data.settings.budgetBucketOverrides = o
        }
    }

    /// Apply unused envelope amounts from the previous period once per period key.
    func applyEnvelopeRolloverIfNeeded() {
        guard data.settings.envelopeRollover else { return }
        let prev = Period.shift(currentBounds, by: -1, config: periodConfig, tz: tz)
        let next = BudgetRules.applyEnvelopeRollover(data.settings, transactions: data.transactions, prevBounds: prev)
        guard next != data.settings else { return }
        mutate { $0.settings = next }
    }

    // ── History ──────────────────────────────────────────────────────
    func updatePayment(_ payment: Payment, amount: Double, date: Date, note: String) {
        let iso = isoDay(date)
        let mk = DateLogic.monthKey(date, tz: tz)
        mutate { data in
            guard let i = data.payments.firstIndex(where: { $0.id == payment.id }) else { return }
            let oldAmt = data.payments[i].amount
            data.payments[i].amount = amount
            data.payments[i].date = iso
            data.payments[i].monthKey = mk
            data.payments[i].note = note
            if payment.type == "card", oldAmt != amount {
                Self.applyCardPaymentDelta(payment.refId, amount - oldAmt, in: &data)
            }
        }
    }

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
    /// A new unique *string* id for bills/cards/accounts/goals, matching the
    /// web's `genId()` format. Ids must be strings so records round-trip across
    /// platforms — a 64-bit timestamp id overflows Android's 32-bit Int, and
    /// the web mints non-numeric string ids that aren't parseable as Int.
    static func newID() -> String { newPaymentID() }

    /// A new unique *string* id for payments, matching the web's format
    /// (`Date.now().toString(36) + Math.random().toString(36)`). Keeping the
    /// id a string avoids collisions when web-created payments (string ids)
    /// are decoded natively.
    static func newPaymentID() -> String {
        let ts = String(Int(Date().timeIntervalSince1970 * 1000), radix: 36)
        let rand = String(UInt32.random(in: 0 ..< .max), radix: 36)
        return ts + rand
    }

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
        data.bills.sorted { BillSchedule.daysUntilDue($0, tz: tz) < BillSchedule.daysUntilDue($1, tz: tz) }
    }

    var sortedCards: [Card] {
        data.cards.sorted { $0.balance > $1.balance }
    }
}
