import SwiftUI
import FiHavenCore

/// Credit-card list with add / edit / delete. Shows balance, utilization,
/// and an active-promo badge.
struct CardsView: View {
    @EnvironmentObject var store: AppStore
    @State private var editing: Card?
    @State private var creating = false
    @State private var paying: PayTarget?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                if store.sortedCards.isEmpty {
                    Text(store.loaded ? "No cards yet. Tap + to add one." : "Loading…")
                        .font(Theme.ui(15)).foregroundStyle(Theme.muted).ctCard()
                }
                ForEach(store.sortedCards) { card in
                    CardRow(
                        card: card,
                        tz: store.tz,
                        state: store.paidState(type: "card", refId: String(card.id)),
                        paidSoFar: store.paidAmount(type: "card", refId: String(card.id)),
                        goal: store.goalAmount(type: "card", refId: String(card.id)),
                        onPay: { paying = PayTarget(type: "card", refId: String(card.id), name: card.name) },
                        onEdit: { editing = card }
                    )
                }
            }
            .padding()
        }
        .background(Theme.bg.ignoresSafeArea())
        .navigationTitle("Cards")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { creating = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $creating) { CardEditorView(card: nil) }
        .sheet(item: $editing) { card in CardEditorView(card: card) }
        .sheet(item: $paying) { target in PayView(target: target) }
    }
}

private struct CardRow: View {
    let card: Card
    let tz: TimeZone
    let state: PaidState
    let paidSoFar: Double
    let goal: Double
    let onPay: () -> Void
    let onEdit: () -> Void

    private var utilization: Double {
        card.limit > 0 ? min(1, card.balance / card.limit) : 0
    }

    private var promoActive: Bool {
        guard card.hasPromo else { return false }
        return DateLogic.monthsUntil(card.promoEndDate, tz: tz) > 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(CTConstants.cardIcon).font(.system(size: 20))
                Text(card.name).font(Theme.ui(15, weight: .semibold)).foregroundStyle(Theme.text)
                Spacer()
                Text(Money.fmt(card.balance)).font(Theme.mono(16, weight: .semibold)).foregroundStyle(Theme.text)
            }

            // utilization bar
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.surface2)
                    Capsule().fill(utilization > 0.5 ? Theme.orange : Theme.accent)
                        .frame(width: max(4, geo.size.width * utilization))
                }
            }
            .frame(height: 6)

            HStack(spacing: 8) {
                Text("\(Int(utilization * 100))% of \(Money.fmtShort(card.limit))")
                    .font(Theme.ui(12)).foregroundStyle(Theme.muted)
                Spacer()
                if promoActive {
                    Text("0% promo")
                        .font(Theme.mono(10, weight: .medium))
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Theme.greenBg).foregroundStyle(Theme.green)
                        .clipShape(Capsule())
                } else {
                    Text("\(card.regularAPR, specifier: "%.2f")% APR")
                        .font(Theme.mono(11)).foregroundStyle(Theme.muted)
                }
            }

            Divider().overlay(Theme.border)

            HStack {
                switch state {
                case .full:
                    Label("Paid \(Money.fmt(paidSoFar)) this month", systemImage: "checkmark.circle.fill")
                        .font(Theme.ui(12, weight: .medium)).foregroundStyle(Theme.green)
                case .partial:
                    Text("Paid \(Money.fmt(paidSoFar)) of \(Money.fmt(goal))")
                        .font(Theme.ui(12, weight: .medium)).foregroundStyle(Theme.orange)
                case .unpaid:
                    Text("Not paid this month")
                        .font(Theme.ui(12)).foregroundStyle(Theme.muted)
                }
                Spacer()
                if state != .full {
                    Button(action: onPay) {
                        Text(state == .partial ? "Pay more" : "Pay")
                            .font(Theme.ui(13, weight: .semibold))
                            .padding(.horizontal, 14).padding(.vertical, 6)
                            .background(Theme.greenBg).foregroundStyle(Theme.green)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .ctCard()
        .contentShape(Rectangle())
        .onTapGesture(perform: onEdit)
    }
}
