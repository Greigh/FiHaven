import SwiftUI
import FiHavenCore

/// Signed-in tab shell. The bottom bar is user-customizable (see
/// TabsEditorView): it renders the saved tab order, then — for Free users —
/// an always-present "Get Pro" tab, then "More" (the overflow + Settings).
struct MainTabView: View {
    let user: User
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var billing: StoreManager
    @State private var selection: String = MainTabView.initialTab()
    @State private var debugPaywall = false
    @State private var didApplyLanding = false

    // Free users give up one bottom slot to the "Get Pro" tab.
    private var bottomCount: Int { billing.isPro ? maxBottomTabs : maxBottomTabs - 1 }
    private var resolved: (bottom: [TabItem], overflow: [TabItem]) {
        resolveTabs(saved: store.data.settings.tabs)
    }
    private var shownBottom: [TabItem] { Array(resolved.bottom.prefix(bottomCount)) }
    /// Bottom tabs that didn't fit (Free fold) plus the rest live under More.
    private var moreItems: [TabItem] { Array(resolved.bottom.dropFirst(bottomCount)) + resolved.overflow }

    var body: some View {
        VStack(spacing: 0) {
            SyncOfflineBanner()
            TabView(selection: $selection) {
                ForEach(shownBottom) { item in
                    NavigationStack { item.destination }
                        .tag(item.rawValue)
                        .tabItem { Label(item.title, systemImage: item.symbol) }
                }
                if !billing.isPro {
                    NavigationStack { ProView() }
                        .tag("getpro")
                        .tabItem { Label("Get Pro", systemImage: "crown.fill") }
                }
                MoreView(user: user, overflow: moreItems)
                    .tag("more")
                    .tabItem { Label("More", systemImage: "ellipsis.circle.fill") }
            }
            .tint(Theme.accent)
        }
        .onAppear {
            #if DEBUG
            if ProcessInfo.processInfo.environment["FH_SCREEN"] == "paywall" {
                debugPaywall = true
            }
            #endif
        }
        // Open to the user's saved default view, once the data has loaded.
        .task(id: store.loaded) {
            guard store.loaded, !didApplyLanding, let t = landingSelection() else { return }
            didApplyLanding = true
            selection = t
        }
        .sheet(isPresented: $debugPaywall) { PaywallView() }
        .alert(
            store.presetUpdatePrompt.map { prompt in
                let label = [prompt.card.issuer, prompt.card.name].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
                return "Update rates for \"\(label.isEmpty ? "Card" : label)\"?"
            } ?? "Update rates?",
            isPresented: Binding(
                get: { store.presetUpdatePrompt != nil },
                set: { _ in }
            )
        ) {
            Button("Update rates") { store.acceptPresetUpdate() }
            Button("Keep mine", role: .cancel) { store.declinePresetUpdate() }
        } message: {
            if let prompt = store.presetUpdatePrompt {
                let catalog = "\(prompt.preset.issuer) \(prompt.preset.name)"
                let diff = Rewards.formatRateDiff(card: prompt.card, preset: prompt.preset)
                Text("The FiHaven catalog for \(catalog) has newer rates.\n\n\(diff.isEmpty ? "Rates changed in the shared catalog." : diff)\n\nUpdate applies catalog rates to this card. Keep mine leaves your numbers alone.")
            }
        }
    }

    /// Map the synced `landingView` setting to a tab tag. If that tab isn't
    /// in the bottom bar, land on "More" (where it now lives).
    private func landingSelection() -> String? {
        guard let lv = store.data.settings.landingView, let item = TabItem(rawValue: lv) else { return nil }
        return shownBottom.contains(item) ? item.rawValue : "more"
    }

    /// DEBUG: `FH_TAB=bills` (etc.) picks the launch tab for screenshots.
    static func initialTab() -> String {
        #if DEBUG
        if let raw = ProcessInfo.processInfo.environment["FH_TAB"] { return raw }
        #endif
        return "dashboard"
    }
}
