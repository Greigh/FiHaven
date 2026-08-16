import SwiftUI
import FiHavenCore

/// Balances tab ("Account Balances" in More) — the home for `accounts`, the
/// assets you own, as opposed to the `cards` you owe.
///
/// Editing these used to live on Net Worth, which is now purely the
/// assets-minus-debts rollup. Manual-first as ever: a linked bank never writes
/// a balance on its own — with `plaidUpdateBalances` on, sync files proposals
/// the user Accepts or Declines here.
///
/// Mirrors the web `BalancesView.svelte`.
struct BalancesView: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var env: AppEnvironment
    @State private var editing: Account?
    @State private var creating = false

    /// What a linked bank last reported for an account, by Plaid account id.
    /// Empty for Free users, for anyone with no bank linked, and whenever the
    /// status call fails — in every one of those the rows simply read "Manual".
    struct BankFigure: Equatable {
        let label: String
        let balance: Double?
        /// The item's last sync. The figure is cached as of then, so it is
        /// always shown dated rather than as a live number.
        let asOf: Date?
    }
    @State private var bankFigures: [String: BankFigure] = [:]

    private static let types: [String: (label: String, icon: String)] = [
        "checking":   ("Checking", "🏦"),
        "savings":    ("Savings", "💰"),
        "investment": ("Investments", "📈"),
        "property":   ("Property", "🏠"),
        "cash":       ("Cash", "💵"),
        "other":      ("Other", "📦"),
    ]
    private func icon(_ t: String) -> String { Self.types[t]?.icon ?? "📦" }
    private func label(_ t: String) -> String { Self.types[t]?.label ?? "Other" }

    /// What you could actually reach this week. Property and investments are
    /// real money but not spendable money, so they're counted apart.
    private static let liquidTypes: Set<String> = ["checking", "savings", "cash"]
    private var liquid: Double {
        store.data.accounts.filter { Self.liquidTypes.contains($0.type) }
            .reduce(0) { $0 + $1.balance }
    }

    private var proposals: [AppStore.AccountBalanceProposal] { store.pendingAccountProposals() }

    var body: some View {
        List {
            summaryCard

            if !proposals.isEmpty {
                Section {
                    ForEach(proposals) { proposalRow($0) }
                } header: {
                    Text("Bank sync review")
                }
            }

            if store.data.accounts.isEmpty {
                HStack {
                    Spacer()
                    Text(store.loaded
                        ? "No accounts yet. Tap + to add checking, savings, investments, or property."
                        : "Loading…")
                        .font(Theme.ui(15))
                        .foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.center)
                    Spacer()
                }
                .ctCard()
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
            } else {
                ForEach(store.data.accounts) { account in
                    accountRow(account)
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                store.deleteAccount(account)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                            Button {
                                editing = account
                            } label: {
                                Label("Edit", systemImage: "pencil")
                            }
                            .tint(Theme.accent)
                        }
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 5, leading: 16, bottom: 5, trailing: 16))
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.bg.ignoresSafeArea())
        .brandedNavigationBar("Balances")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { creating = true } label: { Image(systemName: "plus") }
                    .accessibilityIconButton("Add account")
            }
        }
        .sheet(isPresented: $creating) { AccountEditorView(account: nil) }
        .sheet(item: $editing) { account in AccountEditorView(account: account) }
        .task { await loadBankFigures() }
    }

    /// Depository/investment accounts across every linked bank. The mirror of
    /// CardEditorView.loadBankAccounts, which wants the credit lines instead.
    /// Failures are silent — the rows just fall back to "Manual".
    private func loadBankFigures() async {
        guard let status = try? await env.api.plaidStatus() else { return }
        var out: [String: BankFigure] = [:]
        for item in status.items {
            // Epoch milliseconds from the server's INTEGER column.
            let asOf = item.lastSyncAt.map { Date(timeIntervalSince1970: $0 / 1000) }
            for a in item.accounts
            where ["depository", "investment", "brokerage"].contains((a.type ?? "").lowercased()) {
                var label = item.institutionName
                if let n = a.name, !n.isEmpty { label += " · " + n }
                if let m = a.mask, !m.isEmpty { label += " ····" + m }
                out[a.accountId] = BankFigure(label: label, balance: a.currentBalance, asOf: asOf)
            }
        }
        bankFigures = out
    }

    private func bankFigure(for account: Account) -> BankFigure? {
        guard let pid = account.plaidAccountId, !pid.isEmpty, pid != Account.noPlaidLink
        else { return nil }
        return bankFigures[pid]
    }

    private static let asOfFmt: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        return f
    }()

    // ── Total + liquid split ─────────────────────────────────────────
    private var summaryCard: some View {
        let total = store.assets
        return VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 3) {
                FieldLabel(text: "Total balances")
                Text(Money.fmt(total))
                    .font(Theme.mono(28, weight: .bold))
                    .foregroundStyle(total >= 0 ? Theme.green : Theme.red)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
            }
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Liquid").font(Theme.ui(11)).foregroundStyle(Theme.muted)
                    Text(Money.fmt(liquid))
                        .font(Theme.mono(15, weight: .medium))
                        .foregroundStyle(Theme.text)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("Other assets").font(Theme.ui(11)).foregroundStyle(Theme.muted)
                    Text(Money.fmt(total - liquid))
                        .font(Theme.mono(15, weight: .medium))
                        .foregroundStyle(Theme.text)
                }
            }
        }
        .ctCard(branded: true)
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 6, trailing: 16))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Total balances \(Money.fmt(total)), liquid \(Money.fmt(liquid))")
    }

    private func proposalRow(_ p: AppStore.AccountBalanceProposal) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(p.name)
                .font(Theme.ui(15, weight: .semibold))
                .foregroundStyle(Theme.text)
            HStack(spacing: 6) {
                Text(p.currentBalance.map { Money.fmt($0) } ?? "—")
                    .font(Theme.mono(14))
                    .foregroundStyle(Theme.muted)
                Image(systemName: "arrow.right")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.muted)
                Text(Money.fmt(p.proposedBalance))
                    .font(Theme.mono(14, weight: .semibold))
                    .foregroundStyle(rose(p) ? Theme.green : Theme.red)
            }
            Text("Your bank reports a different balance. Accepting replaces the saved figure.")
                .font(Theme.ui(12))
                .foregroundStyle(Theme.muted)
            HStack(spacing: 8) {
                Button("Accept") { store.acceptAccountProposal(p) }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                Button("Decline") { store.declineAccountProposal(p) }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            }
            // A List row's default behaviour is to fire the row's action for a
            // tap anywhere in it; without this both buttons trigger together.
            .buttonStyle(.borderless)
        }
        .ctCard()
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 5, leading: 16, bottom: 5, trailing: 16))
    }

    /// True when accepting would move the balance up — green for more money in
    /// an asset account, which is the opposite of the card review's colouring.
    private func rose(_ p: AppStore.AccountBalanceProposal) -> Bool {
        guard let current = p.currentBalance else { return true }
        return p.proposedBalance >= current
    }

    private func accountRow(_ account: Account) -> some View {
        let bank = bankFigure(for: account)
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 12) {
                Text(icon(account.type)).font(.system(size: 18))
                VStack(alignment: .leading, spacing: 2) {
                    Text(account.name.isEmpty ? label(account.type) : account.name)
                        .font(Theme.ui(15, weight: .semibold))
                        .foregroundStyle(Theme.text)
                    HStack(spacing: 4) {
                        Text(label(account.type))
                            .font(Theme.ui(12))
                            .foregroundStyle(Theme.muted)
                        // The 🏦 marks a row a bank is following, matching how
                        // bank-sourced transactions are marked on Spending.
                        if let pid = account.plaidAccountId, !pid.isEmpty, pid != Account.noPlaidLink {
                            Text("🏦").font(.system(size: 10))
                        }
                    }
                }
                Spacer()
                Text(Money.fmt(account.balance))
                    .font(Theme.mono(16, weight: .semibold))
                    .foregroundStyle(Theme.text)
            }
            // Dated, never presented as live: these come from /accounts/get,
            // whose balances are cached as of the item's last sync.
            if let bank, let figure = bank.balance {
                Text(bankLine(bank, figure))
                    .font(Theme.ui(11))
                    .foregroundStyle(Theme.muted)
            }
        }
        .ctCard()
        .contentShape(Rectangle())
        .onTapGesture { editing = account }
        .accessibilityElement(children: .combine)
        .accessibilityHint("Double tap to edit")
    }

    private func bankLine(_ bank: BankFigure, _ figure: Double) -> String {
        var s = "Bank says \(Money.fmt(figure))"
        if let asOf = bank.asOf { s += " · as of \(Self.asOfFmt.string(from: asOf))" }
        return s
    }
}
