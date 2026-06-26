import SwiftUI
import FiHavenCore

/// Subscription finder (Rocket-Money style): bills flagged as Subscriptions,
/// plus merchants that recur across ≥2 months. Flags price increases, stale
/// subs, duplicates, trials, and cancel/manage links.
struct SubscriptionsView: View {
    @EnvironmentObject var store: AppStore

    private struct SubStatus {
        let icon: String
        let text: String
        let tone: A11y.MoneyTone
    }

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
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .font(.system(size: 36))
                        .foregroundStyle(Theme.accent)
                        .accessibilityHidden(true)
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
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Total \(Money.fmt(totalMonthly)) per month across \(subscriptions.count) subscriptions")
                    VStack(spacing: 0) {
                        ForEach(Array(subscriptions.enumerated()), id: \.element.id) { i, s in
                            if i > 0 { Divider().overlay(Theme.border) }
                            subscriptionRow(s)
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

    private func subscriptionRow(_ s: SubscriptionsFinder.Item) -> some View {
        let status = subStatus(s)
        return HStack(alignment: .top, spacing: 10) {
            Image(systemName: s.source == "bill" ? "doc.text" : "arrow.triangle.2.circlepath")
                .font(.system(size: 15))
                .foregroundStyle(Theme.accent)
                .frame(width: 20)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(s.name).font(Theme.ui(14, weight: .medium)).foregroundStyle(Theme.text)
                SubscriptionStatusBadge(icon: status.icon, text: status.text, tone: status.tone)
                if let url = s.manageUrl, let link = URL(string: url) {
                    Link("Manage or cancel", destination: link)
                        .font(Theme.ui(11))
                }
            }
            Spacer()
            Text("\(Money.fmt(s.monthly))/mo").font(Theme.mono(13)).foregroundStyle(Theme.text)
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(rowAccessibilityLabel(s, status: status))
        .accessibilityHint(s.manageUrl != nil ? "Includes a manage or cancel link" : "")
    }

    private func rowAccessibilityLabel(_ s: SubscriptionsFinder.Item, status: SubStatus) -> String {
        var parts = ["\(s.name), \(Money.fmt(s.monthly)) per month", status.text]
        if let next = s.nextDue, status.text.hasPrefix("Next:") == false && !s.duplicate && s.priceUp == nil && !s.stale && !s.trialSoon {
            parts.append("Next due \(subFriendlyDate(next))")
        }
        return parts.joined(separator: ". ")
    }

    private func subStatus(_ s: SubscriptionsFinder.Item) -> SubStatus {
        if s.duplicate {
            return SubStatus(icon: A11y.subscriptionStatusIcon("duplicate"), text: "Possible duplicate", tone: .warning)
        }
        if s.trialSoon, let d = s.trialDaysLeft {
            return SubStatus(icon: A11y.subscriptionStatusIcon("trial"), text: "Trial ends in \(d) days", tone: .accent)
        }
        if let d = s.trialDaysLeft, d < 0 {
            return SubStatus(icon: A11y.subscriptionStatusIcon("trial"), text: "Trial ended", tone: .neutral)
        }
        if let up = s.priceUp {
            return SubStatus(icon: A11y.subscriptionStatusIcon("priceUp"), text: "Price increased from \(Money.fmt(up))", tone: .warning)
        }
        if s.stale {
            return SubStatus(icon: A11y.subscriptionStatusIcon("stale"), text: "Unused 60+ days", tone: .warning)
        }
        if let next = s.nextDue {
            return SubStatus(icon: "calendar", text: "Next: \(subFriendlyDate(next))", tone: .neutral)
        }
        let fallback = s.source == "bill" ? "Tracked bill" : "Recurring charge"
        return SubStatus(icon: "info.circle", text: fallback, tone: .neutral)
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
