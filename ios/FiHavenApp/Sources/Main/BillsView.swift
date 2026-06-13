import SwiftUI
import FiHavenCore

/// Bills list with add / edit / delete and per-bill mark-paid.
struct BillsView: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var billing: StoreManager
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
        b.dueDay.map { DateLogic.daysUntilDue(dueDay: $0, tz: store.tz) } ?? 9999
    }

    private var displayedBills: [Bill] {
        var list = store.sortedBills.filter { b in
            if fUnpaid && store.paidState(type: "bill", refId: String(b.id)) == .full { return false }
            if fOverdue && !(b.dueDay.map { DateLogic.daysUntilDue(dueDay: $0, tz: store.tz) < 0 } ?? false) { return false }
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

    private struct Sub: Identifiable {
        let id: String; let name: String; let monthly: Double
        let source: String; let priceUp: Double?; let stale: Bool
    }
    private func monthlyOfBill(_ b: Bill) -> Double {
        switch b.frequency {
        case "Weekly": return b.amount * 52 / 12
        case "Bi-weekly": return b.amount * 26 / 12
        case "Quarterly": return b.amount / 3
        case "Annually": return b.amount / 12
        default: return b.amount
        }
    }
    private func daysSince(_ iso: String) -> Int? {
        guard let d = DateLogic.parseDate(iso, tz: store.tz) else { return nil }
        return Calendar.current.dateComponents([.day], from: d, to: Date()).day
    }
    private var subscriptions: [Sub] {
        var out: [Sub] = []
        for b in store.data.bills where b.category == "Subscriptions" {
            out.append(Sub(id: "bill-\(b.id)", name: b.name.isEmpty ? "Subscription" : b.name,
                           monthly: monthlyOfBill(b), source: "bill", priceUp: nil, stale: false))
        }
        let withMerchant = store.data.transactions.filter { !$0.merchant.trimmingCharacters(in: .whitespaces).isEmpty }
        let byMerchant = Dictionary(grouping: withMerchant) { $0.merchant.trimmingCharacters(in: .whitespaces).lowercased() }
        for (_, list) in byMerchant {
            if Set(list.map { String($0.date.prefix(7)) }).count < 2 { continue }
            let sorted = list.sorted { $0.date < $1.date }
            guard let latest = sorted.last else { continue }
            let minAmt = list.map { $0.amount }.min() ?? 0
            out.append(Sub(id: "tx-\(latest.merchant)", name: latest.merchant, monthly: latest.amount,
                           source: "tx", priceUp: latest.amount > minAmt + 0.005 ? minAmt : nil,
                           stale: (daysSince(latest.date) ?? 0) > 60))
        }
        return out.sorted { $0.monthly > $1.monthly }
    }

    @ViewBuilder
    private var subscriptionsHeader: some View {
        // Subscription finder is a Pro insight (Balanced tiering).
        if billing.isPro && !subscriptions.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    FieldLabel(text: "Subscriptions")
                    Spacer()
                    Text("\(Money.fmt(subscriptions.reduce(0) { $0 + $1.monthly }))/mo · \(subscriptions.count)")
                        .font(Theme.mono(12)).foregroundStyle(Theme.muted)
                }
                VStack(spacing: 0) {
                    ForEach(Array(subscriptions.enumerated()), id: \.element.id) { i, s in
                        if i > 0 { Divider().overlay(Theme.border) }
                        HStack(spacing: 10) {
                            Text(s.source == "bill" ? "📄" : "🔁").font(.system(size: 15))
                            VStack(alignment: .leading, spacing: 1) {
                                Text(s.name).font(Theme.ui(14, weight: .medium)).foregroundStyle(Theme.text)
                                HStack(spacing: 6) {
                                    if let up = s.priceUp {
                                        Text("▲ was \(Money.fmt(up))").font(Theme.ui(11)).foregroundStyle(Theme.orange)
                                    }
                                    if s.stale { Text("⚠ unused 60d+").font(Theme.ui(11)).foregroundStyle(Theme.red) }
                                    if s.priceUp == nil && !s.stale {
                                        Text(s.source == "bill" ? "Tracked bill" : "Recurring charge")
                                            .font(Theme.ui(11)).foregroundStyle(Theme.muted)
                                    }
                                }
                            }
                            Spacer()
                            Text("\(Money.fmt(s.monthly))/mo").font(Theme.mono(13)).foregroundStyle(Theme.text)
                        }
                        .padding(.vertical, 6)
                    }
                }
                .ctCard()
            }
            .listRowBackground(Color.clear).listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 4, trailing: 16))
        }
    }

    var body: some View {
        List {
            subscriptionsHeader
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
        .navigationTitle("Bills")
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
            }
            ToolbarItem(placement: .primaryAction) {
                Button { showFilters = true } label: {
                    Image(systemName: filterCount > 0 ? "line.3.horizontal.decrease.circle.fill"
                                                       : "line.3.horizontal.decrease.circle")
                }
            }
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
    let onEdit: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onPay) {
                Image(systemName: skipped ? "forward.end.circle.fill" : statusIcon)
                    .font(.system(size: 24))
                    .foregroundStyle(skipped ? Theme.muted : statusColor)
            }
            .buttonStyle(.plain)

            Text(CTConstants.icon(forCategory: bill.category)).font(.system(size: 20))

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(bill.name).font(Theme.ui(15, weight: .medium)).foregroundStyle(Theme.text)
                    if let bus = bill.business, !bus.isEmpty {
                        Text("· \(bus)").font(Theme.ui(14)).foregroundStyle(Theme.muted)
                    }
                }
                Text(skipped ? "⏭ Skipped this month" : dueText)
                    .font(Theme.ui(12))
                    .foregroundStyle(state == .partial ? Theme.orange : Theme.muted)
                if let cid = bill.cardId, let card = store.data.cards.first(where: { String($0.id) == cid }) {
                    Text("💳 Charged to \(card.name) · not a bank debit")
                        .font(Theme.ui(11)).foregroundStyle(Theme.muted)
                }
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
