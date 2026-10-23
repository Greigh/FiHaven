import SwiftUI
import FiHavenCore

/// Signed-in tab shell. On iPhone the bottom bar is user-customizable (see
/// TabsEditorView): it renders the saved tab order, then — for Free users —
/// an always-present "Get Pro" tab, with everything else under the system's
/// More tab. In a regular-width context (iPad, foldable inner display) the
/// same declarations become a labeled sidebar via `.sidebarAdaptable`, where
/// the whole catalog is directly reachable.
/// The app-owned navigation state the scene's keyboard commands write to —
/// same division of labour as `MacNavigation`/`GoCommands` on macOS: commands
/// live on the scene (the only place `.commands` can hang), the tab selection
/// lives in `MainTabView`, and this object is the postbox between them.
@MainActor
final class ShellNavigation: ObservableObject {
    /// The tag `MainTabView` is showing, published back so the commands can
    /// step relative to where the user actually is.
    @Published var selected = "dashboard"
    /// A one-shot target set by a keyboard command; `MainTabView` applies it
    /// and clears it.
    @Published var requested: String?

    /// Catalog order — the order the commands walk. The user's own ordering
    /// lives on `store`, which does not exist at scene level; same compromise
    /// as the Mac's `GoCommands`.
    static func order(for isPro: Bool) -> [String] {
        TabItem.allCases.map(\.rawValue) + [isPro ? "pro" : "getpro", "settings", "about"]
    }

    func advance(by delta: Int, for isPro: Bool) {
        let order = Self.order(for: isPro)
        let base = order.firstIndex(of: requested ?? selected) ?? (delta > 0 ? -1 : 0)
        requested = order[((base + delta) % order.count + order.count) % order.count]
    }
}

struct MainTabView: View {
    let user: User
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var billing: StoreManager
    @EnvironmentObject private var shellNav: ShellNavigation
    @State private var selection: String = MainTabView.initialTab()
    @State private var debugPaywall = false
    @State private var didApplyLanding = false
    /// A launch-time target (debug screen or synced landing view) that must
    /// be re-asserted when `isPro` settles: the flip rebuilds the tab set,
    /// moving destinations between the bar and More, and a section
    /// selection made before it can stick to the slot instead of the tab.
    @State private var pendingSelection: String?

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
                    Tab(item.title, systemImage: item.symbol, value: item.rawValue) {
                        NavigationStack { item.destination }
                    }
                }
                if !billing.isPro {
                    Tab("Get Pro", systemImage: "crown.fill", value: "getpro") {
                        NavigationStack { ProView() }
                    }
                }
                // The rest are top-level Tabs too: compact puts them under the
                // system's More overflow and the sidebar lists them before the
                // app group. They must not sit in the More section — on iPad
                // the last bar tab's value resolves into the section's first
                // child instead of its own destination.
                ForEach(moreItems) { item in
                    Tab(item.menuTitle, systemImage: item.symbol, value: item.rawValue) {
                        NavigationStack { item.destination }
                    }
                }
                TabSection("App") {
                    Tab("Settings", systemImage: "gearshape.fill", value: "settings") {
                        NavigationStack { SettingsView(user: user) }
                    }
                    if billing.isPro {
                        Tab("FiHaven Pro", systemImage: "crown.fill", value: "pro") {
                            NavigationStack { ProView() }
                        }
                    }
                    Tab("About & licenses", systemImage: "info.circle.fill", value: "about") {
                        NavigationStack { AboutView() }
                    }
                }
            }
            .tint(Theme.accent)
            .tabViewStyle(.sidebarAdaptable)
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
                pendingSelection = sel
                didApplyLanding = true
                fhLog("[Shell] screen=\(raw) via=\(via)")
            }
            SweepProbe.renderedScreen = selection
            #endif
        }
        #if DEBUG
        .onChange(of: selection) { _, new in SweepProbe.renderedScreen = new }
        #endif
        // The scene's Go commands write `requested`; apply it if the tag is a
        // live tab, then clear so the same key can repeat later. `onReceive`
        // over `onChange` because an Optional value resolves a different
        // `onChange` overload on the macOS SDK.
        .onReceive(shellNav.$requested) { req in
            guard let req else { return }
            if ShellNavigation.order(for: billing.isPro).contains(req) { selection = req }
            shellNav.requested = nil
        }
        .onChange(of: selection) { _, new in shellNav.selected = new }
        // Open to the user's saved default view, once the data has loaded.
        .task(id: store.loaded) {
            guard store.loaded else { return }
            if let t = pendingSelection {
                selection = t
                pendingSelection = nil
            }
            guard !didApplyLanding, let t = landingSelection() else { return }
            didApplyLanding = true
            selection = t
            pendingSelection = t
        }
        .onChange(of: billing.isPro) { _, _ in
            if let t = pendingSelection {
                selection = t
                pendingSelection = nil
            }
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

    /// Map the synced `landingView` setting to a tab tag. Every destination
    /// is a real tab now — ones that don't fit the bottom bar live under the
    /// system's More tab (compact) or the More sidebar section (regular).
    private func landingSelection() -> String? {
        guard let lv = store.data.settings.landingView, let item = TabItem(rawValue: lv) else { return nil }
        return item.rawValue
    }

    #if DEBUG
    /// `FH_SCREEN`/`FH_TAB`/`FH_ROUTE` → (name, shell tag, route). Every
    /// destination is a real tab whose tag is its catalog id (`via=tab`) —
    /// whether it sits in the bottom bar or under More is layout, not
    /// routing. `nil` means the name doesn't route, so the capture's
    /// `screen=` says what actually rendered instead.
    private func debugSelection() -> (String, String, String)? {
        let e = ProcessInfo.processInfo.environment
        guard let raw = e["FH_SCREEN"] ?? e["FH_TAB"] ?? e["FH_ROUTE"] else { return nil }
        if raw == "paywall" { return nil }
        if raw == "getpro" { return billing.isPro ? nil : (raw, "getpro", "tab") }
        if let item = TabItem(rawValue: raw) { return (raw, item.rawValue, "tab") }
        if raw == "settings" || raw == "about" { return (raw, raw, "tab") }
        if raw == "pro" { return billing.isPro ? (raw, "pro", "tab") : (raw, "getpro", "tab") }
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

#if os(iOS)
/// The external-keyboard half of iPad support — the "Go" menu an attached
/// keyboard gets. Mirror of `GoCommands` on macOS: the same ⌘⇧] / ⌘⇧[ walk
/// and ⌘, for Settings. On iPadOS these surface in the keyboard-shortcut HUD
/// (hold ⌘); on a phone they simply never appear.
struct ShellGoCommands: Commands {
    @ObservedObject var nav: ShellNavigation
    @ObservedObject var billing: StoreManager

    var body: some Commands {
        CommandMenu("Go") {
            Button("Next Screen") { nav.advance(by: 1, for: billing.isPro) }
                .keyboardShortcut("]", modifiers: [.command, .shift])
            Button("Previous Screen") { nav.advance(by: -1, for: billing.isPro) }
                .keyboardShortcut("[", modifiers: [.command, .shift])
            Divider()
            Button("Settings") { nav.requested = "settings" }
                .keyboardShortcut(",", modifiers: .command)
        }
    }
}
#endif
