import SwiftUI
import FiHavenCore

/// Payment log, grouped by month (newest first). Long-press a row to edit or delete.
struct HistoryView: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var env: AppEnvironment
    @State private var editing: Payment?
    @State private var rangeChoice: IncomeRange = .m18

    private enum IncomeRange: Hashable {
        case m6, m12, m18, all
        var label: String {
            switch self {
            case .m6: return "6"
            case .m12: return "12"
            case .m18: return "18"
            case .all: return "All"
            }
        }
        func months(membership: Int) -> Int {
            switch self {
            case .m6: return min(6, membership)
            case .m12: return min(12, membership)
            case .m18: return min(18, membership)
            case .all: return membership
            }
        }
    }

    private var grouped: [(month: String, items: [Payment])] {
        let cfg = store.periodConfig
        return Dictionary(grouping: store.paymentsByDateDesc.filter { !$0.skipped },
                          by: { Period.keyForPayment($0, config: cfg, tz: store.tz) })
            .map { ($0.key, $0.value) }
            .sorted { $0.0 > $1.0 }
    }

    private struct IncomeMonth: Identifiable {
        let id: String
        let label: String
        let total: Double
        let bonus: Double
    }

    private var membershipMonths: Int {
        guard let created = env.currentUser?.createdAt else { return 18 }
        let startMs = created > 1e12 ? created : created * 1000
        let start = Date(timeIntervalSince1970: startMs / 1000)
        let cal = DateLogic.calendar(tz: store.tz)
        var d = cal.date(from: cal.dateComponents([.year, .month], from: Date())) ?? Date()
        let startMonth = cal.date(from: cal.dateComponents([.year, .month], from: start)) ?? start
        var n = 0
        while d >= startMonth, n < 240 {
            n += 1
            d = cal.date(byAdding: .month, value: -1, to: d) ?? d
        }
        return max(1, n)
    }

    private var visibleRanges: [IncomeRange] {
        let m = membershipMonths
        return [IncomeRange.m6, .m12, .m18, .all].filter {
            switch $0 {
            case .all: return true
            case .m6: return m >= 6
            case .m12: return m >= 12
            case .m18: return m >= 18
            }
        }
    }

    private var incomeMonths: [IncomeMonth] {
        let cal = DateLogic.calendar(tz: store.tz)
        var d = Date()
        var out: [IncomeMonth] = []
        let count = rangeChoice.months(membership: membershipMonths)
        for _ in 0..<count {
            let mk = DateLogic.monthKey(d, tz: store.tz)
            let total = Income.monthlyIncome(from: store.data.settings, monthKey: mk)
            let bonus = Income.adjustments(from: store.data.settings, monthKey: mk)
                .reduce(0.0) { $0 + max(0, $1.amount) }
            out.append(IncomeMonth(id: mk, label: DateLogic.monthKeyLabel(mk, tz: store.tz), total: total, bonus: bonus))
            d = cal.date(byAdding: .month, value: -1, to: d) ?? d
        }
        return out
    }
    private var baseIncome: Double { Income.monthlyIncome(from: store.data.settings) }
    private var avgIncome: Double {
        let m = incomeMonths
        return m.isEmpty ? 0 : m.reduce(0) { $0 + $1.total } / Double(m.count)
    }
    private var totalBonus: Double { incomeMonths.reduce(0) { $0 + $1.bonus } }

    // ── Merged income-vs-spending series ─────────────────────────────
    // Its window self-clamps to months with a real outflow record, so it can be
    // shorter than the picker's range.
    private var cashflow: CashflowHistory.Series {
        CashflowHistory.series(
            settings: store.data.settings,
            payments: store.data.payments,
            transactions: store.data.transactions,
            months: rangeChoice.months(membership: membershipMonths),
            from: DateLogic.currentMonthKey(tz: store.tz),
            tz: store.tz
        )
    }
    /// Averages run over ACCOUNTED months only. A blind month carries spending 0,
    /// and folding that in would quietly understate spending and inflate net —
    /// the same fabricated zero the chart refuses to draw.
    private func accounted(_ s: CashflowHistory.Series) -> [CashflowHistory.Row] {
        s.rows.filter { !$0.blind }
    }

    /// The honesty caption: income here is projected, not measured, and card
    /// payments are transfers rather than spending.
    private func cashflowNote(_ s: CashflowHistory.Series) -> String {
        var note = "Income is projected from your current setup, not recorded month by month — "
            + "a raise today reshapes every month shown here. Card payments are left out of "
            + "spending: they settle purchases already counted, so adding them would double-count."
        if s.blindMonths > 0 {
            note += " \(s.blindMonths) month\(s.blindMonths == 1 ? "" : "s") can't be accounted for, "
                + "so the spending line breaks there instead of plotting a zero."
        }
        return note
    }

    /// Table view for the chart — same figures, exact and screen-readable.
    @ViewBuilder private func cashflowTable(_ s: CashflowHistory.Series) -> some View {
        VStack(spacing: 6) {
            HStack(spacing: 8) {
                Text("Month").frame(maxWidth: .infinity, alignment: .leading)
                Text("Income").frame(width: 78, alignment: .trailing)
                Text("Spending").frame(width: 84, alignment: .trailing)
                Text("Net").frame(width: 78, alignment: .trailing)
            }
            .font(Theme.ui(10, weight: .semibold))
            .foregroundStyle(Theme.muted)
            Divider().overlay(Theme.border)

            // Newest-first for the table; the chart itself reads oldest → newest.
            ForEach(Array(s.rows.reversed()), id: \.mk) { r in
                HStack(spacing: 8) {
                    Text(DateLogic.monthKeyLabel(r.mk, tz: store.tz))
                        .font(Theme.ui(12))
                        .foregroundStyle(r.blind ? Theme.muted.opacity(0.75) : Theme.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(Money.fmt(r.income))
                        .font(Theme.mono(12, weight: .semibold))
                        .foregroundStyle(Theme.text)
                        .frame(width: 78, alignment: .trailing)
                    Text(r.blind ? "not recorded" : Money.fmt(r.spending))
                        .font(r.blind ? Theme.ui(10) : Theme.mono(12, weight: .semibold))
                        .foregroundStyle(r.blind ? Theme.muted : Theme.text)
                        .frame(width: 84, alignment: .trailing)
                    Text(r.blind ? "—" : (r.net >= 0 ? "+" : "") + Money.fmt(r.net))
                        .font(r.blind ? Theme.ui(10) : Theme.mono(12, weight: .semibold))
                        .foregroundStyle(r.blind ? Theme.muted : (r.net >= 0 ? Theme.green : Theme.red))
                        .frame(width: 78, alignment: .trailing)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }

    @ViewBuilder private var incomeHistorySection: some View {
        let months = incomeMonths
        if baseIncome > 0 || months.contains(where: { $0.total > 0 }) {
            let maxTotal = max(1, months.map(\.total).max() ?? 1)
            let cf = cashflow
            let hasCashflow = !cf.rows.isEmpty
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(hasCashflow ? "Income & spending" : "Income history")
                        .font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.muted)
                    Spacer()
                    if visibleRanges.count > 1 {
                        Picker("Range", selection: $rangeChoice) {
                            ForEach(visibleRanges, id: \.self) { r in
                                Text(r.label).tag(r)
                            }
                        }
                        .pickerStyle(.segmented)
                        .frame(maxWidth: 220)
                    }
                }
                VStack(alignment: .leading, spacing: 12) {
                    if hasCashflow {
                        let acc = accounted(cf)
                        let avgNet = acc.isEmpty ? 0 : acc.reduce(0) { $0 + $1.net } / Double(acc.count)
                        let avgSpend = acc.isEmpty ? 0 : acc.reduce(0) { $0 + $1.spending } / Double(acc.count)
                        HStack(alignment: .top, spacing: 24) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Avg net / mo").font(Theme.ui(11)).foregroundStyle(Theme.muted)
                                Text((avgNet >= 0 ? "+" : "") + Money.fmt(avgNet))
                                    .font(Theme.mono(20, weight: .semibold))
                                    .foregroundStyle(avgNet >= 0 ? Theme.green : Theme.red)
                                Text("over \(acc.count) recorded mo").font(Theme.ui(11)).foregroundStyle(Theme.muted)
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Avg income").font(Theme.ui(11)).foregroundStyle(Theme.muted)
                                Text(Money.fmt(avgIncome)).font(Theme.mono(20, weight: .semibold)).foregroundStyle(Theme.text)
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Avg spending").font(Theme.ui(11)).foregroundStyle(Theme.muted)
                                Text(Money.fmt(avgSpend)).font(Theme.mono(20, weight: .semibold)).foregroundStyle(Theme.text)
                            }
                        }
                        CashflowChartView(rows: cf.rows)
                        Text(cashflowNote(cf))
                            .font(Theme.ui(11))
                            .foregroundStyle(Theme.muted)
                            .fixedSize(horizontal: false, vertical: true)
                        cashflowTable(cf)
                    } else {
                        HStack(alignment: .top, spacing: 24) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Avg / mo (incl. bonuses)").font(Theme.ui(11)).foregroundStyle(Theme.muted)
                                Text(Money.fmt(avgIncome)).font(Theme.mono(20, weight: .semibold)).foregroundStyle(Theme.text)
                                Text("last \(months.count) mo").font(Theme.ui(11)).foregroundStyle(Theme.muted)
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Recurring / mo").font(Theme.ui(11)).foregroundStyle(Theme.muted)
                                Text(Money.fmt(baseIncome)).font(Theme.mono(20, weight: .semibold)).foregroundStyle(Theme.text)
                            }
                            if totalBonus > 0 {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Bonuses").font(Theme.ui(11)).foregroundStyle(Theme.muted)
                                    Text(Money.fmt(totalBonus)).font(Theme.mono(20, weight: .semibold)).foregroundStyle(Theme.green)
                                }
                            }
                        }
                    }
                    ForEach(hasCashflow ? [] : months) { m in
                        HStack(spacing: 10) {
                            Text(m.label)
                                .font(Theme.ui(12))
                                .foregroundStyle(Theme.muted)
                                .frame(width: 74, alignment: .leading)
                            GeometryReader { geo in
                                ZStack(alignment: .leading) {
                                    Capsule().fill(Theme.surface2).frame(height: 4)
                                    Capsule()
                                        .fill(Theme.accent.opacity(0.7))
                                        .frame(width: geo.size.width * (m.total / maxTotal), height: 4)
                                }
                            }
                            .frame(height: 4)
                            Text(Money.fmt(m.total))
                                .font(Theme.mono(13, weight: .semibold))
                                .foregroundStyle(Theme.text)
                                .frame(width: 84, alignment: .trailing)
                            Text(m.bonus > 0 ? "+\(Money.fmt(m.bonus))" : "")
                                .font(Theme.ui(11))
                                .foregroundStyle(Theme.green)
                                .frame(width: 70, alignment: .trailing)
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("\(m.label), \(Money.fmt(m.total))")
                    }
                }
                .ctCard()
            }
            .onAppear {
                if membershipMonths < 18, rangeChoice == .m18 {
                    rangeChoice = membershipMonths >= 12 ? .m12 : (membershipMonths >= 6 ? .m6 : .all)
                }
            }
        }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                incomeHistorySection
                if grouped.isEmpty {
                    Text(store.loaded ? "No payments recorded yet." : "Loading…")
                        .font(Theme.ui(15)).foregroundStyle(Theme.muted).ctCard()
                }
                ForEach(grouped, id: \.month) { group in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(Period.labelForKey(group.month, config: store.periodConfig, tz: store.tz))
                            .font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.muted)
                        VStack(spacing: 0) {
                            ForEach(Array(group.items.enumerated()), id: \.element.id) { i, p in
                                if i > 0 { Divider().overlay(Theme.border) }
                                row(p)
                            }
                        }
                        .ctCard(padding: 0)
                    }
                }
            }
            .padding()
        }
        .background(Theme.bg.ignoresSafeArea())
        .brandedNavigationBar("History")
        .sheet(item: $editing) { p in EditPaymentView(payment: p) }
    }

    private func row(_ p: Payment) -> some View {
        HStack(spacing: 12) {
            Text(p.type == "card" ? CTConstants.cardIcon : "🧾").font(.system(size: 18))
            VStack(alignment: .leading, spacing: 2) {
                Text(p.name.isEmpty ? p.type.capitalized : p.name)
                    .font(Theme.ui(15, weight: .medium)).foregroundStyle(Theme.text)
                    .lineLimit(1)
                Text(prettyDate(p.date)).font(Theme.ui(12)).foregroundStyle(Theme.muted)
                if !p.note.isEmpty {
                    Text(p.note).font(Theme.ui(11)).foregroundStyle(Theme.muted).lineLimit(1)
                }
            }
            Spacer()
            HStack(spacing: 4) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(Theme.green)
                Text(Money.fmt(p.amount)).font(Theme.mono(15, weight: .medium)).foregroundStyle(Theme.text)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(p.name.isEmpty ? p.type.capitalized : p.name), paid \(Money.fmt(p.amount)), \(prettyDate(p.date))")
        .contextMenu {
            Button { editing = p } label: {
                Label("Edit", systemImage: "pencil")
            }
            Button(role: .destructive) { store.deletePayment(p) } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    private func prettyDate(_ iso: String) -> String {
        guard let date = DateLogic.parseDate(iso, tz: store.tz) else { return iso }
        let f = DateFormatter()
        f.timeZone = store.tz
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = "EEE, MMM d, yyyy"
        return f.string(from: date)
    }
}
