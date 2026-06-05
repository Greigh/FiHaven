import SwiftUI
import FiHavenCore

/// Payment log, grouped by month (newest first). Long-press a row to delete.
struct HistoryView: View {
    @EnvironmentObject var store: AppStore

    private var grouped: [(month: String, items: [Payment])] {
        Dictionary(grouping: store.paymentsByDateDesc, by: { $0.monthKey })
            .map { ($0.key, $0.value) }
            .sorted { $0.0 > $1.0 }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                if store.data.payments.isEmpty {
                    Text(store.loaded ? "No payments recorded yet." : "Loading…")
                        .font(Theme.ui(15)).foregroundStyle(Theme.muted).ctCard()
                }
                ForEach(grouped, id: \.month) { group in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(DateLogic.monthKeyLabel(group.month, tz: store.tz))
                            .font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.muted)
                        VStack(spacing: 0) {
                            ForEach(Array(group.items.enumerated()), id: \.element.id) { i, p in
                                if i > 0 { Divider().overlay(Theme.border) }
                                row(p)
                            }
                        }
                        .ctCard(padding: 0)
                    }
                }
            }
            .padding()
        }
        .background(Theme.bg.ignoresSafeArea())
        .navigationTitle("History")
    }

    private func row(_ p: Payment) -> some View {
        HStack(spacing: 12) {
            Text(p.type == "card" ? CTConstants.cardIcon : "🧾").font(.system(size: 18))
            VStack(alignment: .leading, spacing: 2) {
                Text(p.name.isEmpty ? p.type.capitalized : p.name)
                    .font(Theme.ui(15, weight: .medium)).foregroundStyle(Theme.text)
                Text(prettyDate(p.date)).font(Theme.ui(12)).foregroundStyle(Theme.muted)
            }
            Spacer()
            Text(Money.fmt(p.amount)).font(Theme.mono(15, weight: .medium)).foregroundStyle(Theme.green)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .contentShape(Rectangle())
        .contextMenu {
            Button(role: .destructive) { store.deletePayment(p) } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    private func prettyDate(_ iso: String) -> String {
        guard let date = DateLogic.parseDate(iso, tz: store.tz) else { return iso }
        let f = DateFormatter()
        f.timeZone = store.tz
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = "EEE, MMM d, yyyy"
        return f.string(from: date)
    }
}
