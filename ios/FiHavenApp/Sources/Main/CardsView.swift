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
    @State private var skipConfirm: SkipTarget?
    /// Non-null right after a card is created, while we ask whether this
    /// period's payment has already been made.
    @State private var justAdded: Card?
    @State private var sortKey = "due"
    @State private var showFilters = false
    @State private var searchText = ""
    @State private var fBalance = false
    @State private var fPromo = false
    @State private var fOverdue = false

    /// A pending skip that needs confirming — skipping a card you still owe the
    /// minimum on can mean a late fee, so `cardSkipWarning` gates it.
    private struct SkipTarget: Identifiable {
        let id = UUID()
        let refId: String
        let name: String
        let warning: String
    }

    private func requestSkip(_ card: Card) {
        let refId = String(card.id)
        if let warning = store.cardSkipWarning(refId: refId, name: card.name) {
            skipConfirm = SkipTarget(refId: refId, name: card.name, warning: warning)
        } else {
            store.skipMonth(type: "card", refId: refId, name: card.name)
        }
    }

    private var isLoanView: Bool { kind == "loan" }
    private func inKind(_ c: Card) -> Bool { (((c.type ?? "card") == "loan")) == isLoanView }
    private var baseCards: [Card] {
        store.sortedCards.filter { !$0.archived && inKind($0) }
    }
    private var archivedForKind: [Card] { store.archivedCards.filter(inKind) }
    private var useArchive: Bool { store.data.settings.archiveInsteadOfDelete }

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
        let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        var list = baseCards.filter { c in
            if fBalance && !(c.balance > 0) { return false }
            if fPromo && !(c.hasPromo && !(c.promoEndDate ?? "").isEmpty) { return false }
            if fOverdue && !(dueDays(c) < 0) { return false }
            if !q.isEmpty {
                let hay = [c.name, c.issuer ?? "", c.type ?? ""].joined(separator: " ")
                if !hay.localizedCaseInsensitiveContains(q) { return false }
            }
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
                let proposals = store.pendingBalanceProposals()
                if !proposals.isEmpty {
                    Section {
                        ForEach(proposals) { p in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(p.name).font(Theme.ui(14, weight: .semibold))
                                Text("Current → \(Money.fmt(p.proposedCurrent))"
                                     + (p.limit.map { " · limit \(Money.fmt($0))" } ?? ""))
                                    .font(Theme.ui(12)).foregroundStyle(Theme.muted)
                                HStack {
                                    Button("Accept") { store.acceptBalanceProposal(p) }
                                        .buttonStyle(.borderedProminent)
                                    Button("Decline") { store.declineBalanceProposal(p) }
                                        .buttonStyle(.bordered)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    } header: {
                        Text("Bank balance review")
                    } footer: {
                        Text("Suggestions update Current Balance only. Decline remembers this figure until the bank changes.")
                    }
                }
            }
            if !isLoanView && !baseCards.isEmpty {
                cardsSummaryHeader
                cardsPayoffPanel
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
                        skipped: store.isSkipped(type: "card", refId: String(card.id)),
                        onPay: { paying = PayTarget(type: "card", refId: String(card.id), name: card.name) },
                        onEdit: { editing = card },
                        onSkip: { requestSkip(card) },
                        onUnskip: { store.unskip(type: "card", refId: String(card.id)) }
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
                        let isSkipped = store.isSkipped(type: "card", refId: String(card.id))
                        Button {
                            if isSkipped { store.unskip(type: "card", refId: String(card.id)) }
                            else { requestSkip(card) }
                        } label: {
                            Label(isSkipped ? "Un-skip" : "Skip month",
                                  systemImage: isSkipped ? "arrow.uturn.backward" : "forward.end.circle.fill")
                        }
                        .tint(Theme.muted)
                    }
                    .swipeActions(edge: .trailing) {
                        if useArchive {
                            Button {
                                store.archiveCard(card)
                            } label: {
                                Label("Archive", systemImage: "archivebox")
                            }
                            .tint(Theme.muted)
                        } else {
                            Button(role: .destructive) {
                                store.deleteCard(card)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
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

            if !archivedForKind.isEmpty {
                archivedSection
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.bg.ignoresSafeArea())
        .searchable(text: $searchText, prompt: isLoanView ? "Search loans" : "Search cards")
        .brandedNavigationBar(isLoanView ? "Loans" : "Cards")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Picker("Sort", selection: $sortKey) {
                        Text("Due date").tag("due")
                        Text("Largest balance").tag("balance")
                        Text("Highest APR").tag("apr")
                        if !isLoanView {
                            Text("Highest utilization").tag("util")
                            Text("0% promo first").tag("promo")
                        }
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
                    filterCount > 0
                        ? "Filter \(isLoanView ? "loans" : "cards"), \(filterCount) active"
                        : "Filter \(isLoanView ? "loans" : "cards")"
                )
            }
            ToolbarItem(placement: .primaryAction) {
                Button { creating = true } label: { Image(systemName: "plus") }
                    .accessibilityIconButton(isLoanView ? "Add loan" : "Add card")
            }
        }
        .sheet(isPresented: $creating) {
            CardEditorView(card: nil, defaultType: kind) { made in
                if (made.type ?? "card") != "loan" { justAdded = made }
            }
        }
        // A brand-new card starts life looking unpaid, which is wrong about half
        // the time: add a card on the 20th whose due day was the 3rd and it reads
        // as overdue, and its 0% payoff plan counts a payment you already made.
        // Ask once, up front. "Yes" opens the ordinary Pay sheet, prefilled — it
        // already handles paid-in-full vs. partial and feeds the promo math.
        .alert("Already paid this month?", isPresented: Binding(
            get: { justAdded != nil },
            set: { if !$0 { justAdded = nil } }
        ), presenting: justAdded) { card in
            Button("Yes, record it") {
                paying = PayTarget(type: "card", refId: String(card.id), name: card.name)
                justAdded = nil
            }
            Button("Not yet", role: .cancel) { justAdded = nil }
        } message: { card in
            Text("Have you already made this month's payment on \(card.name.isEmpty ? "this card" : card.name)? Saying yes lets FiHaven start from the right point — otherwise the card shows as unpaid, and its 0% payoff plan counts a payment you already made.")
        }
        .sheet(item: $editing) { card in CardEditorView(card: card) }
        .alert("Skip this month?", isPresented: Binding(
            get: { skipConfirm != nil },
            set: { if !$0 { skipConfirm = nil } }
        ), presenting: skipConfirm) { target in
            Button("Skip anyway", role: .destructive) {
                store.skipMonth(type: "card", refId: target.refId, name: target.name)
                skipConfirm = nil
            }
            Button("Cancel", role: .cancel) { skipConfirm = nil }
        } message: { target in
            Text(target.warning)
        }
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
        let utilPct = Int(util * 100)
        let high = util > 0.3
        // "Pay this month" = what's still owed this period across all cards, per
        // the user's paid-goal policy (mirrors each card's Pay button).
        let payThisMonth = baseCards.reduce(0.0) { $0 + store.remaining(type: "card", refId: $1.id) }
        let caughtUp = payThisMonth <= 0.005

        return VStack(alignment: .leading, spacing: 10) {
            // Lead with the one number a user acts on.
            FieldLabel(text: caughtUp ? "All caught up" : "Pay this month")
            Text(caughtUp ? "$0.00" : Money.fmt(payThisMonth))
                .font(Theme.mono(30, weight: .bold))
                .foregroundStyle(caughtUp ? Theme.green : Theme.text)
                .minimumScaleFactor(0.6).lineLimit(1)
            // Secondary context: balance · utilization · card count.
            HStack(spacing: 6) {
                Text("Balance \(Money.fmt(totalBalance))").font(Theme.ui(12)).foregroundStyle(Theme.muted)
                Text("·").font(Theme.ui(12)).foregroundStyle(Theme.muted)
                Text("Util \(utilPct)%").font(Theme.ui(12)).foregroundStyle(high ? Theme.red : Theme.green)
                Text("·").font(Theme.ui(12)).foregroundStyle(Theme.muted)
                Text("\(baseCards.count) card\(baseCards.count == 1 ? "" : "s")").font(Theme.ui(12)).foregroundStyle(Theme.muted)
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

    // ── Payoff plan: lump for interest-bearing cards, monthly for 0% promos
    @ViewBuilder
    private var cardsPayoffPanel: some View {
        let nonPromo = baseCards.filter { $0.type != "loan" && !($0.hasPromo && !($0.promoEndDate ?? "").isEmpty) && $0.balance > 0 }
        let promo = baseCards.filter {
            $0.type != "loan" && $0.hasPromo && !($0.promoEndDate ?? "").isEmpty
                && ($0.promoBalance ?? $0.balance) > 0
        }
        if !nonPromo.isEmpty || !promo.isEmpty {
            let nonPromoTotal = nonPromo.reduce(0.0) { $0 + $1.balance }
            let promoMonthly = promo.reduce(0.0) { $0 + Schedule.promoNeeded($1, tz: store.tz) }
            let longestMonths = promo.reduce(0) { max($0, DateLogic.monthsUntil($1.promoEndDate, tz: store.tz)) }
            VStack(alignment: .leading, spacing: 12) {
                FieldLabel(text: "Payoff plan")
                if !nonPromo.isEmpty {
                    payoffRow(icon: "flame.fill", tint: Theme.red,
                              title: "Pay off interest-bearing cards",
                              sub: "\(nonPromo.count) card\(nonPromo.count == 1 ? "" : "s") without 0% financing — clear these first",
                              amount: Money.fmt(nonPromoTotal), amountTint: Theme.red, suffix: nil)
                }
                if !promo.isEmpty {
                    payoffRow(icon: "calendar", tint: Theme.accent,
                              title: "Stay ahead of 0% promos",
                              sub: "Clears \(promo.count) promo balance\(promo.count == 1 ? "" : "s") on time" + (longestMonths > 0 ? " — up to \(longestMonths)mo left" : ""),
                              amount: Money.fmt(promoMonthly), amountTint: Theme.text, suffix: "/mo")
                }
            }
            .ctCard()
            .listRowBackground(Color.clear).listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 6, trailing: 16))
        }
    }

    private func payoffRow(icon: String, tint: Color, title: String, sub: String,
                           amount: String, amountTint: Color, suffix: String?) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 15)).foregroundStyle(tint).frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(Theme.ui(14, weight: .semibold)).foregroundStyle(Theme.text)
                Text(sub).font(Theme.ui(12)).foregroundStyle(Theme.muted)
            }
            Spacer()
            Text(amount).font(Theme.mono(17, weight: .bold)).foregroundStyle(amountTint)
                + Text(suffix ?? "").font(Theme.mono(12)).foregroundStyle(Theme.muted)
        }
    }

    // ── Archived cards/loans: restore or delete forever ──────────────
    @ViewBuilder
    private var archivedSection: some View {
        DisclosureGroup {
            ForEach(archivedForKind) { card in
                HStack(spacing: 10) {
                    Text(card.name).font(Theme.ui(14)).foregroundStyle(Theme.text).lineLimit(1)
                    Spacer()
                    Text(Money.fmt(card.balance)).font(Theme.mono(13, weight: .medium)).foregroundStyle(Theme.muted)
                    Button("Restore") { store.restoreCard(card) }
                        .font(Theme.ui(12, weight: .semibold)).buttonStyle(.borderless).tint(Theme.accent)
                    Button(role: .destructive) { store.deleteCard(card) } label: { Text("Delete") }
                        .font(Theme.ui(12, weight: .semibold)).buttonStyle(.borderless)
                }
            }
        } label: {
            Text("Archived \(isLoanView ? "loans" : "cards") (\(archivedForKind.count))")
                .font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.muted)
        }
        .ctCard()
        .listRowBackground(Color.clear).listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 10, trailing: 16))
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
                    CurrencyField(label: "Balance", value: $balance)
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
    var skipped: Bool = false
    let onPay: () -> Void
    let onEdit: () -> Void
    var onSkip: () -> Void = {}
    var onUnskip: () -> Void = {}

    private var utilization: Double {
        card.limit > 0 ? min(1, card.balance / card.limit) : 0
    }

    // Days until the payment lands. A settled card (paid or skipped) rolls to its
    // next period rather than reading as overdue.
    private var daysLeft: Int? {
        guard let dd = card.dueDay, dd > 0 else { return nil }
        return DateLogic.effectiveDaysUntilDue(
            dueDay: dd,
            whenFullyPaid: skipped || state == .full,
            tz: tz
        )
    }

    // Derived from `daysLeft` (not looked up separately) so the date shown and the
    // urgency it's coloured with can never disagree.
    private var dueDate: Date? {
        guard let d = daysLeft else { return nil }
        return DateLogic.calendar(tz: tz).date(byAdding: .day, value: d, to: DateLogic.today(tz: tz))
    }

    private var dueText: String {
        guard let d = daysLeft, let date = dueDate else { return "No due day set" }
        let label = Self.friendlyDate(date, tz: tz)
        if d < 0 { return "Overdue — was due \(label)" }
        if d == 0 { return "Due today · \(label)" }
        if d == 1 { return "Due tomorrow · \(label)" }
        return "Due \(label) · in \(d) days"
    }

    private var dueColor: Color {
        guard let d = daysLeft else { return Theme.muted }
        if d < 0 { return Theme.red }
        if d <= 5 { return Theme.orange }
        return Theme.muted
    }

    private static func friendlyDate(_ date: Date, tz: TimeZone) -> String {
        let f = DateFormatter()
        f.timeZone = tz
        f.locale = Locale(identifier: "en_US")
        let cal = DateLogic.calendar(tz: tz)
        let sameYear = cal.component(.year, from: date) == cal.component(.year, from: Date())
        f.dateFormat = sameYear ? "MMM d" : "MMM d, yyyy"
        return f.string(from: date)
    }

    private var promoActive: Bool {
        guard card.hasPromo else { return false }
        return DateLogic.monthsUntil(card.promoEndDate, tz: tz) > 0
    }

    // The one amount worth showing without tapping Pay: what to pay this period on
    // a card with a distinct recommendation — a 0% promo's monthly payoff, or an
    // explicit recommended payment. `isMonthly` tags the promo case for a "/mo".
    private var suggestedPayment: (amount: Double, isMonthly: Bool)? {
        if card.type == "loan" { return nil }
        if promoActive { return (max(card.minPayment, Schedule.promoNeeded(card, tz: tz)), true) }
        if let rec = card.recommendedPayment, rec > 0 { return (rec, false) }
        return nil
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
                // Lead with the date the payment actually lands on — the row used to
                // say only "Not paid this month", which never told you *when*.
                VStack(alignment: .leading, spacing: 2) {
                    Text(dueText)
                        .font(Theme.ui(12, weight: .semibold))
                        .foregroundStyle(dueColor)
                    paymentStatusView
                }
                Spacer()
                if skipped {
                    Button(action: onUnskip) {
                        Text("Undo skip")
                            .font(Theme.ui(13, weight: .semibold))
                            .padding(.horizontal, 12).padding(.vertical, 6)
                            .background(Theme.surface2).foregroundStyle(Theme.accent)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Un-skip \(card.name) this month")
                } else if state != .full {
                    Button(action: onSkip) {
                        Text("Skip")
                            .font(Theme.ui(13, weight: .semibold))
                            .padding(.horizontal, 12).padding(.vertical, 6)
                            .background(Theme.surface2).foregroundStyle(Theme.muted)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Skip this month's payment on \(card.name)")
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
        if skipped {
            Label("Skipped this month", systemImage: "forward.end.circle.fill")
                .font(Theme.ui(12))
                .foregroundStyle(Theme.muted)
        } else {
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
                if card.type == "loan" {
                    Text("Monthly payment: \(Money.fmt(card.minPayment))")
                        .font(Theme.ui(12)).foregroundStyle(Theme.muted)
                } else if let s = suggestedPayment {
                    Text("Suggested \(Money.fmt(s.amount))\(s.isMonthly ? "/mo" : "")")
                        .font(Theme.ui(12, weight: .semibold)).foregroundStyle(Theme.text)
                } else {
                    Text("Not paid this month")
                        .font(Theme.ui(12)).foregroundStyle(Theme.muted)
                }
            }
        }
    }

    private var cardSummary: String {
        var parts = [
            card.name,
            "balance \(Money.fmt(card.balance))",
            dueText,
            paymentStatusText,
        ]
        if card.type != "loan", card.limit > 0 {
            parts.append("\(Int(utilization * 100)) percent utilized")
        }
        if promoActive { parts.append("0 percent promo active") }
        return parts.joined(separator: ", ")
    }

    private var paymentStatusText: String {
        if skipped { return "skipped this month" }
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
