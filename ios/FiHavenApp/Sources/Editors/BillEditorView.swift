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
    @State private var notes = ""
    @State private var cardId = ""

    private let frequencies = ["Monthly", "Weekly", "Bi-weekly", "Quarterly", "Annually"]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                    TextField("Business / Provider", text: $business)
                    Picker("Category", selection: $category) {
                        ForEach(CTConstants.categories, id: \.self) { c in
                            Text("\(CTConstants.icon(forCategory: c))  \(c)").tag(c)
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
                    Picker("Charged to", selection: $cardId) {
                        Text("Direct (bank / cash)").tag("")
                        ForEach(store.data.cards) { card in
                            Text(card.name).tag(String(card.id))
                        }
                    }
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
                    Button("Save") { save() }.disabled(name.isEmpty)
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
        notes = bill.notes
        cardId = bill.cardId ?? ""
    }

    private func save() {
        let saved = Bill(
            id: bill?.id ?? AppStore.newID(),
            name: name.trimmingCharacters(in: .whitespaces),
            category: category,
            amount: amount,
            dueDay: dueDay,
            frequency: frequency,
            autopay: autopay,
            notes: notes,
            business: business.isEmpty ? nil : business.trimmingCharacters(in: .whitespaces),
            cardId: cardId.isEmpty ? nil : cardId
        )
        store.upsertBill(saved)
        dismiss()
    }
}
