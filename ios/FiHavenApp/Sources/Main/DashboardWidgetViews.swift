import SwiftUI
import FiHavenCore

// Compact dashboard widgets for the "Widgets" layout — parity with the web
// catalog. Each reads the store and renders nothing when it has no data.

/// This period's payments: paid vs. remaining, with a progress bar.
struct CashflowWidget: View {
    @EnvironmentObject var store: AppStore
    private var paid: Double {
        let b = store.currentBounds
        return store.data.payments
            .filter { !$0.skipped && $0.date >= b.startKey && $0.date < b.endKey }
            .reduce(0) { $0 + $1.amount }
    }
    private var remaining: Double { store.remainingThisMonth }
    private var budgeted: Double { paid + remaining }
    private var pct: Double { budgeted > 0 ? min(1, paid / budgeted) : 0 }

    @ViewBuilder var body: some View {
        if budgeted > 0 {
            VStack(alignment: .leading, spacing: 8) {
                FieldLabel(text: "This period's payments")
                HStack(spacing: 6) {
                    SemanticAmount(value: Money.fmt(paid), tone: .positive, font: Theme.ui(13))
                    Text("paid").foregroundStyle(Theme.muted)
                    Spacer()
                    Text("\(Int(pct * 100))%").foregroundStyle(Theme.muted)
                }
                .font(Theme.ui(13))
                ProgressView(value: pct).tint(Theme.accent)
                    .accessibilityLabel("Payment progress")
                    .accessibilityValue("\(Int(pct * 100)) percent paid")
                Text("\(Money.fmt(remaining)) remaining of \(Money.fmt(budgeted))")
                    .font(Theme.ui(12)).foregroundStyle(Theme.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .ctCard()
        }
    }
}

/// 0% promo, credit utilization, and trial-ending alerts.
struct AlertsWidget: View {
    @EnvironmentObject var store: AppStore
    private var alerts: [String] {
        var out: [String] = []
        for c in store.activeCards where c.type != "loan" && c.limit > 0 {
            let util = Int((c.balance / c.limit) * 100)
            if util >= 80 {
                out.append("💳 \(c.name) — \(util)% credit utilization (\(Money.fmt(c.balance)) of \(Money.fmt(c.limit))).")
            }
        }
        for b in store.activeBills where !(b.trialEnds ?? "").isEmpty {
            if let left = trialDaysLeft(b.trialEnds, tz: store.tz), left >= 0, left <= 3 {
                let dayWord = left == 0 ? "today" : (left == 1 ? "tomorrow" : "in \(left) days")
                out.append("⏳ \(b.name) — free trial ends \(dayWord).")
            }
        }
        for c in store.activeCards where c.hasPromo && !(c.promoEndDate ?? "").isEmpty {
            let mo = DateLogic.monthsUntil(c.promoEndDate, tz: store.tz)
            let bal = c.promoBalance ?? c.balance
            let need = max(c.minPayment, Schedule.promoNeeded(c, tz: store.tz))
            if mo <= 0 && bal > 0 {
                out.append("🚨 \(c.name) — 0% promo expired. \(Money.fmt(bal)) is accruing \(Int(c.regularAPR))% APR.")
            } else if mo <= 2 {
                out.append("🔥 \(c.name) — 0% promo ends in ~\(mo) mo. Pay \(Money.fmt(need))/mo to avoid interest.")
            } else if mo <= 4 {
                out.append("⚠️ \(c.name) — 0% promo ends in ~\(mo) mo. Need \(Money.fmt(need))/mo to clear \(Money.fmt(bal)).")
            }
        }
        return out
    }

    private func trialDaysLeft(_ trialEnds: String?, tz: TimeZone) -> Int? {
        guard let raw = trialEnds,
              raw.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil,
              let end = DateLogic.parseDate(raw, tz: tz) else { return nil }
        let cal = DateLogic.calendar(tz: tz)
        let today = cal.startOfDay(for: Date())
        let endDay = cal.startOfDay(for: end)
        return cal.dateComponents([.day], from: today, to: endDay).day
    }

    @ViewBuilder var body: some View {
        if !alerts.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(alerts.enumerated()), id: \.offset) { _, a in
                    Text(a).font(Theme.ui(13)).foregroundStyle(Theme.text)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .ctCard()
                }
            }
        }
    }
}

/// Savings goals with progress bars.
struct GoalsWidget: View {
    @EnvironmentObject var store: AppStore
    @ViewBuilder var body: some View {
        if !store.data.goals.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                FieldLabel(text: "Savings goals")
                ForEach(store.data.goals) { g in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(g.name.isEmpty ? "Goal" : g.name)
                                .font(Theme.ui(14, weight: .medium)).foregroundStyle(Theme.text)
                            Spacer()
                            Text("\(Money.fmt(g.saved)) / \(Money.fmt(g.target))")
                                .font(Theme.mono(12)).foregroundStyle(Theme.muted)
                        }
                        ProgressView(value: g.progress).tint(Theme.accent)
                            .accessibilityLabel("\(g.name.isEmpty ? "Goal" : g.name) progress")
                            .accessibilityValue("\(Int(g.progress * 100)) percent saved")
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .ctCard()
        }
    }
}

/// Subscriptions: total monthly + the top recurring items.
struct SubscriptionsWidget: View {
    @EnvironmentObject var store: AppStore

    private func monthlyOfBill(_ b: Bill) -> Double {
        switch b.frequency {
        case "Weekly": return b.amount * 52 / 12
        case "Bi-weekly": return b.amount * 26 / 12
        case "Quarterly": return b.amount / 3
        case "Annually": return b.amount / 12
        default: return b.amount
        }
    }

    private var subs: [(name: String, monthly: Double)] {
        var out: [(String, Double)] = []
        for b in store.activeBills where b.category == "Subscriptions" && !DateLogic.billEnded(b, tz: store.tz) {
            out.append((b.name.isEmpty ? "Subscription" : b.name, monthlyOfBill(b)))
        }
        let withMerchant = store.data.transactions.filter { !$0.merchant.trimmingCharacters(in: .whitespaces).isEmpty }
        let byMerchant = Dictionary(grouping: withMerchant) { $0.merchant.trimmingCharacters(in: .whitespaces).lowercased() }
        for (_, list) in byMerchant {
            if Set(list.map { String($0.date.prefix(7)) }).count < 2 { continue }
            if let latest = list.sorted(by: { $0.date < $1.date }).last {
                out.append((latest.merchant, latest.amount))
            }
        }
        return out.sorted { $0.1 > $1.1 }
    }

    @ViewBuilder var body: some View {
        let list = subs
        if !list.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    FieldLabel(text: "Subscriptions")
                    Spacer()
                    Text("\(Money.fmt(list.reduce(0) { $0 + $1.monthly }))/mo")
                        .font(Theme.mono(13)).foregroundStyle(Theme.text)
                }
                ForEach(Array(list.prefix(5).enumerated()), id: \.offset) { _, s in
                    HStack {
                        Text(s.name).font(Theme.ui(13)).foregroundStyle(Theme.text).lineLimit(1)
                        Spacer()
                        Text("\(Money.fmt(s.monthly))/mo").font(Theme.mono(12)).foregroundStyle(Theme.muted)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .ctCard()
        }
    }
}

/// Budget / safe-to-spend headline from the active budget lens.
struct BudgetStatusWidget: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var billing: StoreManager

    private var lens: BudgetRules.Lens? {
        BudgetRules.lens(
            settings: store.data.settings,
            income: store.periodIncome,
            bills: store.activeBills,
            cards: store.activeCards,
            transactions: store.data.transactions,
            goals: store.data.goals,
            bounds: store.currentBounds,
            billDueInPeriod: { BillSchedule.dueInPeriod($0, bounds: store.currentBounds, tz: store.tz) },
            isPro: billing.isPro,
            tz: store.tz
        )
    }

    @ViewBuilder var body: some View {
        if let lens, let h = lens.headline {
            VStack(alignment: .leading, spacing: 6) {
                FieldLabel(text: lens.title)
                HStack {
                    Text(h.label).font(Theme.ui(13)).foregroundStyle(Theme.muted)
                    Spacer()
                    SemanticAmount(
                        value: Money.fmt(h.amount),
                        tone: A11y.MoneyTone.fromBudgetStatus(h.status),
                        font: Theme.mono(20, weight: .semibold),
                        statusWords: A11y.budgetStatusWords(h.status)
                    )
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .ctCard()
        } else if store.periodIncome > 0 {
            let obligations = store.activeBills
                .filter { BillSchedule.dueInPeriod($0, bounds: store.currentBounds, tz: store.tz) }
                .reduce(0) { $0 + $1.amount }
                + store.activeCards.reduce(0) { $0 + $1.minPayment }
            let cushion = store.periodIncome - obligations
            VStack(alignment: .leading, spacing: 6) {
                FieldLabel(text: "Cushion after bills")
                SemanticAmount(
                    value: Money.fmt(cushion),
                    tone: cushion >= 0 ? .positive : .negative,
                    font: Theme.mono(20, weight: .semibold),
                    statusWords: cushion >= 0 ? "Surplus" : "Shortfall"
                )
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .ctCard()
        }
    }
}

/// Income history: average monthly income (incl. bonuses) over the last 6 months.
struct IncomeHistoryWidget: View {
    @EnvironmentObject var store: AppStore

    private var months: [Double] {
        let cal = DateLogic.calendar(tz: store.tz)
        var d = Date()
        var out: [Double] = []
        for _ in 0..<6 {
            let mk = DateLogic.monthKey(d, tz: store.tz)
            out.append(Income.monthlyIncome(from: store.data.settings, monthKey: mk))
            d = cal.date(byAdding: .month, value: -1, to: d) ?? d
        }
        return out
    }
    private var base: Double { Income.monthlyIncome(from: store.data.settings) }
    private var avg: Double { months.isEmpty ? 0 : months.reduce(0, +) / Double(months.count) }

    @ViewBuilder var body: some View {
        if base > 0 || months.contains(where: { $0 > 0 }) {
            VStack(alignment: .leading, spacing: 6) {
                FieldLabel(text: "Income history")
                Text(Money.fmt(avg)).font(Theme.mono(20, weight: .semibold)).foregroundStyle(Theme.text)
                Text("Avg / mo incl. bonuses · last 6 months").font(Theme.ui(12)).foregroundStyle(Theme.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .ctCard()
        }
    }
}
