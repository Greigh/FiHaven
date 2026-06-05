import SwiftUI
import FiHavenCore

/// Bills list with add / edit / delete and per-bill mark-paid.
struct BillsView: View {
    @EnvironmentObject var store: AppStore
    @State private var editing: Bill?
    @State private var creating = false
    @State private var paying: PayTarget?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                if store.sortedBills.isEmpty {
                    Text(store.loaded ? "No bills yet. Tap + to add one." : "Loading…")
                        .font(Theme.ui(15))
                        .foregroundStyle(Theme.muted)
                        .ctCard()
                }
                ForEach(store.sortedBills) { bill in
                    BillRow(
                        bill: bill,
                        state: store.paidState(type: "bill", refId: String(bill.id)),
                        paidSoFar: store.paidAmount(type: "bill", refId: String(bill.id)),
                        onPay: { paying = PayTarget(type: "bill", refId: String(bill.id), name: bill.name) },
                        onEdit: { editing = bill }
                    )
                }
            }
            .padding()
        }
        .background(Theme.bg.ignoresSafeArea())
        .navigationTitle("Bills")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { creating = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $creating) {
            BillEditorView(bill: nil)
        }
        .sheet(item: $editing) { bill in
            BillEditorView(bill: bill)
        }
        .sheet(item: $paying) { target in
            PayView(target: target)
        }
    }
}

private struct BillRow: View {
    let bill: Bill
    let state: PaidState
    let paidSoFar: Double
    let onPay: () -> Void
    let onEdit: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onPay) {
                Image(systemName: statusIcon)
                    .font(.system(size: 24))
                    .foregroundStyle(statusColor)
            }
            .buttonStyle(.plain)

            Text(CTConstants.icon(forCategory: bill.category)).font(.system(size: 20))

            VStack(alignment: .leading, spacing: 2) {
                Text(bill.name).font(Theme.ui(15, weight: .medium)).foregroundStyle(Theme.text)
                Text(dueText).font(Theme.ui(12)).foregroundStyle(state == .partial ? Theme.orange : Theme.muted)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(Money.fmt(bill.amount)).font(Theme.mono(15, weight: .medium)).foregroundStyle(Theme.text)
                if bill.autopay {
                    Text("autopay").font(Theme.mono(9)).foregroundStyle(Theme.muted)
                }
            }
        }
        .padding(14)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radiusCard, style: .continuous)
                .stroke(Theme.border, lineWidth: 1)
        )
        .contentShape(Rectangle())
        .onTapGesture(perform: onEdit)
    }

    private var statusIcon: String {
        switch state {
        case .full: return "checkmark.circle.fill"
        case .partial: return "circle.lefthalf.filled"
        case .unpaid: return "circle"
        }
    }

    private var statusColor: Color {
        switch state {
        case .full: return Theme.green
        case .partial: return Theme.orange
        case .unpaid: return Theme.muted
        }
    }

    private var dueText: String {
        switch state {
        case .full: return "Paid this month"
        case .partial: return "Paid \(Money.fmt(paidSoFar)) of \(Money.fmt(bill.amount))"
        case .unpaid: return bill.dueDay.map { "Due on the \($0)\(ordinalSuffix($0))" } ?? "No due date"
        }
    }

    private func ordinalSuffix(_ n: Int) -> String {
        switch n % 100 {
        case 11, 12, 13: return "th"
        default:
            switch n % 10 {
            case 1: return "st"; case 2: return "nd"; case 3: return "rd"; default: return "th"
            }
        }
    }
}
