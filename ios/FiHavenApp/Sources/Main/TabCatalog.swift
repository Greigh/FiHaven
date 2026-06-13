import SwiftUI

/// The customizable app tabs — everything except the fixed "More" overflow
/// and the Free-only "Get Pro" slot. Declaration order is the default order.
enum TabItem: String, CaseIterable, Identifiable, Hashable {
    case dashboard, bills, cards, loans, payoff, rewards, budget, calendar, history
    var id: String { rawValue }

    var title: String {
        switch self {
        case .dashboard: return "Home"
        case .bills: return "Bills"
        case .cards: return "Cards"
        case .loans: return "Loans"
        case .payoff: return "Payoff"
        case .rewards: return "Rewards"
        case .budget: return "Budget"
        case .calendar: return "Calendar"
        case .history: return "History"
        }
    }

    var symbol: String {
        switch self {
        case .dashboard: return "house.fill"
        case .bills: return "doc.text.fill"
        case .cards: return "creditcard.fill"
        case .loans: return "building.columns.fill"
        case .payoff: return "chart.line.downtrend.xyaxis"
        case .rewards: return "star.circle.fill"
        case .budget: return "chart.pie.fill"
        case .calendar: return "calendar"
        case .history: return "clock.arrow.circlepath"
        }
    }

    /// The destination view for this tab (Pro-gated where the web is).
    @ViewBuilder var destination: some View {
        switch self {
        case .dashboard: DashboardView()
        case .bills: BillsView()
        case .cards: CardsView()
        case .loans: CardsView(kind: "loan")
        case .payoff: ProGate(feature: .payoff) { PayoffView() }
        case .rewards: ProGate(feature: .rewards) { RewardsView() }
        case .budget: BudgetView()
        case .calendar: ProGate(feature: .calendar) { CalendarView() }
        case .history: ProGate(feature: .history) { HistoryView() }
        }
    }
}

/// Default bottom-bar layout when the user hasn't customized it.
let defaultBottomTabs: [TabItem] = [.dashboard, .bills, .cards, .payoff]

/// How many tabs the bottom bar shows before "More" (and, for Free users,
/// before the always-present "Get Pro" slot takes one).
let maxBottomTabs = 4

/// Resolve the saved tab order (settings.tabs — ordered ids in the bottom
/// bar) into bottom + overflow lists. Unknown ids are dropped; tabs not
/// listed fall into overflow in catalog order.
func resolveTabs(saved: [String]?) -> (bottom: [TabItem], overflow: [TabItem]) {
    let savedItems = saved?.compactMap { TabItem(rawValue: $0) } ?? defaultBottomTabs
    var seen = Set<TabItem>()
    let bottom = savedItems.filter { seen.insert($0).inserted }
    let overflow = TabItem.allCases.filter { !seen.contains($0) }
    return (bottom, overflow)
}
