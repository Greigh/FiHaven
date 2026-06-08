import SwiftUI
import FiHavenCore

enum AppTab: String, Hashable { case home, bills, cards, payoff, more }

/// Signed-in tab shell. Five primary tabs; Budget / Calendar / History /
/// Settings live under "More".
struct MainTabView: View {
    let user: User
    @EnvironmentObject var store: AppStore
    @State private var tab: AppTab = MainTabView.initialTab()
    @State private var debugPaywall = false
    @State private var didApplyLanding = false

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack { DashboardView() }
                .tag(AppTab.home)
                .tabItem { Label("Home", systemImage: "house.fill") }
            NavigationStack { BillsView() }
                .tag(AppTab.bills)
                .tabItem { Label("Bills", systemImage: "doc.text.fill") }
            NavigationStack { CardsView() }
                .tag(AppTab.cards)
                .tabItem { Label("Cards", systemImage: "creditcard.fill") }
            NavigationStack { ProGate(feature: .payoff) { PayoffView() } }
                .tag(AppTab.payoff)
                .tabItem { Label("Payoff", systemImage: "chart.line.downtrend.xyaxis") }
            MoreView(user: user)
                .tag(AppTab.more)
                .tabItem { Label("More", systemImage: "ellipsis.circle.fill") }
        }
        .tint(Theme.accent)
        .onAppear {
            #if DEBUG
            if ProcessInfo.processInfo.environment["FH_SCREEN"] == "paywall" {
                debugPaywall = true
            }
            #endif
        }
        // Open to the user's saved default view, once the data has loaded.
        .task(id: store.loaded) {
            guard store.loaded, !didApplyLanding, let t = landingTab() else { return }
            didApplyLanding = true
            tab = t
        }
        .sheet(isPresented: $debugPaywall) { PaywallView() }
    }

    /// Map the synced `landingView` setting to a primary tab (Budget /
    /// Calendar / History live under More).
    private func landingTab() -> AppTab? {
        switch store.data.settings.landingView {
        case "dashboard": return .home
        case "bills": return .bills
        case "cards": return .cards
        case "payoff": return .payoff
        case "budget", "calendar", "history": return .more
        default: return nil
        }
    }

    /// DEBUG: `FH_TAB=bills` (etc.) picks the launch tab for screenshots.
    static func initialTab() -> AppTab {
        #if DEBUG
        if let raw = ProcessInfo.processInfo.environment["FH_TAB"],
           let t = AppTab(rawValue: raw) {
            return t
        }
        #endif
        return .home
    }
}
