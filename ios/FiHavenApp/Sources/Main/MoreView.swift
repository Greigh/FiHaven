import SwiftUI
import FiHavenCore

/// Destinations reachable from the "More" tab.
enum MoreDest: Hashable { case tab(TabItem), pro, settings }

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
                } footer: {
                    MadeWithLove()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 8)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Theme.bg.ignoresSafeArea())
            .navigationTitle("More")
            .navigationDestination(for: MoreDest.self) { dest in
                switch dest {
                case .tab(let item): item.destination
                case .pro: ProView()
                case .settings: SettingsView(user: user)
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
