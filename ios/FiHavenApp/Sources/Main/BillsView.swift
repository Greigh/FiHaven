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
    @State private var searchText = ""
    @State private var fUnpaid = false
    @State private var fOverdue = false
    @State private var fAutopay = false
    @State private var fOnCard = false
    @State private var fCategory = "all"

    private var filterCount: Int {
        (fUnpaid ? 1 : 0) + (fOverdue ? 1 : 0) + (fAutopay ? 1 : 0) + (fOnCard ? 1 : 0) + (fCategory != "all" ? 1 : 0)
    }

    private var useArchive: Bool { store.data.settings.archiveInsteadOfDelete }
    private var archivedBills: [Bill] { store.archivedBills }

    private func dueDays(_ b: Bill) -> Int {
        BillSchedule.effectiveDaysUntilDue(
            b,
            whenFullyPaid: store.isFullyPaid(type: "bill", refId: String(b.id)),
            tz: store.tz
        )
    }

    private var displayedBills: [Bill] {
        let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        var list = store.sortedBills.filter { b in
            if b.archived { return false }
            if fUnpaid && store.paidState(type: "bill", refId: String(b.id)) == .full { return false }
            if fOverdue && dueDays(b) >= 0 { return false }
            if fAutopay && !b.autopay { return false }
            if fOnCard && b.cardId == nil { return false }
            if fCategory != "all" && b.category != fCategory { return false }
            if !q.isEmpty {
                let hay = [b.name, b.business ?? "", b.category].joined(separator: " ")
                if !hay.localizedCaseInsensitiveContains(q) { return false }
            }
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

    // ── Bills summary (due this period / left to pay) ────────────────
    // Mirrors the Cards summary and the dashboard's "left to pay" framing.
    private var billsSummaryHeader: some View {
        let due = store.activeBills.reduce(0.0) { $0 + store.goalAmount(type: "bill", refId: String($1.id)) }
        let left = store.activeBills.reduce(0.0) { $0 + store.remaining(type: "bill", refId: String($1.id)) }
        let paid = max(0, due - left)
        let progress = due > 0 ? min(1, paid / due) : 0
        let caughtUp = left <= 0.005

        return VStack(alignment: .leading, spacing: 10) {
            FieldLabel(text: caughtUp ? "All caught up" : "Left to pay")
            Text(caughtUp ? "$0.00" : Money.fmt(left))
                .font(Theme.mono(30, weight: .bold))
                .foregroundStyle(caughtUp ? Theme.green : Theme.text)
                .minimumScaleFactor(0.6).lineLimit(1)
            HStack(spacing: 6) {
                Text("\(Money.fmt(due)) due this period").font(Theme.ui(12)).foregroundStyle(Theme.muted)
                Text("·").font(Theme.ui(12)).foregroundStyle(Theme.muted)
                Text("\(store.activeBills.count) bill\(store.activeBills.count == 1 ? "" : "s")")
                    .font(Theme.ui(12)).foregroundStyle(Theme.muted)
            }
            if due > 0 {
                ProgressView(value: progress)
                    .tint(Theme.green)
                    .accessibilityLabel("Bills paid this period")
                    .accessibilityValue("\(Int(progress * 100)) percent")
            }
        }
        .ctCard(branded: true)
        .listRowBackground(Color.clear).listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 6, trailing: 16))
    }

    var body: some View {
        List {
            if !store.activeBills.isEmpty {
                billsSummaryHeader
            }
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
                        if useArchive {
                            Button {
                                store.archiveBill(bill)
                            } label: {
                                Label("Archive", systemImage: "archivebox")
                            }
                            .tint(Theme.muted)
                        } else {
                            Button(role: .destructive) {
                                store.deleteBill(bill)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
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

            if !archivedBills.isEmpty {
                DisclosureGroup {
                    ForEach(archivedBills) { bill in
                        HStack(spacing: 10) {
                            Text(bill.name).font(Theme.ui(14)).foregroundStyle(Theme.text).lineLimit(1)
                            Spacer()
                            Text(Money.fmt(bill.amount)).font(Theme.mono(13, weight: .medium)).foregroundStyle(Theme.muted)
                            Button("Restore") { store.restoreBill(bill) }
                                .font(Theme.ui(12, weight: .semibold)).buttonStyle(.borderless).tint(Theme.accent)
                            Button(role: .destructive) { store.deleteBill(bill) } label: { Text("Delete") }
                                .font(Theme.ui(12, weight: .semibold)).buttonStyle(.borderless)
                        }
                    }
                } label: {
                    Text("Archived bills (\(archivedBills.count))")
                        .font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.muted)
                }
                .ctCard()
                .listRowBackground(Color.clear).listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 10, trailing: 16))
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.bg.ignoresSafeArea())
        .searchable(text: $searchText, prompt: "Search bills")
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
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                IconMark(
                    icon: CTConstants.iconInfo(forCategory: bill.category, overrides: store.data.settings.categoryIcons),
                    size: 22,
                    fallbackEmoji: CTConstants.categoryIcons[bill.category] ?? "📌"
                )
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(bill.name)
                        .font(Theme.ui(15, weight: .semibold)).foregroundStyle(Theme.text).lineLimit(1)
                    if let bus = bill.business, !bus.isEmpty {
                        Text(bus).font(Theme.ui(12)).foregroundStyle(Theme.muted).lineLimit(1)
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(Money.fmt(bill.amount)).font(Theme.mono(16, weight: .semibold)).foregroundStyle(Theme.text)
                    if bill.autopay {
                        Text(bill.autopayDay.map { "autopay · day \($0)" } ?? "autopay")
                            .font(Theme.mono(9)).foregroundStyle(Theme.muted)
                    }
                }
            }
            HStack(spacing: 16) {
                Text(statusLine).font(Theme.ui(12)).foregroundStyle(skipped ? Theme.muted : statusColor)
                Spacer()
                if skipped {
                    quickAction("Undo skip", Theme.accent, onUnskip)
                } else if state == .full {
                    quickAction("Undo", Theme.muted, onUnmark)
                } else if !isWindowEdge {
                    quickAction("Skip", Theme.muted, onSkip)
                    quickAction("Pay", Theme.accent, onPay)
                }
            }
            if let cid = bill.cardId, let card = store.data.cards.first(where: { String($0.id) == cid }) {
                Text("💳 Charged to \(card.name) · not a bank debit")
                    .font(Theme.ui(11)).foregroundStyle(Theme.muted)
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
        .accessibilityLabel("\(bill.name), \(Money.fmt(bill.amount)), \(skipped ? "Skipped this \(periodNoun)" : dueText)")
        .accessibilityHint("Double tap to edit")
        .contextMenu {
            if state == .full && !skipped {
                Button { onUnmark() } label: { Label("Undo payment", systemImage: "arrow.uturn.backward") }
            } else if !skipped {
                Button { onPay() } label: { Label("Record payment", systemImage: "checkmark.circle") }
            }
            if skipped {
                Button { onUnskip() } label: { Label("Un-skip \(periodNoun)", systemImage: "arrow.uturn.backward") }
            } else {
                Button { onSkip() } label: { Label("Skip this \(periodNoun)", systemImage: "forward.end") }
            }
            Button { onEdit() } label: { Label("Edit bill", systemImage: "pencil") }
        }
    }

    private func quickAction(_ label: String, _ color: Color, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label).font(Theme.ui(12, weight: .medium)).foregroundStyle(color)
        }
        .buttonStyle(.plain)
    }

    private var statusLine: String {
        if DateLogic.billEnded(bill, tz: store.tz) { return "⏹ Ended \(friendlyDate(bill.endDate))" }
        if DateLogic.billNotStarted(bill, tz: store.tz) { return "Starts \(friendlyDate(bill.startDate))" }
        if skipped { return "⏭ Skipped this \(periodNoun)" }
        return dueText
    }

    private var isWindowEdge: Bool {
        DateLogic.billEnded(bill, tz: store.tz) || DateLogic.billNotStarted(bill, tz: store.tz)
    }

    private var statusColor: Color {
        switch state {
        case .full: return Theme.green
        case .partial: return Theme.orange
        case .unpaid: return Theme.muted
        }
    }

    private var periodNoun: String { BillSchedule.periodNoun(bill.frequency) }

    private var dueText: String {
        switch state {
        case .full: return "Paid this \(periodNoun)"
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
