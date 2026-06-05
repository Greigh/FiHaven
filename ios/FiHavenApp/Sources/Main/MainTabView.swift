import SwiftUI
import FiHavenCore

enum AppTab: String, Hashable { case home, bills, cards, payoff, more }

/// Signed-in tab shell. Five primary tabs; Budget / Calendar / History /
/// Settings live under "More".
struct MainTabView: View {
    let user: User
    @State private var tab: AppTab = MainTabView.initialTab()
    @State private var debugPaywall = false

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
            if ProcessInfo.processInfo.environment["CT_SCREEN"] == "paywall" {
                debugPaywall = true
            }
            #endif
        }
        .sheet(isPresented: $debugPaywall) { PaywallView() }
    }

    /// DEBUG: `CT_TAB=bills` (etc.) picks the launch tab for screenshots.
    static func initialTab() -> AppTab {
        #if DEBUG
        if let raw = ProcessInfo.processInfo.environment["CT_TAB"],
           let t = AppTab(rawValue: raw) {
            return t
        }
        #endif
        return .home
    }
}
