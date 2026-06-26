import SwiftUI
import FiHavenCore

/// Payment log, grouped by month (newest first). Long-press a row to edit or delete.
struct HistoryView: View {
    @EnvironmentObject var store: AppStore
    @State private var editing: Payment?

    private var grouped: [(month: String, items: [Payment])] {
        let cfg = store.periodConfig
        return Dictionary(grouping: store.paymentsByDateDesc.filter { !$0.skipped },
                          by: { Period.keyForPayment($0, config: cfg, tz: store.tz) })
            .map { ($0.key, $0.value) }
            .sorted { $0.0 > $1.0 }
    }

    // ── Income history (last 12 months: base + that month's adjustments) ──
    private struct IncomeMonth: Identifiable { let id: String; let label: String; let total: Double; let bonus: Double }

    private var incomeMonths: [IncomeMonth] {
        let cal = DateLogic.calendar(tz: store.tz)
        var d = Date()
        var out: [IncomeMonth] = []
        for _ in 0..<12 {
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

    @ViewBuilder private var incomeHistorySection: some View {
        let months = incomeMonths
        if baseIncome > 0 || months.contains(where: { $0.total > 0 }) {
            let maxTotal = max(1, months.map(\.total).max() ?? 1)
            VStack(alignment: .leading, spacing: 10) {
                Text("Income history").font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.muted)
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .top, spacing: 24) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Avg / mo (incl. bonuses)").font(Theme.ui(11)).foregroundStyle(Theme.muted)
                            Text(Money.fmt(avgIncome)).font(Theme.mono(20, weight: .semibold)).foregroundStyle(Theme.text)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Recurring / mo").font(Theme.ui(11)).foregroundStyle(Theme.muted)
                            Text(Money.fmt(baseIncome)).font(Theme.mono(20, weight: .semibold)).foregroundStyle(Theme.text)
                        }
                    }
                    ForEach(months) { m in
                        ChartBarRow(
                            label: m.label,
                            value: Money.fmt(m.total),
                            fraction: m.total / maxTotal
                        )
                    }
                }
                .ctCard()
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
