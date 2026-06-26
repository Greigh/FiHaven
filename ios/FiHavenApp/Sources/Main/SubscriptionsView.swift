import SwiftUI
import FiHavenCore

/// Subscription finder (Rocket-Money style): bills flagged as Subscriptions,
/// plus merchants that recur across ≥2 months. Flags price increases, stale
/// subs, duplicates, trials, and cancel/manage links.
struct SubscriptionsView: View {
    @EnvironmentObject var store: AppStore

    private var subscriptions: [SubscriptionsFinder.Item] {
        SubscriptionsFinder.build(
            bills: store.data.bills,
            transactions: store.data.transactions,
            tz: store.tz
        )
    }

    private var totalMonthly: Double { subscriptions.reduce(0) { $0 + $1.monthly } }

    var body: some View {
        List {
            if subscriptions.isEmpty {
                VStack(spacing: 8) {
                    Text("🔁").font(.system(size: 40))
                    Text("No subscriptions detected yet")
                        .font(Theme.ui(17, weight: .semibold)).foregroundStyle(Theme.text)
                    Text("Flag a bill as a Subscription, or log transactions — any merchant that recurs across 2+ months shows up here.")
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
                            HStack(alignment: .top, spacing: 10) {
                                Text(s.source == "bill" ? "📄" : "🔁").font(.system(size: 15))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(s.name).font(Theme.ui(14, weight: .medium)).foregroundStyle(Theme.text)
                                    Text(subDetail(s))
                                        .font(Theme.ui(11))
                                        .foregroundStyle(subDetailColor(s))
                                    if let url = s.manageUrl, let link = URL(string: url) {
                                        Link("Manage / cancel ↗", destination: link)
                                            .font(Theme.ui(11))
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

    private func subDetail(_ s: SubscriptionsFinder.Item) -> String {
        if s.duplicate { return "⚡ possible duplicate" }
        if s.trialSoon, let d = s.trialDaysLeft { return "⏳ trial ends in \(d)d" }
        if let d = s.trialDaysLeft, d < 0 { return "Trial ended" }
        if let up = s.priceUp { return "▲ was \(Money.fmt(up))" }
        if s.stale { return "⚠ unused 60d+" }
        if let next = s.nextDue { return "Next: \(subFriendlyDate(next))" }
        return s.source == "bill" ? "Tracked bill" : "Recurring charge"
    }

    private func subDetailColor(_ s: SubscriptionsFinder.Item) -> Color {
        if s.duplicate || s.priceUp != nil { return Theme.orange }
        if s.trialSoon { return Theme.accent }
        if s.stale { return Theme.red }
        return Theme.muted
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
