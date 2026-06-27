import SwiftUI
import FiHavenCore

/// Add/edit a bill. `bill == nil` creates a new one.
struct BillEditorView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss

    let bill: Bill?

    @State private var name = ""
    @State private var business = ""
    @State private var category = "Other"
    @State private var amount: Double = 0
    @State private var dueDay = 1
    @State private var frequency = "Monthly"
    @State private var autopay = false
    @State private var autopayDay = 0   // 0 = "Same as due day"
    @State private var notes = ""
    @State private var cardId = ""
    @State private var hasStart = false
    @State private var startDate = Date()
    @State private var hasEnd = false
    @State private var endDate = Date()

    private let frequencies = ["Monthly", "Weekly", "Bi-weekly", "Quarterly", "Annually"]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                    TextField("Business / Provider", text: $business)
                    Picker("Category", selection: $category) {
                        ForEach(CTConstants.categories, id: \.self) { c in
                            Text("\(CTConstants.icon(forCategory: c))  \(c)")
                                .tag(c)
                                .accessibilityLabel(c)
                        }
                    }
                    TextField("Amount", value: $amount, format: .number)
                        .keyboardType(.decimalPad)
                    Picker("Due day", selection: $dueDay) {
                        ForEach(1...31, id: \.self) { Text("\($0)").tag($0) }
                    }
                    Picker("Frequency", selection: $frequency) {
                        ForEach(frequencies, id: \.self) { Text($0).tag($0) }
                    }
                    Toggle("Autopay", isOn: $autopay)
                    if autopay {
                        Picker("Autopay day", selection: $autopayDay) {
                            Text("Same as due day").tag(0)
                            ForEach(1...31, id: \.self) { Text("\($0)").tag($0) }
                        }
                    }
                    Picker("Charged to", selection: $cardId) {
                        Text("Direct (bank / cash)").tag("")
                        ForEach(store.data.cards) { card in
                            Text(card.name).tag(String(card.id))
                        }
                    }
                }
                Section {
                    Toggle("First bill due on…", isOn: $hasStart)
                    if hasStart {
                        DatePicker("First due", selection: $startDate, displayedComponents: .date)
                    }
                    Toggle("Stops on…", isOn: $hasEnd)
                    if hasEnd {
                        DatePicker("Stops", selection: $endDate, displayedComponents: .date)
                    }
                } header: {
                    Text("Active window")
                } footer: {
                    Text("A first due date sets the recurring due day. After a stop date the bill is marked Ended — kept in the list, but not counted toward totals, the calendar, or reminders.")
                }
                Section("Notes") {
                    TextField("Optional", text: $notes, axis: .vertical)
                }
                if bill != nil {
                    Section {
                        Button("Delete bill", role: .destructive) {
                            if let bill { store.deleteBill(bill) }
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(bill == nil ? "New Bill" : "Edit Bill")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(name.isEmpty)
                        .accessibilityHint(name.isEmpty ? "Enter a bill name to save" : "Saves this bill")
                }
            }
            .onAppear(perform: load)
        }
    }

    private func load() {
        guard let bill else { return }
        name = bill.name
        business = bill.business ?? ""
        category = bill.category
        amount = bill.amount
        dueDay = bill.dueDay ?? 1
        frequency = bill.frequency
        autopay = bill.autopay
        autopayDay = bill.autopayDay ?? 0
        notes = bill.notes
        cardId = bill.cardId ?? ""
        if let s = DateLogic.parseDate(bill.startDate, tz: store.tz) {
            hasStart = true; startDate = s
        }
        if let e = DateLogic.parseDate(bill.endDate, tz: store.tz) {
            hasEnd = true; endDate = e
        }
    }

    private func save() {
        // "First bill due on" derives the recurring day-of-month, so a
        // start date overrides the due-day picker.
        let startStr = hasStart ? DateLogic.ymd(startDate, tz: store.tz) : nil
        let endStr = hasEnd ? DateLogic.ymd(endDate, tz: store.tz) : nil
        let effectiveDueDay = hasStart
            ? DateLogic.calendar(tz: store.tz).component(.day, from: startDate)
            : dueDay
        let saved = Bill(
            id: bill?.id ?? AppStore.newID(),
            name: name.trimmingCharacters(in: .whitespaces),
            category: category,
            amount: amount,
            dueDay: effectiveDueDay,
            frequency: frequency,
            autopay: autopay,
            autopayDay: autopay && autopayDay > 0 ? autopayDay : nil,
            notes: notes,
            business: business.isEmpty ? nil : business.trimmingCharacters(in: .whitespaces),
            cardId: cardId.isEmpty ? nil : cardId,
            startDate: startStr,
            endDate: endStr
        )
        store.upsertBill(saved)
        dismiss()
    }
}
