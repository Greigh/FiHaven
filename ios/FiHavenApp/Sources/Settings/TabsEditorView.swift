import SwiftUI

/// Customize the bottom tab bar: drag to reorder within a section, and use
/// the leading +/− button to move a tab between the bottom bar and More.
/// Persists to the synced `tabs` setting on every change.
struct TabsEditorView: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var billing: StoreManager
    @State private var bottom: [TabItem] = []
    @State private var more: [TabItem] = []

    var body: some View {
        List {
            Section {
                ForEach(bottom) { row($0, inBottom: true) }
                    .onMove { from, to in bottom.move(fromOffsets: from, toOffset: to); persist() }
            } header: {
                Text("Bottom bar")
            } footer: {
                Text("Up to \(maxBottomTabs) tabs. Drag to reorder; tap − to move a tab to More."
                     + (billing.isPro ? "" : " Free accounts always show a Get Pro tab, which uses one slot."))
            }

            Section("More") {
                ForEach(more) { row($0, inBottom: false) }
                    .onMove { from, to in more.move(fromOffsets: from, toOffset: to); persist() }
            }
        }
        .environment(\.editMode, .constant(.active))
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.bg.ignoresSafeArea())
        .navigationTitle("Tabs")
        .onAppear(perform: load)
    }

    private func row(_ item: TabItem, inBottom: Bool) -> some View {
        HStack(spacing: 12) {
            Button {
                move(item, inBottom: inBottom)
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: inBottom ? "minus.circle.fill" : "plus.circle.fill")
                        .imageScale(.large)
                    Text(inBottom ? "Remove" : "Add")
                        .font(Theme.ui(11, weight: .medium))
                }
                .foregroundStyle(inBottom ? Theme.red : Theme.green)
            }
            .buttonStyle(.plain)
            .disabled(!inBottom && bottom.count >= maxBottomTabs)
            .accessibilityLabel(
                inBottom
                    ? "Move \(item.title) to More"
                    : "Add \(item.title) to bottom bar"
            )

            Label(item.title, systemImage: item.symbol)
                .foregroundStyle(Theme.text)
        }
    }

    private func move(_ item: TabItem, inBottom: Bool) {
        if inBottom {
            bottom.removeAll { $0 == item }
            more.insert(item, at: 0)
        } else {
            guard bottom.count < maxBottomTabs else { return }
            more.removeAll { $0 == item }
            bottom.append(item)
        }
        persist()
    }

    private func load() {
        let r = resolveTabs(saved: store.data.settings.tabs)
        bottom = r.bottom
        more = r.overflow
    }

    private func persist() {
        store.setTabs(bottom.map(\.rawValue))
    }
}
