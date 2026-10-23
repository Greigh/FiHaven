#if os(macOS)
import SwiftUI
import FiHavenCore

// MARK: - The seam

extension TabItem {
    /// The Mac pane for this screen — the `Mac*Table` the port built for it,
    /// or the shared phone view where the Mac has not grown its own layout
    /// (Home's widgets, Calendar's inspector are not tables).
    @ViewBuilder var macDestination: some View {
        switch self {
        case .dashboard: DashboardView()
        case .bills: MacBillsScreen()
        case .cards: MacCardsScreen(loans: false)
        case .loans: MacCardsScreen(loans: true)
        case .payoff: ProGate(feature: .payoff) { MacPayoffScreen() }
        case .rewards: ProGate(feature: .rewards) { MacRewardsScreen() }
        case .income: MacIncomeScreen()
        case .budget: MacBudgetScreen()
        case .spending: MacSpendingScreen()
        case .subscriptions: ProGate(feature: .subscriptions) { MacSubscriptionsScreen() }
        case .calendar: ProGate(feature: .calendar) { CalendarView() }
        case .history: ProGate(feature: .history) { MacHistoryScreen() }
        case .networth: MacNetWorthScreen()
        case .balances: MacBalancesScreen()
        }
    }
}

// MARK: - Bills

struct MacBillsScreen: View {
    @EnvironmentObject var store: AppStore
    @State private var selection = Set<String>()
    @State private var sortOrder = [KeyPathComparator(\Bill.dueSortKey)]
    @State private var creating = false
    @State private var editing: Bill?
    @State private var paying: PayTarget?

    private var monthly: Double { store.activeBills.reduce(0) { $0 + SubscriptionsFinder.monthlyOfBill($1) } }
    private var unpaid: Int {
        store.activeBills.filter { store.paidState(type: "bill", refId: String($0.id)) != .full }.count
    }

    var body: some View {
        VStack(spacing: 0) {
            MacSummaryStrip {
                MacStripFigure(label: "Monthly", value: Money.fmt(monthly),
                               help: "Every bill normalised to its monthly cost.")
                MacStripFigure(label: "Unpaid", value: "\(unpaid)",
                               tint: unpaid > 0 ? Theme.orange : Theme.green,
                               help: "Bills not yet paid this period.")
            }
            MacBillsTable(
                bills: store.activeBills,
                selection: $selection,
                sortOrder: $sortOrder,
                onAdd: { creating = true },
                addTitle: "New Bill",
                onPay: { bill in
                    paying = PayTarget(type: "bill", refId: String(bill.id), name: bill.name)
                },
                onEdit: { editing = $0 },
                onSetPaid: { bill, paid in
                    store.setPaid(type: "bill", refId: String(bill.id), name: bill.name,
                                  amount: store.goalAmount(type: "bill", refId: String(bill.id)),
                                  paid: paid)
                },
                onSkip: { store.skipMonth(type: "bill", refId: String($0.id), name: $0.name) },
                onUnskip: { store.unskip(type: "bill", refId: String($0.id)) },
                onArchive: { store.archiveBill($0) },
                onDelete: { store.deleteBill($0) }
            )
        }
        .sheet(isPresented: $creating) { BillEditorView(bill: nil).environmentObject(store) }
        .sheet(item: $editing) { bill in BillEditorView(bill: bill).environmentObject(store) }
        .sheet(item: $paying) { target in PayView(target: target).environmentObject(store) }
    }
}

// MARK: - Cards & Loans

struct MacCardsScreen: View {
    /// Cards and loans are the same table filtered by type — the phone's
    /// `CardsView(kind:)` split in two sidebar entries.
    let loans: Bool

    @EnvironmentObject var store: AppStore
    @State private var selection = Set<String>()
    @State private var sortOrder = [KeyPathComparator(\Card.name)]
    @State private var creating = false
    @State private var editing: Card?
    @State private var paying: PayTarget?
    @State private var skipConfirm: SkipTarget?

    private struct SkipTarget: Identifiable {
        let card: Card
        let warning: String
        var id: String { card.id }
    }

    private func inKind(_ c: Card) -> Bool { ((c.type ?? "card") == "loan") == loans }

    private var shown: [Card] {
        store.sortedCards.filter { !$0.archived && inKind($0) }
    }

    private var owed: Double { shown.reduce(0) { $0 + ($1.currentBalance ?? $1.balance) } }

    private func askSkip(_ card: Card) {
        let refId = String(card.id)
        if let warning = store.cardSkipWarning(refId: refId, name: card.name) {
            skipConfirm = SkipTarget(card: card, warning: warning)
        } else {
            store.skipMonth(type: "card", refId: refId, name: card.name)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            MacSummaryStrip {
                MacStripFigure(label: loans ? "Owed" : "Statement", value: Money.fmt(owed),
                               help: loans ? "Total owed across loans." : "Total owed across cards.")
            }
            MacCardsTable(
                cards: shown,
                isLoanView: loans,
                selection: $selection,
                sortOrder: $sortOrder,
                onAdd: { creating = true },
                addTitle: loans ? "New Loan" : "New Card",
                onPay: { card in
                    paying = PayTarget(type: "card", refId: String(card.id), name: card.name)
                },
                onEdit: { editing = $0 },
                onSetPaid: { card, paid in
                    store.setPaid(type: "card", refId: String(card.id), name: card.name,
                                  amount: store.goalAmount(type: "card", refId: String(card.id)),
                                  paid: paid)
                },
                onSkip: askSkip,
                onUnskip: { store.unskip(type: "card", refId: String($0.id)) },
                onArchive: { store.archiveCard($0) },
                onDelete: { store.deleteCard($0) }
            )
        }
        .sheet(isPresented: $creating) { CardEditorView(card: nil, defaultType: loans ? "loan" : "card").environmentObject(store) }
        .sheet(item: $editing) { card in CardEditorView(card: card, defaultType: loans ? "loan" : "card").environmentObject(store) }
        .sheet(item: $paying) { target in PayView(target: target).environmentObject(store) }
        .alert("Skip this month?", isPresented: Binding(
            get: { skipConfirm != nil },
            set: { if !$0 { skipConfirm = nil } }
        )) {
            Button("Skip") {
                if let s = skipConfirm {
                    store.skipMonth(type: "card", refId: String(s.card.id), name: s.card.name)
                }
                skipConfirm = nil
            }
            Button("Cancel", role: .cancel) { skipConfirm = nil }
        } message: {
            Text(skipConfirm?.warning ?? "")
        }
    }
}

// MARK: - Spending

struct MacSpendingScreen: View {
    @EnvironmentObject var store: AppStore
    @State private var selection = Set<String>()
    @State private var sortOrder = [KeyPathComparator(\SpendTransaction.date, order: .reverse)]
    @State private var addingTx = false
    @State private var editingTx: SpendTransaction?

    var body: some View {
        MacSpendingTable(
            transactions: store.data.transactions,
            selection: $selection,
            sortOrder: $sortOrder,
            onAdd: { addingTx = true },
            addTitle: "New Transaction",
            onEdit: { editingTx = $0 }
        )
        .sheet(isPresented: $addingTx) { TransactionEditorView().environmentObject(store) }
        .sheet(item: $editingTx) { tx in TransactionEditorView(edit: tx).environmentObject(store) }
    }
}

// MARK: - Subscriptions

struct MacSubscriptionsScreen: View {
    @EnvironmentObject var store: AppStore
    @State private var selection = Set<String>()
    @State private var sortOrder = [KeyPathComparator(\SubscriptionsFinder.Item.monthly, order: .reverse)]
    @State private var editingBill: Bill?
    @State private var creating = false
    @State private var creatingFrom: SubscriptionsFinder.Item?
    @State private var linking: SubscriptionsFinder.Item?

    private var allItems: [SubscriptionsFinder.Item] {
        SubscriptionsFinder.build(
            bills: store.data.bills,
            transactions: store.data.transactions,
            tz: store.tz,
            declined: store.data.settings.subscriptionDeclined
        )
    }

    private func bill(for item: SubscriptionsFinder.Item) -> Bill? {
        guard let id = item.billId else { return nil }
        return store.data.bills.first { String($0.id) == id }
    }

    private var totalMonthly: Double {
        allItems.filter { $0.source == "bill" }.reduce(0) { $0 + $1.monthly }
    }

    var body: some View {
        VStack(spacing: 0) {
            MacSummaryStrip {
                MacStripFigure(label: "Monthly", value: "\(Money.fmt(totalMonthly))/mo",
                               help: "Tracked subscriptions, per month.")
                MacStripFigure(label: "Tracked", value: "\(allItems.filter { $0.source == "bill" }.count)")
            }
            MacSubscriptionsTable(
                items: allItems,
                selection: $selection,
                sortOrder: $sortOrder,
                onAdd: { creating = true },
                addTitle: "New Subscription",
                status: { subscriptionStatus($0, tz: store.tz) },
                onEdit: { editingBill = $0 },
                onAccept: { s in
                    store.acceptSubscriptionCandidate(name: s.name, amount: s.amount, lastDate: s.lastDate)
                },
                onDecline: { s in
                    store.declineSubscriptionMerchant(s.merchantKey.isEmpty ? s.name : s.merchantKey)
                },
                onAddFrom: { creatingFrom = $0 },
                onManageLink: { linking = $0 }
            )
        }
        .sheet(item: $editingBill) { bill in BillEditorView(bill: bill).environmentObject(store) }
        .sheet(isPresented: $creating) { BillEditorView(bill: nil).environmentObject(store) }
        .sheet(item: $creatingFrom) { item in
            BillEditorView(bill: Bill(
                id: UUID().uuidString,
                name: item.name,
                category: "Subscriptions",
                amount: item.amount,
                dueDay: item.lastDate.flatMap { Int($0.suffix(2)) },
                frequency: "Monthly",
                business: item.name
            )).environmentObject(store)
        }
        .sheet(item: $linking) { item in
            ManageLinkSheet(item: item, bill: bill(for: item)).environmentObject(store)
        }
    }
}

// MARK: - Net Worth

struct MacNetWorthScreen: View {
    @EnvironmentObject var store: AppStore
    @State private var selection = Set<String>()
    @State private var sortOrder = [KeyPathComparator(\Account.name)]

    var body: some View {
        MacNetWorthTable(
            accounts: store.data.accounts,
            selection: $selection,
            sortOrder: $sortOrder
        )
    }
}

// MARK: - History

struct MacHistoryScreen: View {
    @EnvironmentObject var store: AppStore
    @State private var selection = Set<String>()
    @State private var sortOrder = [KeyPathComparator(\Payment.date, order: .reverse)]
    @State private var editing: Payment?

    var body: some View {
        MacHistoryTable(
            payments: store.paymentsByDateDesc,
            selection: $selection,
            sortOrder: $sortOrder,
            onEdit: { editing = $0 }
        )
        .sheet(item: $editing) { p in EditPaymentView(payment: p).environmentObject(store) }
    }
}

// MARK: - Rewards

struct MacRewardsScreen: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var billing: StoreManager
    @State private var category = "Dining"
    @State private var selection = Set<String>()
    @State private var sortOrder = [KeyPathComparator(\Rewards.Ranked.value, order: .reverse)]
    @State private var showRateReport = false

    private var ranking: Rewards.Ranking {
        Rewards.rank(store.activeCards, category: category, tz: store.tz)
    }

    var body: some View {
        VStack(spacing: 0) {
            MacSummaryStrip {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(Rewards.categories, id: \.self) { cat in
                            Button { category = cat } label: {
                                Text(cat)
                                    .font(Theme.ui(12, weight: cat == category ? .semibold : .regular))
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 5)
                                    .background(cat == category ? Theme.accent : Theme.surface, in: Capsule())
                                    .foregroundStyle(cat == category ? .white : Theme.text)
                                    .overlay(Capsule().stroke(Theme.border, lineWidth: cat == category ? 0 : 1))
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(cat == category ? .isSelected : [])
                        }
                    }
                }
            }
            MacRewardsTable(
                ranked: ranking.eligible + ranking.excluded,
                category: category,
                selection: $selection,
                sortOrder: $sortOrder
            )
        }
        .toolbar {
            ToolbarItem(placement: .secondaryAction) {
                Button("Spot a wrong rate? Report it") { showRateReport = true }
            }
        }
        .sheet(isPresented: $showRateReport) {
            RewardRateReportSheet(
                cards: store.activeCards,
                preferredCategory: category,
                preferredCardId: nil
            )
            .environmentObject(store)
            .environmentObject(billing)
        }
    }
}

// MARK: - Income

struct MacIncomeScreen: View {
    @EnvironmentObject var store: AppStore
    @State private var selSources = Set<String>()
    @State private var sortSources = [KeyPathComparator(\IncomeSource.label)]
    @State private var selAdjustments = Set<String>()
    @State private var sortAdjustments = [KeyPathComparator(\IncomeAdjustment.monthKey, order: .reverse)]
    @State private var creating = false
    @State private var editing: IncomeSource?
    @State private var creatingAdj = false
    @State private var editingAdj: IncomeAdjustment?

    private var adjustments: [IncomeAdjustment] {
        Income.adjustmentsForPeriod(from: store.data.settings, bounds: store.currentBounds, tz: store.tz)
    }

    private var anchorMonth: String { Income.periodAnchorMonth(store.currentBounds) }

    private var adjustmentsTotal: Double {
        Income.adjustmentsTotal(from: store.data.settings, bounds: store.currentBounds, tz: store.tz)
    }

    private var baseIncome: Double { store.periodIncome - adjustmentsTotal }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                MacSummaryStrip {
                    MacStripFigure(label: Income.adjustmentsLabel(for: store.periodConfig),
                                   value: Money.fmt(store.periodIncome),
                                   help: "This period's take-home after adjustments.")
                    if adjustmentsTotal != 0 {
                        MacStripFigure(label: "Adjustments",
                                       value: "\(adjustmentsTotal >= 0 ? "+" : "")\(Money.fmt(adjustmentsTotal))",
                                       tint: adjustmentsTotal < 0 ? Theme.red : Theme.green)
                    }
                }

                MacSectionHeader("Income sources") {
                    Button { creating = true } label: { Image(systemName: "plus") }
                        .ctPlainButton()
                        .accessibilityLabel("Add income source")
                }
                MacIncomeTable(
                    sources: store.data.settings.incomes,
                    selection: $selSources,
                    sortOrder: $sortSources,
                    onEdit: { editing = $0 },
                    emptyCopy: "No income sources yet. Add your paycheck."
                )
                .macTablePlacement(.rows(max(store.data.settings.incomes.count, 1)))

                MacSectionHeader(Income.adjustmentsLabel(for: store.periodConfig)) {
                    Button { creatingAdj = true } label: { Image(systemName: "plus") }
                        .ctPlainButton()
                        .accessibilityLabel("Add income adjustment")
                }
                MacIncomeAdjustmentsTable(
                    adjustments: adjustments,
                    selection: $selAdjustments,
                    sortOrder: $sortAdjustments,
                    onEdit: { editingAdj = $0 },
                    emptyCopy: "No adjustments this period."
                )
                .macTablePlacement(.rows(max(adjustments.count, 1)))
            }
        }
        .sheet(isPresented: $creating) { IncomeEditorView(source: nil).environmentObject(store) }
        .sheet(item: $editing) { src in IncomeEditorView(source: src).environmentObject(store) }
        .sheet(isPresented: $creatingAdj) {
            IncomeAdjustmentEditorView(adjustment: nil, monthKey: anchorMonth).environmentObject(store)
        }
        .sheet(item: $editingAdj) { adj in
            IncomeAdjustmentEditorView(adjustment: adj, monthKey: anchorMonth).environmentObject(store)
        }
    }
}

/// A section label with a trailing accessory — the Mac screens put a "+"
/// here where the phone puts one in the navigation bar.
private struct MacSectionHeader<Accessory: View>: View {
    let title: String
    @ViewBuilder var accessory: Accessory

    init(_ title: String, @ViewBuilder accessory: () -> Accessory) {
        self.title = title
        self.accessory = accessory()
    }

    var body: some View {
        HStack {
            FieldLabel(text: title)
            Spacer()
            accessory
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 6)
    }
}

// MARK: - Balances

struct MacBalancesScreen: View {
    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var store: AppStore
    @State private var selection = Set<String>()
    @State private var sortOrder = [KeyPathComparator(\Account.name)]
    @State private var creating = false
    @State private var editing: Account?
    @State private var bankFigures: [String: BalancesView.BankFigure] = [:]

    private func bankFigure(for account: Account) -> BalancesView.BankFigure? {
        guard let pid = account.plaidAccountId, !pid.isEmpty, pid != Account.noPlaidLink
        else { return nil }
        return bankFigures[pid]
    }

    private func loadBankFigures() async {
        guard let status = try? await env.api.plaidStatus() else { return }
        var out: [String: BalancesView.BankFigure] = [:]
        for item in status.items {
            let asOf = item.lastSyncAt.map { Date(timeIntervalSince1970: $0 / 1000) }
            for a in item.accounts
            where ["depository", "investment", "brokerage"].contains((a.type ?? "").lowercased()) {
                var label = item.institutionName
                if let n = a.name, !n.isEmpty { label += " · " + n }
                if let m = a.mask, !m.isEmpty { label += " ····" + m }
                out[a.accountId] = BalancesView.BankFigure(label: label, balance: a.currentBalance, asOf: asOf)
            }
        }
        bankFigures = out
    }

    var body: some View {
        MacBalancesTable(
            accounts: store.data.accounts,
            bankFigure: bankFigure(for:),
            selection: $selection,
            sortOrder: $sortOrder,
            onEdit: { editing = $0 },
            onDelete: { store.deleteAccount($0) }
        )
        .sheet(isPresented: $creating) { AccountEditorView(account: nil).environmentObject(store) }
        .sheet(item: $editing) { account in AccountEditorView(account: account).environmentObject(store) }
        .task { await loadBankFigures() }
    }
}

// MARK: - Payoff

struct MacPayoffScreen: View {
    @EnvironmentObject var store: AppStore
    @State private var strategy: PayoffStrategy = .avalanche
    @State private var extra: Double = 100
    @State private var includeMortgage = false
    @State private var showCompare = false
    @State private var selection = Set<String>()
    @State private var sortOrder = [KeyPathComparator(\MacPayoffRow.monthSortKey)]

    private func debtOf(_ c: Card) -> Double {
        if let cur = c.currentBalance, cur > 0 { return cur }
        return c.balance
    }

    private var housingLoans: [Card] {
        store.activeCards.filter { Payoff.isHousingLoan($0) && debtOf($0) > 0 }
    }

    private var simSnow: PayoffResult? {
        Payoff.runPayoffSim(cards: store.activeCards, strategy: .snowball, extra: extra, tz: store.tz, includeMortgage: includeMortgage)
    }
    private var simAval: PayoffResult? {
        Payoff.runPayoffSim(cards: store.activeCards, strategy: .avalanche, extra: extra, tz: store.tz, includeMortgage: includeMortgage)
    }
    private var hero: PayoffResult? { strategy == .avalanche ? simAval : simSnow }
    private var compared: PayoffResult? { showCompare ? (strategy == .avalanche ? simSnow : simAval) : nil }

    private var rows: [MacPayoffRow] {
        hero?.cards.map { MacPayoffRow($0, compared: compared?.cards ?? []) } ?? []
    }

    var body: some View {
        GeometryReader { pane in
            if pane.size.width >= MacPaneColumns.sideSplit(mainColumn: MacPayoffTable.wideWidth) {
                HStack(alignment: .top, spacing: 0) {
                    main
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    Divider()
                    controls
                        .frame(width: MacPaneColumns.sideWidth)
                }
            } else {
                VStack(spacing: 0) {
                    main
                    controls
                }
            }
        }
    }

    private var main: some View {
        VStack(spacing: 0) {
            if let hero {
                MacSummaryStrip {
                    MacStripFigure(
                        label: strategy == .avalanche ? "Avalanche" : "Snowball",
                        value: hero.payoffDate.formatted(.dateTime.month(.abbreviated).year()),
                        help: "Debt-free month at the extra payment below.")
                    MacStripFigure(label: "Interest", value: Money.fmt(hero.totalInterest),
                                   help: "Interest paid over the life of the plan.")
                }
            }
            MacPayoffTable(rows: rows, comparedName: comparedTitle,
                           selection: $selection, sortOrder: $sortOrder)
        }
    }

    private var comparedTitle: String {
        showCompare ? (strategy == .avalanche ? "Snowball" : "Avalanche") : ""
    }

    private var controls: some View {
        Form {
            Picker("Strategy", selection: $strategy) {
                Text("Avalanche").tag(PayoffStrategy.avalanche)
                Text("Snowball").tag(PayoffStrategy.snowball)
            }
            .pickerStyle(.segmented)

            LabeledContent("Extra / month") {
                Text(Money.fmt(extra)).foregroundStyle(Theme.accent).font(Theme.mono(13, weight: .semibold))
            }
            Slider(value: $extra, in: 0...1000, step: 25)

            Toggle("Compare strategies", isOn: $showCompare)
            if !housingLoans.isEmpty {
                Toggle("Include mortgage", isOn: $includeMortgage)
            }
        }
        .formStyle(.grouped)
        .frame(maxHeight: .infinity)
    }
}

// MARK: - Budget

struct MacBudgetScreen: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var billing: StoreManager
    @State private var selLens = Set<String>()
    @State private var sortLens = [KeyPathComparator(\MacBudgetRow.row.label)]
    @State private var selGoals = Set<String>()
    @State private var sortGoals = [KeyPathComparator(\MacGoalRow.savePerMonthSortKey)]
    @State private var creatingGoal = false
    @State private var editingGoal: SavingsGoal?

    private var budgetLens: BudgetRules.Lens? {
        BudgetRules.lens(
            settings: store.data.settings,
            income: store.periodIncome,
            bills: store.activeBills,
            cards: store.activeCards,
            transactions: store.data.transactions,
            goals: store.data.goals,
            bounds: store.currentBounds,
            billDueInPeriod: { BillSchedule.dueInPeriod($0, bounds: store.currentBounds, tz: store.tz) },
            isPro: billing.isPro,
            tz: store.tz
        )
    }

    private var lensRows: [MacBudgetRow] {
        budgetLens?.rows.map(MacBudgetRow.init) ?? []
    }

    private var goalRows: [MacGoalRow] {
        store.data.goals.map { MacGoalRow($0, tz: store.tz) }
    }

    var body: some View {
        GeometryReader { pane in
            if pane.size.width >= MacPaneColumns.sideSplit(mainColumn: MacBudgetLensTable.wideWidth) {
                HStack(alignment: .top, spacing: 0) {
                    lensPane
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    Divider()
                    goalsPane
                        .frame(width: MacPaneColumns.sideWidth)
                }
            } else {
                VStack(spacing: 0) {
                    lensPane
                    goalsPane
                }
            }
        }
    }

    private var lensPane: some View {
        VStack(spacing: 0) {
            if let lens = budgetLens {
                MacSummaryStrip {
                    if let h = lens.headline {
                        MacStripFigure(label: h.label, value: Money.fmt(h.amount),
                                       help: lens.subtitle)
                    } else {
                        MacStripFigure(label: lens.title, value: lens.subtitle)
                    }
                }
            }
            MacBudgetLensTable(rows: lensRows, selection: $selLens, sortOrder: $sortLens)
        }
    }

    private var goalsPane: some View {
        VStack(spacing: 0) {
            MacSectionHeader("Goals") {
                Button { creatingGoal = true } label: { Image(systemName: "plus") }
                    .ctPlainButton()
                    .accessibilityLabel("Add goal")
            }
            MacGoalsTable(rows: goalRows, selection: $selGoals, sortOrder: $sortGoals,
                          onEdit: { editingGoal = $0 })
                .frame(maxHeight: .infinity)
        }
        .sheet(isPresented: $creatingGoal) { GoalEditorView(goal: nil).environmentObject(store) }
        .sheet(item: $editingGoal) { goal in GoalEditorView(goal: goal).environmentObject(store) }
    }
}
#endif
