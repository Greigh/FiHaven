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
            // A sweep's screen choice wins over the synced landingView, and
            // the via= line is how the run's log says where it went — the
            // table's "rendered" check reads it because a PNG cannot say
            // which screen it is.
            if let (raw, sel, via) = debugSelection() {
                selection = sel
                didApplyLanding = true
                fhLog("[Shell] screen=\(raw) via=\(via)")
            }
            SweepProbe.renderedScreen = selection
            #endif
        }
        #if DEBUG
        .onChange(of: selection) { _, new in SweepProbe.renderedScreen = new }
        #endif
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

    #if DEBUG
    /// `FH_SCREEN`/`FH_TAB`/`FH_ROUTE` → (name, shell tag, route). A bottom-bar
    /// tab selects itself (`via=tab`); a screen that lives under "More" selects
    /// `more` and MoreView pushes the destination onto its stack (`via=more`) —
    /// the same hop a tap takes. `nil` means the name doesn't route, so the
    /// capture's `screen=` says what actually rendered instead.
    private func debugSelection() -> (String, String, String)? {
        let e = ProcessInfo.processInfo.environment
        guard let raw = e["FH_SCREEN"] ?? e["FH_TAB"] ?? e["FH_ROUTE"] else { return nil }
        if raw == "paywall" { return nil }
        if raw == "getpro" { return billing.isPro ? nil : (raw, "getpro", "tab") }
        if let item = TabItem(rawValue: raw) {
            return shownBottom.contains(item)
                ? (raw, item.rawValue, "tab")
                : (raw, "more", "more")
        }
        if raw == "pro" || raw == "settings" || raw == "about" { return (raw, "more", "more") }
        return nil
    }
    #endif

    /// DEBUG: `FH_TAB=bills` (etc.) picks the launch tab for screenshots.
    static func initialTab() -> String {
        #if DEBUG
        if let raw = ProcessInfo.processInfo.environment["FH_TAB"] { return raw }
        #endif
        return "dashboard"
    }
}
