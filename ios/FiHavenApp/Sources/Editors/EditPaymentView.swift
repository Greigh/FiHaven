import SwiftUI
import FiHavenCore

/// Edit an existing payment (amount, date, note). Mirrors web openEditPayment.
struct EditPaymentView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let payment: Payment

    @State private var amount: Double = 0
    @State private var date = Date()
    @State private var note = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    CurrencyField(label: "Amount", value: $amount)
                        .foregroundStyle(Theme.text)
                }
                Section {
                    DatePicker("Date paid", selection: $date, displayedComponents: .date)
                }
                Section("Note") {
                    TextField("Confirmation #, etc.", text: $note, axis: .vertical)
                }
            }
            .navigationTitle("Edit payment")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        store.updatePayment(payment, amount: amount, date: date, note: note.trimmingCharacters(in: .whitespaces))
                        dismiss()
                    }
                    .disabled(amount <= 0)
                    .accessibilityHint(amount <= 0 ? "Enter an amount greater than zero" : "Saves changes to this payment")
                }
            }
            .onAppear {
                amount = payment.amount
                note = payment.note
                if let d = DateLogic.parseDate(payment.date, tz: store.tz) { date = d }
            }
        }
    }
}
