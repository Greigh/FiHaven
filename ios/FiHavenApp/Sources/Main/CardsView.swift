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

    private var isLoanView: Bool { kind == "loan" }
    private var baseCards: [Card] {
        store.sortedCards.filter { ((($0.type ?? "card") == "loan")) == isLoanView }
    }

    private var filterCount: Int {
        (fBalance ? 1 : 0) + (fPromo ? 1 : 0) + (fOverdue ? 1 : 0)
    }

    private func util(_ c: Card) -> Double { c.limit > 0 ? c.balance / c.limit : 0 }
    private func dueDays(_ c: Card) -> Int {
        guard let dd = c.dueDay else { return 9999 }
        let ref = String(c.id)
        return DateLogic.effectiveDaysUntilDue(
            dueDay: dd,
            whenFullyPaid: store.isFullyPaid(type: "card", refId: ref),
            tz: store.tz
        )
    }

    private var displayedCards: [Card] {
        var list = baseCards.filter { c in
            if fBalance && !(c.balance > 0) { return false }
            if fPromo && !(c.hasPromo && !(c.promoEndDate ?? "").isEmpty) { return false }
            if fOverdue && !(dueDays(c) < 0) { return false }
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
            if !isLoanView && !baseCards.isEmpty {
                cardsSummaryHeader
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
        .brandedNavigationBar(isLoanView ? "Loans" : "Cards")
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
                    .accessibilityIconButton(isLoanView ? "Sort loans" : "Sort cards")
            }
            ToolbarItem(placement: .primaryAction) {
                Button { showFilters = true } label: {
                    Image(systemName: filterCount > 0 ? "line.3.horizontal.decrease.circle.fill"
                                                       : "line.3.horizontal.decrease.circle")
                }
                .accessibilityIconButton(
                    filterCount > 0 ? "Filter cards, \(filterCount) active" : "Filter cards"
                )
            }
            ToolbarItem(placement: .primaryAction) {
                Button { creating = true } label: { Image(systemName: "plus") }
                    .accessibilityIconButton(isLoanView ? "Add loan" : "Add card")
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
    }

    // ── Cards summary (credit cards tab only) ────────────────────────
    private var cardsSummaryHeader: some View {
        let totalBalance = baseCards.reduce(0.0) { $0 + $1.balance }
        let totalLimit = baseCards.reduce(0.0) { $0 + $1.limit }
        let util = totalLimit > 0 ? totalBalance / totalLimit : 0.0

        return VStack(spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    FieldLabel(text: "Total balance")
                    Text(Money.fmt(totalBalance))
                        .font(Theme.mono(26, weight: .bold))
                        .foregroundStyle(Theme.text)
                        .minimumScaleFactor(0.6).lineLimit(1)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    HStack(spacing: 6) {
                        Text("Credit").font(Theme.ui(11)).foregroundStyle(Theme.muted)
                        Text(Money.fmt(totalLimit)).font(Theme.mono(13, weight: .medium)).foregroundStyle(Theme.text)
                    }
                    HStack(spacing: 6) {
                        Text("Utilization").font(Theme.ui(11)).foregroundStyle(Theme.muted)
                        let utilPct = Int(util * 100)
                        let high = util > 0.3
                        HStack(spacing: 4) {
                            if high {
                                Image(systemName: "exclamationmark.circle.fill")
                                    .font(.caption2)
                                    .foregroundStyle(Theme.red)
                            }
                            Text("\(utilPct)%")
                                .font(Theme.mono(13, weight: .medium))
                                .foregroundStyle(Theme.text)
                            Text(high ? "High" : "OK")
                                .font(Theme.ui(10, weight: .medium))
                                .foregroundStyle(high ? Theme.red : Theme.muted)
                        }
                    }
                }
            }
            if totalLimit > 0 {
                ProgressView(value: min(1, util))
                    .tint(util > 0.3 ? Theme.red : Theme.accent)
                    .accessibilityLabel("Total credit utilization")
                    .accessibilityValue("\(Int(util * 100)) percent")
            }
        }
        .ctCard(branded: true)
        .listRowBackground(Color.clear).listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 6, trailing: 16))
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
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(name.isEmpty)
                        .accessibilityHint(name.isEmpty ? "Enter an account name to save" : "Saves this asset account")
                }
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
                Image(systemName: card.type == "loan" ? "building.columns" : "creditcard")
                    .font(.system(size: 18))
                    .foregroundStyle(Theme.accent)
                    .accessibilityHidden(true)
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
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Theme.surface2)
                        Capsule().fill(utilization > 0.5 ? Theme.orange : Theme.accent)
                            .frame(width: max(4, geo.size.width * utilization))
                    }
                }
                .frame(height: 6)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Credit utilization")
                .accessibilityValue("\(Int(utilization * 100)) percent of \(Money.fmtShort(card.limit))")

                HStack(spacing: 8) {
                    if utilization > 0.5 {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.caption2)
                            .foregroundStyle(Theme.orange)
                    }
                    Text("\(Int(utilization * 100))% of \(Money.fmtShort(card.limit))")
                        .font(Theme.ui(12)).foregroundStyle(Theme.text)
                    if utilization > 0.5 {
                        Text("High")
                            .font(Theme.ui(10, weight: .medium))
                            .foregroundStyle(Theme.orange)
                    }
                    if let cur = card.currentBalance, cur > 0 {
                        Text("Current: \(Money.fmtShort(cur))").font(Theme.ui(12)).foregroundStyle(Theme.muted)
                    }
                    autopayChip
                    Spacer()
                    if promoActive {
                        HStack(spacing: 4) {
                            Image(systemName: "percent")
                                .font(.caption2)
                            Text("0% promo")
                                .font(Theme.mono(10, weight: .medium))
                        }
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Theme.greenBg).foregroundStyle(Theme.text)
                        .clipShape(Capsule())
                    } else {
                        Text("\(card.regularAPR, specifier: "%.2f")% APR")
                            .font(Theme.mono(11)).foregroundStyle(Theme.muted)
                    }
                }
            } else {
                HStack(spacing: 8) {
                    Text("\(card.regularAPR, specifier: "%.2f")% APR").font(Theme.mono(11)).foregroundStyle(Theme.muted)
                    autopayChip
                    Spacer()
                }
            }

            Divider().overlay(Theme.border)

            HStack {
                paymentStatusView
                Spacer()
                if state != .full {
                    Button(action: onPay) {
                        Text(state == .partial ? "Pay more" : "Pay")
                            .font(Theme.ui(13, weight: .semibold))
                            .padding(.horizontal, 14).padding(.vertical, 6)
                            .background(Theme.greenBg).foregroundStyle(Theme.text)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(state == .partial ? "Pay more on \(card.name)" : "Pay \(card.name)")
                }
            }
        }
        .ctCard()
        .contentShape(Rectangle())
        .onTapGesture(perform: onEdit)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(cardSummary)
        .accessibilityHint("Double tap to edit")
    }

    // Autopay status pill, matching the web card row ("✓ Autopay · day N" / "Manual").
    @ViewBuilder
    private var autopayChip: some View {
        if card.autopay {
            Text(card.autopayDay.map { "✓ Autopay · day \($0)" } ?? "✓ Autopay")
                .font(Theme.mono(10, weight: .medium))
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Theme.greenBg).foregroundStyle(Theme.green)
                .clipShape(Capsule())
        } else {
            Text("Manual")
                .font(Theme.mono(10))
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Theme.surface2).foregroundStyle(Theme.muted)
                .clipShape(Capsule())
        }
    }

    @ViewBuilder
    private var paymentStatusView: some View {
        switch state {
        case .full:
            Label("Paid \(Money.fmt(paidSoFar)) this month", systemImage: "checkmark.circle.fill")
                .font(Theme.ui(12, weight: .medium))
                .foregroundStyle(Theme.text)
        case .partial:
            Label("Paid \(Money.fmt(paidSoFar)) of \(Money.fmt(goal))", systemImage: "circle.lefthalf.filled")
                .font(Theme.ui(12, weight: .medium))
                .foregroundStyle(Theme.text)
        case .unpaid:
            Text(card.type == "loan" ? "Monthly payment: \(Money.fmt(card.minPayment))" : "Not paid this month")
                .font(Theme.ui(12))
                .foregroundStyle(Theme.muted)
        }
    }

    private var cardSummary: String {
        var parts = [
            card.name,
            "balance \(Money.fmt(card.balance))",
            paymentStatusText,
        ]
        if card.type != "loan", card.limit > 0 {
            parts.append("\(Int(utilization * 100)) percent utilized")
        }
        if promoActive { parts.append("0 percent promo active") }
        return parts.joined(separator: ", ")
    }

    private var paymentStatusText: String {
        switch state {
        case .full: return "paid \(Money.fmt(paidSoFar)) this month"
        case .partial: return "partially paid, \(Money.fmt(paidSoFar)) of \(Money.fmt(goal))"
        case .unpaid:
            return card.type == "loan"
                ? "monthly payment \(Money.fmt(card.minPayment))"
                : "not paid this month"
        }
    }
}
