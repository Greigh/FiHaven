import SwiftUI
import FiHavenCore

/// Subscription finder: tracked Subscription bills plus suggested recurring
/// merchants (Accept / Decline / Add). Totals count tracked only.
struct SubscriptionsView: View {
    @EnvironmentObject var store: AppStore
    @State private var editingBill: Bill?
    @State private var creatingFrom: SubscriptionsFinder.Item?
    @State private var linking: SubscriptionsFinder.Item?

    private struct SubStatus {
        let icon: String
        let text: String
        let tone: A11y.MoneyTone
    }

    private func bill(for item: SubscriptionsFinder.Item) -> Bill? {
        guard let id = item.billId else { return nil }
        return store.data.bills.first { $0.id == id }
    }

    private var allItems: [SubscriptionsFinder.Item] {
        SubscriptionsFinder.build(
            bills: store.data.bills,
            transactions: store.data.transactions,
            tz: store.tz,
            declined: store.data.settings.subscriptionDeclined
        )
    }

    private var tracked: [SubscriptionsFinder.Item] { allItems.filter { $0.source == "bill" } }
    private var candidates: [SubscriptionsFinder.Item] { allItems.filter { $0.source == "tx" } }
    private var inboxMode: Bool { store.data.settings.subscriptionDetectMode != "inline" }
    private var totalMonthly: Double { tracked.reduce(0) { $0 + $1.monthly } }

    var body: some View {
        List {
            if tracked.isEmpty && candidates.isEmpty {
                emptyState
            } else {
                header
                if inboxMode {
                    ForEach(tracked) { s in
                        subscriptionRow(s, candidate: false)
                            .listRowBackground(Color.clear).listRowSeparator(.hidden)
                            .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                    }
                    if !candidates.isEmpty {
                        Section {
                            ForEach(candidates) { s in
                                subscriptionRow(s, candidate: true)
                            }
                        } header: {
                            Text("Suggested from spending")
                        } footer: {
                            Text("Accept to track, Decline to hide, or Add to edit before saving.")
                        }
                    }
                } else {
                    ForEach(tracked) { s in
                        subscriptionRow(s, candidate: false)
                            .listRowBackground(Color.clear).listRowSeparator(.hidden)
                            .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                    }
                    ForEach(candidates) { s in
                        subscriptionRow(s, candidate: true)
                            .listRowBackground(Color.clear).listRowSeparator(.hidden)
                            .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.bg.ignoresSafeArea())
        .brandedNavigationBar("Subscriptions")
        .sheet(item: $editingBill) { bill in BillEditorView(bill: bill) }
        .sheet(item: $creatingFrom) { item in
            BillEditorView(bill: Bill(
                id: UUID().uuidString,
                name: item.name,
                category: "Subscriptions",
                amount: item.amount,
                dueDay: item.lastDate.flatMap { Int($0.suffix(2)) },
                frequency: "Monthly",
                business: item.name
            ))
        }
        .sheet(item: $linking) { item in
            ManageLinkSheet(item: item, bill: bill(for: item))
                .environmentObject(store)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "arrow.triangle.2.circlepath")
                .font(.system(size: 36))
                .foregroundStyle(Theme.accent)
                .accessibilityHidden(true)
            Text("No subscriptions yet")
                .font(Theme.ui(17, weight: .semibold)).foregroundStyle(Theme.text)
            Text("Flag a bill as a Subscription, or Accept a suggestion from recurring merchants.")
                .font(Theme.ui(13)).foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .ctCard()
        .listRowBackground(Color.clear).listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                FieldLabel(text: "Subscriptions")
                Spacer()
                Text("\(Money.fmt(totalMonthly))/mo · \(tracked.count) tracked")
                    .font(Theme.mono(12)).foregroundStyle(Theme.muted)
            }
        }
        .listRowBackground(Color.clear).listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 4, trailing: 16))
    }

    private func subscriptionRow(_ s: SubscriptionsFinder.Item, candidate: Bool) -> some View {
        let status = subStatus(s)
        return HStack(alignment: .top, spacing: 10) {
            Text(SubscriptionIcons.emoji(s.name, category: "Subscriptions"))
                .font(.system(size: 16))
                .frame(width: 22)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(s.name).font(Theme.ui(14, weight: .medium)).foregroundStyle(Theme.text)
                    if candidate {
                        Text("Suggested")
                            .font(Theme.ui(10, weight: .semibold))
                            .foregroundStyle(Theme.accent)
                    }
                }
                SubscriptionStatusBadge(icon: status.icon, text: status.text, tone: status.tone)
                if candidate {
                    HStack(spacing: 12) {
                        Button("Accept") {
                            store.acceptSubscriptionCandidate(name: s.name, amount: s.amount, lastDate: s.lastDate)
                        }
                        .font(Theme.ui(11, weight: .semibold))
                        Button("Decline") {
                            store.declineSubscriptionMerchant(s.merchantKey.isEmpty
                                ? SubscriptionLinks.normalizeKey(s.name) : s.merchantKey)
                        }
                        .font(Theme.ui(11))
                        Button("Add") { creatingFrom = s }
                            .font(Theme.ui(11))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Theme.accent)
                    .padding(.top, 2)
                } else {
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
            }
            Spacer()
            Text("\(Money.fmt(s.monthly))/mo").font(Theme.mono(13)).foregroundStyle(Theme.text)
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .contain)
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
/// `SubscriptionsPanel` link form.
private struct ManageLinkSheet: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss

    let item: SubscriptionsFinder.Item
    let bill: Bill?

    @State private var url: String = ""
    @State private var busy = false
    @State private var message: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://…/account/subscriptions", text: $url)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                } footer: {
                    Text(message ?? "Saves to your bill when linked, and can be shared with FiHaven.")
                }
            }
            .navigationTitle(item.manageUrl == nil ? "Add manage link" : "Change manage link")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }.disabled(busy || url.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear { url = item.manageUrl ?? "" }
        }
    }

    private func save() {
        let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.lowercased().hasPrefix("http") else {
            message = "Enter a full https:// link."
            return
        }
        busy = true
        if let bill { store.setBillManageUrl(billId: bill.id, url: trimmed) }
        busy = false
        dismiss()
    }
}
