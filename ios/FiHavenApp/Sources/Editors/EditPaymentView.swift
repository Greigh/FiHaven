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
                    HStack {
                        Text("Amount").foregroundStyle(Theme.text)
                        Spacer()
                        TextField("Amount", value: $amount, format: .number)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                    }
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
