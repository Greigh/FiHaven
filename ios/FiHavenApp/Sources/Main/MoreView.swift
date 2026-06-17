import SwiftUI
import FiHavenCore

/// Destinations reachable from the "More" tab.
enum MoreDest: Hashable { case tab(TabItem), pro, settings, about }

/// External links surfaced from "More" → "Help & feedback".
private enum MoreLink {
    static let website = URL(string: "https://fihaven.app/")!
    static let github = URL(string: "https://github.com/Greigh/FiHaven")!
    static let bugReport = URL(string: "https://github.com/Greigh/FiHaven/issues/new?template=bug_report.md")!
    static let suggestion = URL(string: "https://github.com/Greigh/FiHaven/issues/new?template=feature_request.md")!
}

/// The "More" tab: the overflow tabs (those not in the bottom bar) plus
/// FiHaven Pro and Settings.
struct MoreView: View {
    let user: User
    var overflow: [TabItem] = []
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            List {
                if !overflow.isEmpty {
                    Section {
                        ForEach(overflow) { item in
                            row(.tab(item), item.title, item.symbol)
                        }
                    }
                }
                Section {
                    row(.pro, "FiHaven Pro", "crown.fill")
                    row(.settings, "Settings", "gearshape.fill")
                }

                Section {
                    linkRow(MoreLink.website, "Website", "globe")
                    linkRow(MoreLink.github, "GitHub", "chevron.left.forwardslash.chevron.right")
                    linkRow(MoreLink.bugReport, "Report a bug", "ladybug.fill")
                    linkRow(MoreLink.suggestion, "Suggest a feature", "lightbulb.fill")
                    row(.about, "About & licenses", "info.circle.fill")
                } header: {
                    Text("Help & feedback")
                } footer: {
                    MadeWithLove()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 8)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Theme.bg.ignoresSafeArea())
            .brandedNavigationBar("More")
            .navigationDestination(for: MoreDest.self) { dest in
                switch dest {
                case .tab(let item): item.destination
                case .pro: ProView()
                case .settings: SettingsView(user: user)
                case .about: AboutView()
                }
            }
        }
        .onAppear(perform: applyDebugRoute)
    }

    private func row(_ dest: MoreDest, _ title: String, _ icon: String) -> some View {
        NavigationLink(value: dest) {
            Label {
                Text(title).font(Theme.ui(16)).foregroundStyle(Theme.text)
            } icon: {
                Image(systemName: icon).foregroundStyle(Theme.accent)
            }
        }
    }

    /// A row that opens an external URL in the browser.
    private func linkRow(_ url: URL, _ title: String, _ icon: String) -> some View {
        Link(destination: url) {
            Label {
                Text(title).font(Theme.ui(16)).foregroundStyle(Theme.text)
            } icon: {
                Image(systemName: icon).foregroundStyle(Theme.accent)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .trailing) {
                Image(systemName: "arrow.up.right")
                    .font(Theme.ui(12, weight: .semibold))
                    .foregroundStyle(Theme.muted)
            }
        }
    }

    /// DEBUG: `FH_ROUTE=budget` auto-pushes a sub-screen for screenshots.
    private func applyDebugRoute() {
        #if DEBUG
        guard path.isEmpty,
              let raw = ProcessInfo.processInfo.environment["FH_ROUTE"] else { return }
        if raw == "pro" { path.append(MoreDest.pro) }
        else if raw == "settings" { path.append(MoreDest.settings) }
        else if let item = TabItem(rawValue: raw) { path.append(MoreDest.tab(item)) }
        #endif
    }
}
