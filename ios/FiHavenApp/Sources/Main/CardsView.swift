import SwiftUI
import FiHavenCore

/// Credit-card list with add / edit / delete. Shows balance, utilization,
/// and an active-promo badge.
struct CardsView: View {
    // kind == "loan" renders the Loans tab; default "card" renders Credit Cards.
    // Cards and loans share this view (and the editor) but live in separate tabs.
    var kind: String = "card"
    @EnvironmentObject var store: AppStore
    @State private var editing: Card?
    @State private var creating = false
    @State private var paying: PayTarget?
    @State private var sortKey = "due"
    @State private var showFilters = false
    @State private var fBalance = false
    @State private var fPromo = false
    @State private var fOverdue = false
    @State private var editingAccount: Account?
    @State private var creatingAccount = false

    private var isLoanView: Bool { kind == "loan" }
    private var baseCards: [Card] {
        store.sortedCards.filter { ((($0.type ?? "card") == "loan")) == isLoanView }
    }

    private var filterCount: Int {
        (fBalance ? 1 : 0) + (fPromo ? 1 : 0) + (fOverdue ? 1 : 0)
    }

    private func util(_ c: Card) -> Double { c.limit > 0 ? c.balance / c.limit : 0 }
    private func dueDays(_ c: Card) -> Int {
        c.dueDay.map { DateLogic.daysUntilDue(dueDay: $0, tz: store.tz) } ?? 9999
    }

    private var displayedCards: [Card] {
        var list = baseCards.filter { c in
            if fBalance && !(c.balance > 0) { return false }
            if fPromo && !(c.hasPromo && !(c.promoEndDate ?? "").isEmpty) { return false }
            if fOverdue && !(c.dueDay.map { DateLogic.daysUntilDue(dueDay: $0, tz: store.tz) < 0 } ?? false) { return false }
            return true
        }
        switch sortKey {
        case "balance": list.sort { $0.balance > $1.balance }
        case "apr":     list.sort { $0.regularAPR > $1.regularAPR }
        case "util":    list.sort { util($0) > util($1) }
        case "name":    list.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        case "promo":
            let pr: (Card) -> Int = { c in
                (c.hasPromo && !(c.promoEndDate ?? "").isEmpty) ? DateLogic.monthsUntil(c.promoEndDate, tz: store.tz) : 9999
            }
            list.sort { pr($0) < pr($1) }
        default: break // "due" — already due-sorted
        }
        return list
    }

    var body: some View {
        List {
            if !isLoanView {
                netWorthHeader
                ForEach(store.data.accounts) { acct in
                    accountRow(acct).onTapGesture { editingAccount = acct }
                        .listRowBackground(Color.clear).listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                }
                Button { creatingAccount = true } label: {
                    Label("Add account", systemImage: "plus.circle").font(Theme.ui(14, weight: .medium))
                }
                .listRowBackground(Color.clear).listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 2, leading: 18, bottom: 10, trailing: 16))
            }

            if baseCards.isEmpty {
                HStack {
                    Spacer()
                    Text(store.loaded
                        ? (isLoanView ? "No loans yet. Tap + to add one." : "No cards yet. Tap + to add one.")
                        : "Loading…")
                        .font(Theme.ui(15)).foregroundStyle(Theme.muted)
                    Spacer()
                }
                .ctCard()
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
            } else {
                ForEach(displayedCards) { card in
                    CardRow(
                        card: card,
                        tz: store.tz,
                        state: store.paidState(type: "card", refId: String(card.id)),
                        paidSoFar: store.paidAmount(type: "card", refId: String(card.id)),
                        goal: store.goalAmount(type: "card", refId: String(card.id)),
                        onPay: { paying = PayTarget(type: "card", refId: String(card.id), name: card.name) },
                        onEdit: { editing = card }
                    )
                    .swipeActions(edge: .leading) {
                        Button {
                            paying = PayTarget(type: "card", refId: String(card.id), name: card.name)
                        } label: {
                            Label("Pay", systemImage: "checkmark.circle.fill")
                        }
                        .tint(Theme.green)
                        let isFull = store.paidState(type: "card", refId: String(card.id)) == .full
                        Button {
                            store.setPaid(type: "card", refId: String(card.id), name: card.name,
                                          amount: store.goalAmount(type: "card", refId: String(card.id)), paid: !isFull)
                        } label: {
                            Label(isFull ? "Unmark" : "Mark paid",
                                  systemImage: isFull ? "arrow.uturn.backward" : "checkmark.seal.fill")
                        }
                        .tint(isFull ? Theme.muted : Theme.accent)
                    }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            store.deleteCard(card)
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                        Button {
                            editing = card
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
        .navigationTitle(isLoanView ? "Loans" : "Cards")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Picker("Sort", selection: $sortKey) {
                        Text("Due date").tag("due")
                        Text("Largest balance").tag("balance")
                        Text("Highest APR").tag("apr")
                        Text("Highest utilization").tag("util")
                        Text("0% promo first").tag("promo")
                        Text("Name (A–Z)").tag("name")
                    }
                } label: { Image(systemName: "arrow.up.arrow.down") }
            }
            ToolbarItem(placement: .primaryAction) {
                Button { showFilters = true } label: {
                    Image(systemName: filterCount > 0 ? "line.3.horizontal.decrease.circle.fill"
                                                       : "line.3.horizontal.decrease.circle")
                }
            }
            ToolbarItem(placement: .primaryAction) {
                Button { creating = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $creating) { CardEditorView(card: nil, defaultType: kind) }
        .sheet(item: $editing) { card in CardEditorView(card: card) }
        .sheet(item: $paying) { target in PayView(target: target) }
        .sheet(isPresented: $showFilters) {
            NavigationStack {
                Form {
                    Section("Filters") {
                        Toggle("Has a balance", isOn: $fBalance)
                        if !isLoanView { Toggle("Has 0% promo", isOn: $fPromo) }
                        Toggle("Overdue only", isOn: $fOverdue)
                    }
                }
                .navigationTitle(isLoanView ? "Filter loans" : "Filter cards")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Clear") { fBalance = false; fPromo = false; fOverdue = false }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { showFilters = false }
                    }
                }
            }
            .presentationDetents([.medium])
        }
        .sheet(isPresented: $creatingAccount) { AccountEditorView(account: nil) }
        .sheet(item: $editingAccount) { acct in AccountEditorView(account: acct) }
    }

    // ── Net worth header + account rows ──────────────────────────────
    private var netWorthHeader: some View {
        VStack(spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    FieldLabel(text: "Net worth")
                    Text(Money.fmt(store.netWorth))
                        .font(Theme.mono(26, weight: .bold))
                        .foregroundStyle(store.netWorth >= 0 ? Theme.green : Theme.red)
                        .minimumScaleFactor(0.6).lineLimit(1)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    HStack(spacing: 6) {
                        Text("Assets").font(Theme.ui(11)).foregroundStyle(Theme.muted)
                        Text(Money.fmt(store.assets)).font(Theme.mono(13, weight: .medium)).foregroundStyle(Theme.green)
                    }
                    HStack(spacing: 6) {
                        Text("Debts").font(Theme.ui(11)).foregroundStyle(Theme.muted)
                        Text("−\(Money.fmt(store.liabilities))").font(Theme.mono(13, weight: .medium)).foregroundStyle(Theme.red)
                    }
                }
            }
            if store.data.accounts.isEmpty {
                Text("Add savings, checking, investments, or property to track your net worth.")
                    .font(Theme.ui(12)).foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .ctCard()
        .listRowBackground(Color.clear).listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 6, trailing: 16))
    }

    private func accountRow(_ a: Account) -> some View {
        HStack(spacing: 12) {
            Text(Self.icon(for: a.type)).font(.system(size: 20))
            VStack(alignment: .leading, spacing: 2) {
                Text(a.name.isEmpty ? Self.typeLabel(a.type) : a.name)
                    .font(Theme.ui(15, weight: .medium)).foregroundStyle(Theme.text)
                Text(Self.typeLabel(a.type)).font(Theme.ui(12)).foregroundStyle(Theme.muted)
            }
            Spacer()
            Text(Money.fmt(a.balance)).font(Theme.mono(15, weight: .medium)).foregroundStyle(Theme.green)
        }
        .ctCard().contentShape(Rectangle())
    }

    static func icon(for type: String) -> String {
        switch type {
        case "savings": return "💰"; case "investment": return "📈"; case "property": return "🏠"
        case "cash": return "💵"; case "other": return "📦"; default: return "🏦"
        }
    }
    static func typeLabel(_ t: String) -> String {
        switch t {
        case "savings": return "Savings"; case "investment": return "Investments"; case "property": return "Property"
        case "cash": return "Cash"; case "other": return "Other"; default: return "Checking"
        }
    }
}

/// Add/edit an asset account.
struct AccountEditorView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let account: Account?

    @State private var name = ""
    @State private var type = "checking"
    @State private var balance: Double = 0
    @State private var notes = ""

    private static let types = [
        ("checking", "Checking"), ("savings", "Savings"), ("investment", "Investments"),
        ("property", "Property"), ("cash", "Cash"), ("other", "Other"),
    ]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name (e.g. Ally Savings)", text: $name)
                    Picker("Type", selection: $type) {
                        ForEach(Self.types, id: \.0) { Text($0.1).tag($0.0) }
                    }
                    HStack {
                        Text("Balance"); Spacer(); Text("$").foregroundStyle(Theme.muted)
                        TextField("0", value: $balance, format: .number)
                            .keyboardType(.numbersAndPunctuation).multilineTextAlignment(.trailing)
                    }
                    TextField("Notes", text: $notes, axis: .vertical)
                }
                if account != nil {
                    Section {
                        Button("Delete account", role: .destructive) {
                            if let account { store.deleteAccount(account) }
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(account == nil ? "New Account" : "Edit Account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { save() } }
            }
            .onAppear {
                if let account {
                    name = account.name; type = account.type; balance = account.balance; notes = account.notes
                }
            }
        }
    }

    private func save() {
        store.upsertAccount(Account(
            id: account?.id ?? AppStore.newID(),
            name: name.trimmingCharacters(in: .whitespaces),
            type: type, balance: balance, notes: notes
        ))
        dismiss()
    }
}

private struct CardRow: View {
    let card: Card
    let tz: TimeZone
    let state: PaidState
    let paidSoFar: Double
    let goal: Double
    let onPay: () -> Void
    let onEdit: () -> Void

    private var utilization: Double {
        card.limit > 0 ? min(1, card.balance / card.limit) : 0
    }

    private var promoActive: Bool {
        guard card.hasPromo else { return false }
        return DateLogic.monthsUntil(card.promoEndDate, tz: tz) > 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 8) {
                Text(card.type == "loan" ? "🏦" : "💳").font(.system(size: 20))
                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .center, spacing: 4) {
                        Text(card.name).font(Theme.ui(15, weight: .semibold)).foregroundStyle(Theme.text)
                        if let last = card.lastDigits, !last.isEmpty {
                            Text("\(card.network ?? "") •••• \(last)".trimmingCharacters(in: .whitespaces))
                                .font(Theme.mono(11)).foregroundStyle(Theme.muted)
                        }
                    }
                    if let issuer = card.issuer, !issuer.isEmpty {
                        Text(issuer).font(Theme.ui(12)).foregroundStyle(Theme.muted)
                    }
                }
                Spacer()
                Text(Money.fmt(card.balance)).font(Theme.mono(16, weight: .semibold)).foregroundStyle(Theme.text)
            }

            if card.type != "loan" {
                // utilization bar
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Theme.surface2)
                        Capsule().fill(utilization > 0.5 ? Theme.orange : Theme.accent)
                            .frame(width: max(4, geo.size.width * utilization))
                    }
                }
                .frame(height: 6)

                HStack(spacing: 8) {
                    Text("\(Int(utilization * 100))% of \(Money.fmtShort(card.limit))")
                        .font(Theme.ui(12)).foregroundStyle(Theme.muted)
                    if let cur = card.currentBalance, cur > 0 {
                        Text("Current: \(Money.fmtShort(cur))").font(Theme.ui(12)).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    if promoActive {
                        Text("0% promo")
                            .font(Theme.mono(10, weight: .medium))
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(Theme.greenBg).foregroundStyle(Theme.green)
                            .clipShape(Capsule())
                    } else {
                        Text("\(card.regularAPR, specifier: "%.2f")% APR")
                            .font(Theme.mono(11)).foregroundStyle(Theme.muted)
                    }
                }
            } else {
                HStack(spacing: 8) {
                    Text("\(card.regularAPR, specifier: "%.2f")% APR").font(Theme.mono(11)).foregroundStyle(Theme.muted)
                    Spacer()
                }
            }

            Divider().overlay(Theme.border)

            HStack {
                switch state {
                case .full:
                    Label("Paid \(Money.fmt(paidSoFar)) this month", systemImage: "checkmark.circle.fill")
                        .font(Theme.ui(12, weight: .medium)).foregroundStyle(Theme.green)
                case .partial:
                    Text("Paid \(Money.fmt(paidSoFar)) of \(Money.fmt(goal))")
                        .font(Theme.ui(12, weight: .medium)).foregroundStyle(Theme.orange)
                case .unpaid:
                    Text(card.type == "loan" ? "Monthly payment: \(Money.fmt(card.minPayment))" : "Not paid this month")
                        .font(Theme.ui(12)).foregroundStyle(Theme.muted)
                }
                Spacer()
                if state != .full {
                    Button(action: onPay) {
                        Text(state == .partial ? "Pay more" : "Pay")
                            .font(Theme.ui(13, weight: .semibold))
                            .padding(.horizontal, 14).padding(.vertical, 6)
                            .background(Theme.greenBg).foregroundStyle(Theme.green)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .ctCard()
        .contentShape(Rectangle())
        .onTapGesture(perform: onEdit)
    }
}
