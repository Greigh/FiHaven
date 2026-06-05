import SwiftUI
import FiHavenCore

enum MoreRoute: String, Hashable { case pro, budget, calendar, history, settings }

/// The "More" tab: a menu linking to the secondary screens.
struct MoreView: View {
    let user: User
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            List {
                Section {
                    row(.pro, "FiHaven Pro", "crown.fill")
                    row(.budget, "Budget", "chart.pie.fill")
                    row(.calendar, "Calendar", "calendar")
                    row(.history, "History", "clock.arrow.circlepath")
                    row(.settings, "Settings", "gearshape.fill")
                } footer: {
                    MadeWithLove()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 18)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Theme.bg.ignoresSafeArea())
            .navigationTitle("More")
            .navigationDestination(for: MoreRoute.self) { route in
                switch route {
                case .pro: ProView()
                case .budget: BudgetView()
                case .calendar: ProGate(feature: .calendar) { CalendarView() }
                case .history: ProGate(feature: .history) { HistoryView() }
                case .settings: SettingsView(user: user)
                }
            }
        }
        .onAppear(perform: applyDebugRoute)
    }

    private func row(_ route: MoreRoute, _ title: String, _ icon: String) -> some View {
        NavigationLink(value: route) {
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
              let raw = ProcessInfo.processInfo.environment["FH_ROUTE"],
              let route = MoreRoute(rawValue: raw) else { return }
        path.append(route)
        #endif
    }
}
