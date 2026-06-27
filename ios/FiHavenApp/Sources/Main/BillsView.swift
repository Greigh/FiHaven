import SwiftUI
import FiHavenCore

/// Bills list with add / edit / delete and per-bill mark-paid.
struct BillsView: View {
    @EnvironmentObject var store: AppStore
    @State private var editing: Bill?
    @State private var creating = false
    @State private var paying: PayTarget?
    @State private var sortKey = "due"
    @State private var showFilters = false
    @State private var fUnpaid = false
    @State private var fOverdue = false
    @State private var fAutopay = false
    @State private var fOnCard = false
    @State private var fCategory = "all"

    private var filterCount: Int {
        (fUnpaid ? 1 : 0) + (fOverdue ? 1 : 0) + (fAutopay ? 1 : 0) + (fOnCard ? 1 : 0) + (fCategory != "all" ? 1 : 0)
    }

    private func dueDays(_ b: Bill) -> Int {
        BillSchedule.daysUntilDue(b, tz: store.tz)
    }

    private var displayedBills: [Bill] {
        var list = store.sortedBills.filter { b in
            if fUnpaid && store.paidState(type: "bill", refId: String(b.id)) == .full { return false }
            if fOverdue && BillSchedule.daysUntilDue(b, tz: store.tz) >= 0 { return false }
            if fAutopay && !b.autopay { return false }
            if fOnCard && b.cardId == nil { return false }
            if fCategory != "all" && b.category != fCategory { return false }
            return true
        }
        switch sortKey {
        case "amount-desc": list.sort { $0.amount > $1.amount }
        case "amount-asc":  list.sort { $0.amount < $1.amount }
        case "name":        list.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        case "unpaid":
            list.sort { a, b in
                let ra = store.paidState(type: "bill", refId: String(a.id)) == .full ? 1 : 0
                let rb = store.paidState(type: "bill", refId: String(b.id)) == .full ? 1 : 0
                return ra != rb ? ra < rb : dueDays(a) < dueDays(b)
            }
        default: break // "due" — already due-sorted
        }
        return list
    }

    var body: some View {
        List {
            if store.sortedBills.isEmpty {
                HStack {
                    Spacer()
                    Text(store.loaded ? "No bills yet. Tap + to add one." : "Loading…")
                        .font(Theme.ui(15))
                        .foregroundStyle(Theme.muted)
                    Spacer()
                }
                .ctCard()
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
            } else {
                ForEach(displayedBills) { bill in
                    BillRow(
                        bill: bill,
                        state: store.paidState(type: "bill", refId: String(bill.id)),
                        paidSoFar: store.paidAmount(type: "bill", refId: String(bill.id)),
                        skipped: store.isSkipped(type: "bill", refId: String(bill.id)),
                        onPay: { paying = PayTarget(type: "bill", refId: String(bill.id), name: bill.name) },
                        onUnmark: {
                            store.setPaid(type: "bill", refId: String(bill.id), name: bill.name,
                                          amount: store.goalAmount(type: "bill", refId: String(bill.id)), paid: false)
                        },
                        onSkip: { store.skipMonth(type: "bill", refId: String(bill.id), name: bill.name) },
                        onUnskip: { store.unskip(type: "bill", refId: String(bill.id)) },
                        onEdit: { editing = bill }
                    )
                    .swipeActions(edge: .leading) {
                        Button {
                            paying = PayTarget(type: "bill", refId: String(bill.id), name: bill.name)
                        } label: {
                            Label("Pay", systemImage: "checkmark.circle.fill")
                        }
                        .tint(Theme.green)
                        let isFull = store.paidState(type: "bill", refId: String(bill.id)) == .full
                        Button {
                            store.setPaid(type: "bill", refId: String(bill.id), name: bill.name,
                                          amount: store.goalAmount(type: "bill", refId: String(bill.id)), paid: !isFull)
                        } label: {
                            Label(isFull ? "Unmark" : "Mark paid",
                                  systemImage: isFull ? "arrow.uturn.backward" : "checkmark.seal.fill")
                        }
                        .tint(isFull ? Theme.muted : Theme.accent)
                        let skipped = store.isSkipped(type: "bill", refId: String(bill.id))
                        Button {
                            if skipped { store.unskip(type: "bill", refId: String(bill.id)) }
                            else { store.skipMonth(type: "bill", refId: String(bill.id), name: bill.name) }
                        } label: {
                            Label(skipped ? "Un-skip" : "Skip month",
                                  systemImage: skipped ? "arrow.uturn.backward" : "forward.end.fill")
                        }
                        .tint(skipped ? Theme.muted : Theme.orange)
                    }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            store.deleteBill(bill)
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                        Button {
                            editing = bill
                        } label: {
                            Label("Edit", systemImage: "pencil")
                        }
                        .tint(Theme.accent)
                    }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 5, leading: 16, bottom: 5, trailing: 16))
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.bg.ignoresSafeArea())
        .brandedNavigationBar("Bills")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Picker("Sort", selection: $sortKey) {
                        Text("Due date").tag("due")
                        Text("Largest first").tag("amount-desc")
                        Text("Smallest first").tag("amount-asc")
                        Text("Need to pay first").tag("unpaid")
                        Text("Name (A–Z)").tag("name")
                    }
                } label: { Image(systemName: "arrow.up.arrow.down") }
                    .accessibilityIconButton("Sort bills")
            }
            ToolbarItem(placement: .primaryAction) {
                Button { showFilters = true } label: {
                    Image(systemName: filterCount > 0 ? "line.3.horizontal.decrease.circle.fill"
                                                       : "line.3.horizontal.decrease.circle")
                }
                .accessibilityIconButton(
                    filterCount > 0 ? "Filter bills, \(filterCount) active" : "Filter bills"
                )
            }
            ToolbarItem(placement: .primaryAction) {
                Button { creating = true } label: { Image(systemName: "plus") }
                    .accessibilityIconButton("Add bill")
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
        .sheet(isPresented: $showFilters) {
            NavigationStack {
                Form {
                    Section("Filters") {
                        Toggle("Unpaid only", isOn: $fUnpaid)
                        Toggle("Overdue only", isOn: $fOverdue)
                        Toggle("Autopay only", isOn: $fAutopay)
                        Toggle("Charged to a card", isOn: $fOnCard)
                        Picker("Category", selection: $fCategory) {
                            Text("All").tag("all")
                            ForEach(CTConstants.categories, id: \.self) { Text($0).tag($0) }
                        }
                    }
                }
                .navigationTitle("Filter bills")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Clear") {
                            fUnpaid = false; fOverdue = false; fAutopay = false; fOnCard = false; fCategory = "all"
                        }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { showFilters = false }
                    }
                }
            }
            .presentationDetents([.medium])
        }
    }
}

private struct BillRow: View {
    @EnvironmentObject var store: AppStore
    let bill: Bill
    let state: PaidState
    let paidSoFar: Double
    var skipped: Bool = false
    let onPay: () -> Void
    let onUnmark: () -> Void
    let onSkip: () -> Void
    let onUnskip: () -> Void
    let onEdit: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: statusTap) {
                VStack(spacing: 2) {
                    Image(systemName: skipped ? "forward.end.circle.fill" : A11y.paidStateIcon(state))
                        .font(.system(size: 24))
                        .foregroundStyle(skipped ? Theme.muted : statusColor)
                    Text(skipped ? "Skipped" : A11y.paidStateLabel(state))
                        .font(Theme.ui(9, weight: .medium))
                        .foregroundStyle(skipped ? Theme.muted : statusColor)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(bill.name), \(skipped ? "Skipped this month" : A11y.paidStateLabel(state))")
            .accessibilityHint(A11y.paidStateHint(state, skipped: skipped))

            Text(CTConstants.icon(forCategory: bill.category)).font(.system(size: 20))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(bill.name)
                    .font(Theme.ui(15, weight: .medium))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                if let bus = bill.business, !bus.isEmpty {
                    Text(bus)
                        .font(Theme.ui(12))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
                if DateLogic.billEnded(bill, tz: store.tz) {
                    Text("⏹ Ended \(friendlyDate(bill.endDate))").font(Theme.ui(12)).foregroundStyle(Theme.muted)
                } else if DateLogic.billNotStarted(bill, tz: store.tz) {
                    Text("Starts \(friendlyDate(bill.startDate))").font(Theme.ui(12)).foregroundStyle(Theme.muted)
                } else {
                    Text(skipped ? "⏭ Skipped this month" : dueText)
                        .font(Theme.ui(12))
                        .foregroundStyle(state == .partial ? Theme.orange : Theme.muted)
                }
                if let cid = bill.cardId, let card = store.data.cards.first(where: { String($0.id) == cid }) {
                    Text("💳 Charged to \(card.name) · not a bank debit")
                        .font(Theme.ui(11)).foregroundStyle(Theme.muted)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(Money.fmt(bill.amount)).font(Theme.mono(15, weight: .medium)).foregroundStyle(Theme.text)
                if bill.autopay {
                    Text(bill.autopayDay.map { "autopay · day \($0)" } ?? "autopay")
                        .font(Theme.mono(9)).foregroundStyle(Theme.muted)
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
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(bill.name), \(Money.fmt(bill.amount)), \(skipped ? "Skipped this month" : dueText)")
        .accessibilityHint("Double tap to edit")
        .contextMenu {
            if state == .full && !skipped {
                Button { onUnmark() } label: { Label("Undo payment", systemImage: "arrow.uturn.backward") }
            } else if !skipped {
                Button { onPay() } label: { Label("Record payment", systemImage: "checkmark.circle") }
            }
            if skipped {
                Button { onUnskip() } label: { Label("Un-skip month", systemImage: "arrow.uturn.backward") }
            } else {
                Button { onSkip() } label: { Label("Skip this month", systemImage: "forward.end") }
            }
            Button { onEdit() } label: { Label("Edit bill", systemImage: "pencil") }
        }
    }

    private func statusTap() {
        if skipped { onUnskip() }
        else if state == .full { onUnmark() }
        else { onPay() }
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
        case .unpaid:
            if let next = BillSchedule.nextDueDate(bill, tz: store.tz) {
                return "Next: \(friendlyDate(next))"
            }
            return "No due date"
        }
    }

    private func friendlyDate(_ date: Date) -> String {
        let f = DateFormatter()
        f.calendar = DateLogic.calendar(tz: store.tz)
        f.timeZone = store.tz
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = Calendar.current.component(.year, from: date) == Calendar.current.component(.year, from: Date())
            ? "MMM d" : "MMM d, yyyy"
        return f.string(from: date)
    }

    /// "YYYY-MM-DD" → a short "MMM d" label (e.g. "Jul 15"), or "" if unset.
    private func friendlyDate(_ s: String?) -> String {
        guard let date = DateLogic.parseDate(s, tz: store.tz) else { return "" }
        let f = DateFormatter()
        f.calendar = DateLogic.calendar(tz: store.tz)
        f.timeZone = store.tz
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = "MMM d"
        return f.string(from: date)
    }
}
