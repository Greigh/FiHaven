import SwiftUI
import FiHavenCore

/// Subscription finder (Rocket-Money style): bills flagged as Subscriptions,
/// plus merchants that recur across ≥2 months in transactions. Flags price
/// increases and stale (long-unused) subscriptions. Its own Pro tab.
struct SubscriptionsView: View {
    @EnvironmentObject var store: AppStore

    private struct Sub: Identifiable {
        let id: String; let name: String; let monthly: Double
        let source: String; let priceUp: Double?; let stale: Bool
        let nextDue: Date?
    }

    private func monthlyOfBill(_ b: Bill) -> Double {
        switch b.frequency {
        case "Weekly": return b.amount * 52 / 12
        case "Bi-weekly": return b.amount * 26 / 12
        case "Quarterly": return b.amount / 3
        case "Annually": return b.amount / 12
        default: return b.amount
        }
    }
    private func daysSince(_ iso: String) -> Int? {
        guard let d = DateLogic.parseDate(iso, tz: store.tz) else { return nil }
        return Calendar.current.dateComponents([.day], from: d, to: Date()).day
    }

    private var subscriptions: [Sub] {
        var out: [Sub] = []
        for b in store.data.bills where b.category == "Subscriptions" && !DateLogic.billEnded(b, tz: store.tz) {
            out.append(Sub(id: "bill-\(b.id)", name: b.name.isEmpty ? "Subscription" : b.name,
                           monthly: monthlyOfBill(b), source: "bill", priceUp: nil, stale: false,
                           nextDue: BillSchedule.nextDueDate(b, tz: store.tz)))
        }
        let withMerchant = store.data.transactions.filter { !$0.merchant.trimmingCharacters(in: .whitespaces).isEmpty }
        let byMerchant = Dictionary(grouping: withMerchant) { $0.merchant.trimmingCharacters(in: .whitespaces).lowercased() }
        for (_, list) in byMerchant {
            if Set(list.map { String($0.date.prefix(7)) }).count < 2 { continue }
            let sorted = list.sorted { $0.date < $1.date }
            guard let latest = sorted.last else { continue }
            let minAmt = list.map { $0.amount }.min() ?? 0
            out.append(Sub(id: "tx-\(latest.merchant)", name: latest.merchant, monthly: latest.amount,
                           source: "tx", priceUp: latest.amount > minAmt + 0.005 ? minAmt : nil,
                           stale: (daysSince(latest.date) ?? 0) > 60, nextDue: nil))
        }
        return out.sorted { $0.monthly > $1.monthly }
    }

    private var totalMonthly: Double { subscriptions.reduce(0) { $0 + $1.monthly } }

    var body: some View {
        List {
            if subscriptions.isEmpty {
                VStack(spacing: 8) {
                    Text("🔁").font(.system(size: 40))
                    Text("No subscriptions detected yet")
                        .font(Theme.ui(17, weight: .semibold)).foregroundStyle(Theme.text)
                    Text("Flag a bill as a Subscription, or log transactions — any merchant that recurs across 2+ months shows up here, with price-increase and stale-subscription flags.")
                        .font(Theme.ui(13)).foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 24)
                .ctCard()
                .listRowBackground(Color.clear).listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        FieldLabel(text: "Subscriptions")
                        Spacer()
                        Text("\(Money.fmt(totalMonthly))/mo · \(subscriptions.count)")
                            .font(Theme.mono(12)).foregroundStyle(Theme.muted)
                    }
                    VStack(spacing: 0) {
                        ForEach(Array(subscriptions.enumerated()), id: \.element.id) { i, s in
                            if i > 0 { Divider().overlay(Theme.border) }
                            HStack(spacing: 10) {
                                Text(s.source == "bill" ? "📄" : "🔁").font(.system(size: 15))
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(s.name).font(Theme.ui(14, weight: .medium)).foregroundStyle(Theme.text)
                                    HStack(spacing: 6) {
                                        if let up = s.priceUp {
                                            Text("▲ was \(Money.fmt(up))").font(Theme.ui(11)).foregroundStyle(Theme.orange)
                                        }
                                        if s.stale { Text("⚠ unused 60d+").font(Theme.ui(11)).foregroundStyle(Theme.red) }
                                        if s.priceUp == nil && !s.stale {
                                            if let next = s.nextDue {
                                                Text("Next: \(subFriendlyDate(next))")
                                                    .font(Theme.ui(11)).foregroundStyle(Theme.muted)
                                            } else {
                                                Text(s.source == "bill" ? "Tracked bill" : "Recurring charge")
                                                    .font(Theme.ui(11)).foregroundStyle(Theme.muted)
                                            }
                                        }
                                    }
                                }
                                Spacer()
                                Text("\(Money.fmt(s.monthly))/mo").font(Theme.mono(13)).foregroundStyle(Theme.text)
                            }
                            .padding(.vertical, 6)
                        }
                    }
                    .ctCard()
                }
                .listRowBackground(Color.clear).listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 4, trailing: 16))
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.bg.ignoresSafeArea())
        .brandedNavigationBar("Subscriptions")
    }

    private func subFriendlyDate(_ date: Date) -> String {
        let f = DateFormatter()
        f.calendar = DateLogic.calendar(tz: store.tz)
        f.timeZone = store.tz
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = Calendar.current.component(.year, from: date) == Calendar.current.component(.year, from: Date())
            ? "MMM d" : "MMM d, yyyy"
        return f.string(from: date)
    }
}
