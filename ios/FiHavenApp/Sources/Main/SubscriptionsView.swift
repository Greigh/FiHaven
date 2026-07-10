import SwiftUI
import FiHavenCore

/// Subscription finder (Rocket-Money style): bills flagged as Subscriptions,
/// plus merchants that recur across ≥2 months. Flags price increases, stale
/// subs, duplicates, trials, and cancel/manage links.
struct SubscriptionsView: View {
    @EnvironmentObject var store: AppStore
    @State private var editingBill: Bill?
    @State private var linking: SubscriptionsFinder.Item?

    private struct SubStatus {
        let icon: String
        let text: String
        let tone: A11y.MoneyTone
    }

    /// The tracked bill behind a detected subscription, if there is one.
    private func bill(for item: SubscriptionsFinder.Item) -> Bill? {
        guard let id = item.billId else { return nil }
        return store.data.bills.first { $0.id == id }
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
        .sheet(item: $editingBill) { bill in BillEditorView(bill: bill) }
        .sheet(item: $linking) { item in
            ManageLinkSheet(item: item, bill: bill(for: item))
                .environmentObject(store)
        }
    }

    private func subscriptionRow(_ s: SubscriptionsFinder.Item) -> some View {
        let status = subStatus(s)
        return HStack(alignment: .top, spacing: 10) {
            Text(SubscriptionIcons.emoji(s.name, category: "Subscriptions"))
                .font(.system(size: 16))
                .frame(width: 22)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(s.name).font(Theme.ui(14, weight: .medium)).foregroundStyle(Theme.text)
                SubscriptionStatusBadge(icon: status.icon, text: status.text, tone: status.tone)
                if let url = s.manageUrl, let link = URL(string: url) {
                    Link("Manage or cancel", destination: link)
                        .font(Theme.ui(11))
                }
                HStack(spacing: 14) {
                    if let b = bill(for: s) {
                        Button("Edit bill") { editingBill = b }
                            .font(Theme.ui(11))
                            .buttonStyle(.plain)
                            .foregroundStyle(Theme.accent)
                    }
                    Button(s.manageUrl == nil ? "Add manage link" : "Change manage link") { linking = s }
                        .font(Theme.ui(11))
                        .buttonStyle(.plain)
                        .foregroundStyle(Theme.accent)
                }
                .padding(.top, 2)
            }
            Spacer()
            Text("\(Money.fmt(s.monthly))/mo").font(Theme.mono(13)).foregroundStyle(Theme.text)
        }
        .padding(.vertical, 6)
        // The row carries its own buttons, so it must not collapse into a
        // single accessibility element — that would hide them from VoiceOver.
        .accessibilityElement(children: .contain)
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

/// Add or change a subscription's manage/cancel link. Mirrors the web's
/// `SubscriptionsPanel` link form: the URL is saved on the user's own bill
/// *and* offered to the shared database. The personal save is what matters,
/// so a failed share is reported but never blocks it.
private struct ManageLinkSheet: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss

    let item: SubscriptionsFinder.Item
    let bill: Bill?

    @State private var url: String = ""
    @State private var busy = false
    @State private var message: String?

    private var isValid: Bool {
        guard let u = URL(string: url.trimmingCharacters(in: .whitespaces)),
              let scheme = u.scheme?.lowercased(),
              u.host?.isEmpty == false
        else { return false }
        return scheme == "http" || scheme == "https"
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://…/account/subscriptions", text: $url)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Manage or cancel link for \(item.name)")
                } footer: {
                    Text(bill == nil
                        ? "Emails the service name, the link, and your email address to FiHaven so we can add it to the shared database. Optional — see our Privacy Policy."
                        : "Saved on your bill. Also emails the service name, the link, and your email address to FiHaven so we can add it to the shared database. Optional — see our Privacy Policy.")
                }
                if let message {
                    Section { Text(message).font(Theme.ui(13)).foregroundStyle(Theme.muted) }
                }
            }
            .navigationTitle("Manage link")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Saving…" : "Save") { Task { await submit() } }
                        .disabled(!isValid || busy)
                }
            }
            .onAppear { url = item.manageUrl ?? "" }
        }
    }

    private func submit() async {
        let trimmed = url.trimmingCharacters(in: .whitespaces)
        guard isValid else { return }
        busy = true
        message = nil

        // 1) The user's own bill — the part that must not be lost.
        if let bill { store.setBillManageUrl(billId: bill.id, url: trimmed) }

        // 2) Offer it to the shared database. Best effort.
        let shared = await store.shareSubscriptionLink(name: item.name, url: trimmed)
        busy = false

        if bill != nil {
            message = shared ? "Saved to your bill and shared — thanks!" : "Saved to your bill."
            dismiss()
        } else if shared {
            message = "Shared — thanks!"
            dismiss()
        } else {
            message = "Couldn’t send that just now. Please try again."
        }
    }
}
