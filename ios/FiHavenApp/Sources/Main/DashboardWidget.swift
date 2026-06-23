import SwiftUI
import FiHavenCore

/// The dashboard widget catalog for the "Widgets" layout. The order +
/// enabled set live in settings.dashboardWidgets (shared with web/Android);
/// each platform renders the ids it supports and ignores the rest.
enum DashboardWidget {
    /// (id, label) pairs in catalog order — parity with the web catalog.
    static let catalog: [(id: String, label: String)] = [
        ("stats", "Overview tiles"),
        ("cashflow", "This period's payments"),
        ("alerts", "Alerts"),
        ("upcoming", "Upcoming payments"),
        ("networth", "Net worth"),
        ("spending", "Spending"),
        ("goals", "Savings goals"),
        ("subscriptions", "Subscriptions"),
        ("incomeHistory", "Income history"),
    ]

    static let allIDs = catalog.map { $0.id }
    static let defaults = ["stats", "cashflow", "alerts", "upcoming"]

    static func label(_ id: String) -> String {
        catalog.first { $0.id == id }?.label ?? id
    }

    /// Ordered, de-duped enabled widget ids (falls back to the defaults).
    static func enabled(_ settings: Settings) -> [String] {
        let src = settings.dashboardWidgets.isEmpty ? defaults : settings.dashboardWidgets
        let valid = Set(allIDs)
        var seen = Set<String>()
        return src.filter { valid.contains($0) && seen.insert($0).inserted }
    }
}

/// Editor: choose the layout, then toggle + reorder widgets (Widgets mode).
struct DashboardLayoutView: View {
    @EnvironmentObject var store: AppStore
    @State private var order: [String] = []
    @State private var enabled: Set<String> = []

    var body: some View {
        List {
            Section {
                Picker("Layout", selection: Binding(
                    get: { store.data.settings.dashboardLayout },
                    set: { store.setDashboardLayout($0) }
                )) {
                    Text("Classic").tag("classic")
                    Text("Widgets").tag("widgets")
                }
                .pickerStyle(.segmented)
            } footer: {
                Text("Classic is a fixed layout. Widgets lets you choose which cards appear and reorder them.")
            }

            if store.data.settings.dashboardLayout == "widgets" {
                Section {
                    ForEach(order, id: \.self) { id in
                        Toggle(DashboardWidget.label(id), isOn: Binding(
                            get: { enabled.contains(id) },
                            set: { on in
                                if on { enabled.insert(id) } else { enabled.remove(id) }
                                persist()
                            }
                        )).tint(Theme.accent)
                    }
                    .onMove { from, to in
                        order.move(fromOffsets: from, toOffset: to)
                        persist()
                    }
                } header: {
                    Text("Widgets — toggle and drag to reorder")
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.bg.ignoresSafeArea())
        .environment(\.editMode, .constant(.active))
        .brandedNavigationBar("Dashboard")
        .onAppear(perform: seed)
    }

    private func seed() {
        let on = DashboardWidget.enabled(store.data.settings)
        var ordered = on
        for id in DashboardWidget.allIDs where !ordered.contains(id) { ordered.append(id) }
        order = ordered
        enabled = Set(on)
    }

    // Persist as the enabled ids in the current display order.
    private func persist() {
        store.setDashboardWidgets(order.filter { enabled.contains($0) })
    }
}
