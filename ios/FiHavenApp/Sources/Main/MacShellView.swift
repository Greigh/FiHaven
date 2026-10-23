#if os(macOS)
import SwiftUI
import FiHavenCore

/// A screen the Mac window can show.
///
/// Raw-string backed so the window reopens where the user left off — an
/// `@AppStorage` or `UserDefaults` value can't hold a case with a payload.
/// The names are the ones `FH_SCREEN` takes on both platforms, so one screen
/// list sweeps the phone and the Mac: `pro` for FiHaven Pro (the iOS More row
/// calls it that, and `getpro` is still accepted because it is the name this
/// enum wrote to `fh_mac_screen` before the iPhone sweep existed, and because
/// it is still the *tab tag* the phone shell gives the Free-only bottom slot).
enum MacScreen: Hashable {
    case tab(TabItem)
    case pro
    case settings
    case about

    var rawValue: String {
        switch self {
        case .tab(let item): return item.rawValue
        case .pro: return "pro"
        case .settings: return "settings"
        case .about: return "about"
        }
    }

    init?(rawValue: String) {
        switch rawValue {
        case "pro", "getpro": self = .pro
        case "settings": self = .settings
        case "about": self = .about
        default:
            guard let item = TabItem(rawValue: rawValue) else { return nil }
            self = .tab(item)
        }
    }

    /// `menuTitle`, not `title`: the sidebar is wide, so it gets the
    /// unambiguous name ("Account Balances", not "Balances").
    var title: String {
        switch self {
        case .tab(let item): return item.menuTitle
        case .pro: return "FiHaven Pro"
        case .settings: return "Settings"
        case .about: return "About & licenses"
        }
    }

    var symbol: String {
        switch self {
        case .tab(let item): return item.symbol
        case .pro: return "crown.fill"
        case .settings: return "gearshape.fill"
        case .about: return "info.circle.fill"
        }
    }
}

/// The sidebar's selection, owned by the app rather than by the window.
///
/// `.commands` lives on the scene, so the mac menu bar can only reach state the
/// `App` struct owns — a `@State` inside `MacShellView` would leave the Go menu
/// with nothing to drive.
@MainActor
final class MacNavigation: ObservableObject {
    private static let key = "fh_mac_screen"

    /// Whether this launch opened where the user left off (or was aimed at a
    /// screen by the debug hooks). When it did, the shell leaves the selection
    /// alone; when it didn't, the synced `landingView` setting gets its say on
    /// the first data load, exactly as it does on iOS.
    let restored: Bool

    @Published var screen: MacScreen? = .tab(.dashboard) {
        didSet { UserDefaults.standard.set(screen?.rawValue ?? "", forKey: Self.key) }
    }

    /// The debug overrides come first so screenshots stay scriptable, then the
    /// remembered screen, then Home until `landingView` arrives.
    init() {
        #if DEBUG
        let env = ProcessInfo.processInfo.environment
        if let raw = env["FH_SCREEN"] ?? env["FH_TAB"] ?? env["FH_ROUTE"], let screen = MacScreen(rawValue: raw) {
            self.screen = screen
            self.restored = true
            return
        }
        #endif
        let saved = UserDefaults.standard.string(forKey: Self.key) ?? ""
        if let screen = MacScreen(rawValue: saved) {
            self.screen = screen
            self.restored = true
            return
        }
        self.restored = false
    }

    /// Move one screen along `order`, wrapping at both ends. Backs the ⌘⇧]
    /// and ⌘⇧[ pair, which is how every tabbed Mac app steps through its
    /// screens without a trip to the sidebar.
    func advance(by delta: Int, in order: [MacScreen]) {
        guard !order.isEmpty else { return }
        let current = order.firstIndex { $0 == screen }
        let base = current ?? (delta > 0 ? -1 : 0)
        screen = order[((base + delta) % order.count + order.count) % order.count]
    }
}

/// The macOS shell: a two-column window whose sidebar is the whole screen
/// catalog.
///
/// The iPad keeps `MainTabView`'s adaptable `TabView`, which is the right
/// answer there. On the Mac the same thing would have meant a *phone* catalog
/// driving a desktop window — four bottom-bar slots, one of them spent on a
/// "Get Pro" tab for Free users, the other ten screens folded into a "More"
/// list. The Mac has room to show all fourteen at once, so it does.
///
/// The ordering is still the user's own, though: the sidebar opens with the
/// tabs they put in the phone's bottom bar, then everything else under More.
/// That way the two platforms agree about which screens matter to them.
struct MacShellView: View {
    let user: User
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var billing: StoreManager
    @EnvironmentObject var nav: MacNavigation
    @State private var refreshing = false
    @State private var didApplyLanding = false
    /// When this window last pulled from the server. Shown in the window's
    /// subtitle, which is where a Mac app answers "am I looking at stale
    /// numbers?" — the phone answers it with pull-to-refresh, and there is no
    /// pull on a Mac.
    @State private var syncedAt: Date?
    /// The sidebar's search field — a Mac column with fourteen screens is
    /// something people expect to be able to type into.
    @State private var screenQuery = ""

    private var split: (bottom: [TabItem], overflow: [TabItem]) {
        resolveTabs(saved: store.data.settings.tabs)
    }

    /// How wide the source list is, in points, and why: the narrowest width at
    /// which nothing in it is cut off. See the use in `body`.
    static let sidebarWidth: CGFloat = 236

    var body: some View {
        NavigationSplitView {
            // The footer is a *sibling* of the rows rather than a
            // `safeAreaInset` on them.
            //
            // A scroll view does not take SwiftUI's safe-area inset: pinning
            // the footer with `safeAreaInset(edge: .bottom)` drew it straight
            // over the last rows, so "Suggest a feature" ended up printed on
            // top of the credit. Stacked instead, the catalog gets the room
            // above the footer and scrolls inside it, and the column's own
            // material stays behind the footer without being asked for.
            //
            // The footer is still not a list row: it is the bottom of the
            // column, not another destination, and a sidebar row is a single
            // line tall — the Pro card's second line was truncated to an
            // ellipsis inside the list.
            VStack(spacing: 0) {
                // A `ViewThatFits`, not a `ScrollView`: on this macOS the
                // sidebar column's scroll container never composites — the
                // rows it holds are in the view tree but paint nothing, and
                // the column reads as a white blank. The catalog is ~660pt
                // tall against a ~790pt column, so it nearly always fits on
                // the plain stack; the scroll fallback exists for very small
                // windows, where a clipped list beats a blank one.
                ViewThatFits(in: .vertical) {
                    VStack(alignment: .leading, spacing: 2) {
                        sidebar
                    }
                    ScrollView(.vertical) {
                        VStack(alignment: .leading, spacing: 2) {
                            sidebar
                        }
                    }
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                sidebarFooter
            }
            .background(Theme.bg)
            .navigationTitle("FiHaven")
            // The column's width, and why it is a floor as well as a default.
            //
            // `navigationSplitViewColumnWidth` on its own only declares the
            // range a *drag* is allowed: the column still opened at whatever
            // its content asked for, and a `List` in the sidebar style asks
            // for almost nothing — 144pt, below the 210 minimum declared
            // right here. At that width the catalog is a column of hints:
            // "Subscriptio…", "Account…", an email as "ipad@exa…", and the Pro
            // card's own two lines broken into four. So the width is stated
            // once, as a constant, and put on the content as a minimum width
            // as well — the constant is what the column lays out to, and the
            // minimum is what keeps a drag from putting it back.
            //
            // 236pt is what the longest row needs: "Account Balances" with
            // its count badge and the list's own insets, the account header's
            // email, and the Pro card's longer line, each on one line.
            .frame(minWidth: Self.sidebarWidth)
            .navigationSplitViewColumnWidth(min: Self.sidebarWidth, ideal: Self.sidebarWidth, max: 340)
            .searchable(text: $screenQuery, placement: .sidebar, prompt: "Screens")
        } detail: {
            // The banners ride above the content, not above the split view.
            // Wrapping the split view is what let the sync banner push the
            // titlebar down out of the window's unified toolbar style; inside
            // the detail column the chrome stays where AppKit put it and a
            // banner behaves like a content notice, which is what it is.
            //
            // They are a `safeAreaInset` rather than a `VStack` sibling, and
            // that is measured rather than tidiness: a rigid-height child in
            // front of the stack is what makes the *whole* column report its
            // content's own height as its ideal, and the window then proposes
            // a 1440x2984 window for a 1440x900 one — which the frame guard
            // spends the run undoing, hundreds of times, while the screen
            // captures blank.
            //
            // The inset host is wrapped in a `GeometryReader` for the same
            // reason: it reports a 10x10 ideal, which is what clamps the
            // column's. The proposal then stops (0 lines, against 8 before the
            // clamp, each one a layout pass and a frame change) and the screens
            // below still measure against the pane they are given, which the
            // sweep checks.
            GeometryReader { _ in
                NavigationStack {
                    detail
                }
                .safeAreaInset(edge: .top, spacing: 0) {
                    VStack(spacing: 0) {
                        SessionNotSavedBanner()
                        SyncOfflineBanner()
                    }
                }
            }
            // The second line of the window title. On the phone, "is this
            // stale?" is answered by pulling the list down; a Mac window has no
            // pull, so the titlebar says when the numbers arrived.
            .navigationSubtitle(syncSubtitle)
                // Selecting another screen starts at that screen's root: a
                // pushed settings page or editor belongs to the screen that
                // opened it, and carrying it into a different one is how you
                // end up looking at Household while the sidebar says Payoff.
                .id(nav.screen)
                // The window's own toolbar item. Every screen brings its own
                // actions (sort, filter, search) and those land here too, but
                // none of them refreshes: on iOS a phone can pull the list
                // down, and on the Mac "pull down" is not a gesture. Without
                // this, ⌘R was the only way to re-sync and nothing on screen
                // said so.
                .toolbar {
                    // Named so `FH_DUMP_VIEWS` can show it really is on the
                    // Mac toolbar, and so AppKit can restore its placement.
                    ToolbarItem(id: "fh.refresh", placement: .primaryAction) {
                        Button {
                            Task {
                                refreshing = true
                                await store.load()
                                syncedAt = Date()
                                refreshing = false
                            }
                        } label: {
                            if refreshing {
                                ProgressView().controlSize(.small)
                            } else {
                                Image(systemName: "arrow.clockwise")
                            }
                        }
                        .disabled(refreshing)
                        .help("Refresh data (⌘R)")
                        .accessibilityLabel("Refresh data")
                    }
                }
        }
        // Equal columns: a `NavigationSplitView` otherwise lets the sidebar
        // take whatever the detail does not ask for, and every screen here is
        // `maxWidth: .infinity`, so the sidebar would keep growing.
        .navigationSplitViewStyle(.balanced)
        .presetUpdatePrompt()
        // Open at the user's saved default view on a first launch, the way
        // `MainTabView` does. Later launches reopen the remembered screen, so
        // this runs at most once and only when nothing was restored.
        .task(id: store.loaded) {
            guard store.loaded else { return }
            syncedAt = Date()
            // Open at the user's saved default view on a first launch, the way
            // `MainTabView` does. Later launches reopen the remembered screen,
            // so this runs at most once and only when nothing was restored.
            guard !didApplyLanding else { return }
            didApplyLanding = true
            guard !nav.restored,
                  let raw = store.data.settings.landingView,
                  let item = TabItem(rawValue: raw) else { return }
            nav.screen = .tab(item)
        }
        // Keyed on `loaded` so the counts below are the real ones: this log
        // used to run before the first fetch returned and always reported an
        // empty catalog. The entitlement is in the key for the same reason:
        // the dev override lands *after* the catalog does, so a key of
        // `loaded` alone reported `proUpsell=true` for a run that was Pro for
        // every capture it went on to take.
        .task(id: "\(store.loaded)|\(billing.isPro)") {
            guard store.loaded else { return }
            #if DEBUG
            // `FH_SNAPSHOT_SIDEBAR` photographs the sidebar on its own; this is
            // the part a picture cannot tell you — the grouping, the order, the
            // counts, and the selection.
            let tabs = split.bottom.map(\.rawValue).joined(separator: ",")
            let rest = split.overflow.map(\.rawValue).joined(separator: ",")
            let badges = TabItem.allCases
                .compactMap { item -> String? in
                    guard let n = badge(for: .tab(item)), n > 0 else { return nil }
                    return "\(item.rawValue)=\(n)"
                }
                .joined(separator: ",")
            fhLog("[MacShell] tabs=[\(tabs)] more=[\(rest)] badges=[\(badges)] proUpsell=\(!billing.isPro) selected=\(nav.screen?.rawValue ?? "none")")
            #endif
        }
        #if DEBUG
        // The snapshot writer reports what the detail actually shows; iOS's
        // tab shell feeds it in `MainTabView`, and this is that shell's mirror.
        .task { SweepProbe.renderedScreen = nav.screen?.rawValue ?? "none" }
        .onChange(of: nav.screen) { _, new in
            SweepProbe.renderedScreen = new?.rawValue ?? "none"
        }
        #endif
    }

    // ── Sidebar ──────────────────────────────────────────────────────

    /// Whether a sidebar entry survives the search field. An empty query keeps
    /// everything, so the column is the full catalog whenever it is not in use.
    private func matchesSearch(_ title: String) -> Bool {
        let q = screenQuery.trimmingCharacters(in: .whitespaces)
        return q.isEmpty || title.localizedCaseInsensitiveContains(q)
    }

    private var shownBottom: [TabItem] { split.bottom.filter { matchesSearch(MacScreen.tab($0).title) } }
    private var shownOverflow: [TabItem] { split.overflow.filter { matchesSearch(MacScreen.tab($0).title) } }

    /// The four external links, in the order they appear. A list rather than
    /// four literals so one query can narrow them the way it narrows screens.
    private var helpLinks: [(url: URL, title: String, icon: String)] {
        [(MoreLink.website, "Website", "globe"),
         (MoreLink.github, "GitHub", "chevron.left.forwardslash.chevron.right"),
         (MoreLink.bugReport, "Report a bug", "ladybug.fill"),
         (MoreLink.suggestion, "Suggest a feature", "lightbulb.fill")]
            .filter { matchesSearch($0.1) }
    }

    @ViewBuilder
    private var sidebar: some View {
        // Whose data this is, and on what plan. The toolbar says which screen
        // you are on, so the sidebar says what you are looking at it as — the
        // one place Free/Pro is visible without opening Settings. It goes away
        // while searching: it is not a screen and there is nothing to match.
        if screenQuery.isEmpty {
            accountHeader
        }

        // Caption labels rather than `Section`s — the rows live in a plain
        // stack (see `body`), not a `List`, so grouping is spelled out.

        if !shownBottom.isEmpty {
            ForEach(shownBottom) { row(.tab($0)) }
        }

        if !shownOverflow.isEmpty {
            sidebarCaption("More")
            ForEach(shownOverflow) { row(.tab($0)) }
        }

        if matchesSearch(MacScreen.settings.title) || matchesSearch(MacScreen.about.title) {
            if matchesSearch(MacScreen.settings.title) { row(.settings) }
            if matchesSearch(MacScreen.about.title) { row(.about) }
        }

        if !helpLinks.isEmpty {
            sidebarCaption("Help & feedback")
            ForEach(helpLinks, id: \.icon) { link in
                linkRow(link.url, link.title, link.icon)
            }
        }
    }

    /// The muted group label that stands where a `Section` header would —
    /// it is not a row, so selection can never land on it.
    private func sidebarCaption(_ title: String) -> some View {
        Text(title.uppercased())
            .font(Theme.ui(10, weight: .bold))
            .tracking(0.6)
            .foregroundStyle(Theme.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 8)
            .padding(.top, 14)
            .padding(.bottom, 4)
            .accessibilityAddTraits(.isHeader)
    }

    /// What sits below the list: the Pro pitch for Free users, then the credit.
    ///
    /// Free users get the pitch as a card rather than a catalog row: it is a
    /// place to go, not a screen they own, and on the phone it costs them a
    /// bottom-bar slot. Subscribers never see it, and "FiHaven Pro" is not in
    /// the list either way.
    @ViewBuilder
    private var sidebarFooter: some View {
        VStack(spacing: 8) {
            Divider()
            if !billing.isPro {
                proCard
            }
            VStack(spacing: 2) {
                // One line, with the build beneath it: the sidebar is
                // `sidebarWidth` wide and the web's sentence needs two lines
                // here.
                MadeWithLove(style: .compact)
                // What build this is, where a Mac app's sidebar conventionally
                // says it. The About screen carries the same numbers with the
                // licensing beside them.
                Text(appVersion)
                    .font(Theme.mono(10))
                    .foregroundStyle(Theme.muted)
                    .accessibilityLabel("Version \(appVersion)")
            }
            .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 10)
        .padding(.top, 8)
        .padding(.bottom, 10)
    }

    /// "1.6.5 (56)" — the marketing version and the build, as the About screen
    /// reads them.
    private var appVersion: String {
        let v = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—"
        let b = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""
        return b.isEmpty ? v : "\(v) (\(b))"
    }

    /// The signed-in account, at the top of the sidebar.
    ///
    /// The plan badge sits beside the name rather than at the end of the row:
    /// trailing, it took its width out of the email, and "ipad…com" is not an
    /// address anyone can check.
    private var accountHeader: some View {
        HStack(alignment: .top, spacing: 10) {
            BrandMark(size: 30)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text("FiHaven")
                        .font(Theme.ui(14, weight: .bold))
                        .foregroundStyle(Theme.text)
                    planBadge
                }
                Text(user.email.isEmpty ? "Signed in" : user.email)
                    .font(Theme.ui(11))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(user.email.isEmpty ? "FiHaven" : user.email), \(billing.isPro ? "Pro" : "Free") plan")
    }

    private var planBadge: some View {
        let tint = billing.isPro ? Theme.accent : Theme.muted
        return Text(billing.isPro ? "PRO" : "FREE")
            .font(Theme.ui(10, weight: .bold))
            .tracking(0.8)
            .foregroundStyle(tint)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(tint.opacity(0.14), in: Capsule())
    }

    /// What Pro unlocks, and the way to it. Kept to one clause per line: a
    /// sidebar card is `sidebarWidth`–340pt wide and is not the place for a
    /// sales page.
    private var proCard: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 6) {
                Image(systemName: "crown.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.accent)
                Text("FiHaven Pro")
                    .font(Theme.ui(13, weight: .bold))
                    .foregroundStyle(Theme.text)
            }
            // Two short lines rather than one long one: a sidebar row is one
            // line tall unless the break is explicit.
            Text("Payoff dates & calendar\nFull history & bank links")
                .font(Theme.ui(11))
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                nav.screen = .pro
            } label: {
                HStack(spacing: 3) {
                    Text("See plans")
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9, weight: .bold))
                }
                .font(Theme.ui(12, weight: .semibold))
                .foregroundStyle(Theme.accent)
            }
            .ctPlainButton()
            .accessibilityHint("Opens the FiHaven Pro screen")
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radiusCard, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radiusCard, style: .continuous)
                .stroke(Theme.border, lineWidth: 1)
        )
    }

    /// A catalog row, with the count it leads with where there is one.
    private func row(_ screen: MacScreen) -> some View {
        MacSidebarRow(
            title: screen.title,
            icon: screen.symbol,
            count: badge(for: screen),
            selected: nav.screen == screen
        ) {
            nav.screen = screen
        }
    }

    /// The number a sidebar row carries — only where it is the same count the
    /// screen behind it leads with, because a badge that disagrees with its
    /// own screen is worse than no badge at all.
    private func badge(for screen: MacScreen) -> Int? {
        switch screen {
        case .tab(.dashboard): return store.dashboardUpcoming.count
        case .tab(.bills): return unpaidBills
        case .tab(.cards): return store.activeCreditCards.count
        case .tab(.loans): return store.activeCards.count - store.activeCreditCards.count
        case .tab(.balances): return store.data.accounts.count
        default: return nil
        }
    }

    /// Bills not yet paid this period — what the Bills screen's progress header
    /// counts down.
    private var unpaidBills: Int {
        store.activeBills
            .filter { store.paidState(type: "bill", refId: String($0.id)) != .full }
            .count
    }

    /// An external link. Styled like every other row (`Link` would tint these
    /// blue and make them the loudest thing in the sidebar) with a small arrow
    /// saying it leaves the app.
    private func linkRow(_ url: URL, _ title: String, _ icon: String) -> some View {
        Link(destination: url) {
            MacSidebarRowChrome(selected: false) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .medium))
                    .frame(width: 18, alignment: .center)
                    .foregroundStyle(Theme.muted)
                Text(title)
                    .font(Theme.ui(13))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                Spacer(minLength: 4)
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(Theme.muted)
            }
        }
        .accessibilityHint("Opens in browser")
    }

    /// "Synced 8:31 PM" under the window title, or nothing before the first
    /// fetch has landed.
    private var syncSubtitle: String {
        guard let syncedAt else { return store.loaded ? "Synced" : "Syncing…" }
        return "Synced \(syncedAt.formatted(date: .omitted, time: .shortened))"
    }

    // ── Detail ───────────────────────────────────────────────────────
    @ViewBuilder
    private var detail: some View {
        Group {
            switch nav.screen {
            case .some(.tab(let item)): item.macDestination
            case .some(.pro): ProView()
            case .some(.settings): SettingsView(user: user)
            case .some(.about): AboutView()
            case nil:
                ContentUnavailableView(
                    "No screen selected",
                    systemImage: "sidebar.left",
                    description: Text("Pick a screen from the sidebar.")
                )
            }
        }
        // The pane paints its own canvas: a `Table` fills with its own
        // surface, but a screen whose content stops early — a summary strip,
        // a `.rows` table — would otherwise show the bare split-view backdrop
        // through it, which is window-material, not theme.
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg.ignoresSafeArea())
    }
}

/// One line of the source list — the shape `List(selection:)` could not
/// render. A real `Button` row means the hover and selected pills are the
/// app's own, and VoiceOver gets a labelled control rather than a cell.
private struct MacSidebarRow: View {
    let title: String
    let icon: String
    var count: Int? = nil
    var selected: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            MacSidebarRowChrome(selected: selected) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .medium))
                    .frame(width: 18, alignment: .center)
                    .foregroundStyle(selected ? Theme.accent : Theme.muted)
                Text(title)
                    .font(Theme.ui(13))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                Spacer(minLength: 4)
                if let count, count > 0 {
                    Text(count, format: .number)
                        .font(Theme.mono(11))
                        .foregroundStyle(Theme.muted)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 1)
                        .background(Theme.surface2, in: Capsule())
                }
            }
        }
        .ctPlainButton()
    }
}

/// The row's frame and its hover/selected pill, shared by the button rows
/// and the external-link rows so the two stay identical.
private struct MacSidebarRowChrome<Content: View>: View {
    let selected: Bool
    @ViewBuilder var content: () -> Content
    @State private var hovering = false

    var body: some View {
        HStack(spacing: 8, content: content)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
            .background(
                RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .fill(selected ? Theme.accent.opacity(0.16)
                          : hovering ? Theme.surface2.opacity(0.7) : .clear)
            )
            .onHover { hovering = $0 }
            .animation(.easeOut(duration: 0.12), value: hovering)
    }
}

#endif
