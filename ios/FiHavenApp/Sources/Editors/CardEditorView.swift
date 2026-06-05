import SwiftUI
import FiHavenCore

/// Add/edit a credit card, including 0%-promo tracking.
struct CardEditorView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss

    let card: Card?

    @State private var name = ""
    @State private var balance: Double = 0
    @State private var limit: Double = 0
    @State private var minPayment: Double = 0
    @State private var recommendedPayment: Double = 0
    @State private var regularAPR: Double = 0
    @State private var dueDay = 1
    @State private var autopay = false
    @State private var notes = ""

    @State private var hasPromo = false
    @State private var promoAPR: Double = 0
    @State private var promoBalance: Double = 0
    @State private var promoEnd = Date()

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                    money("Balance", $balance)
                    money("Credit limit", $limit)
                    money("Minimum payment", $minPayment)
                    money("Recommended payment", $recommendedPayment)
                    HStack {
                        Text("Regular APR")
                        Spacer()
                        TextField("APR", value: $regularAPR, format: .number)
                            .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                        Text("%").foregroundStyle(Theme.muted)
                    }
                    Picker("Due day", selection: $dueDay) {
                        ForEach(1...31, id: \.self) { Text("\($0)").tag($0) }
                    }
                    Toggle("Autopay", isOn: $autopay)
                } footer: {
                    Text("Recommended payment is optional — leave it at 0 to default to the full balance (or the 0%-promo payoff).")
                }

                Section {
                    Toggle("0% / promo APR", isOn: $hasPromo)
                    if hasPromo {
                        HStack {
                            Text("Promo APR")
                            Spacer()
                            TextField("APR", value: $promoAPR, format: .number)
                                .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                            Text("%").foregroundStyle(Theme.muted)
                        }
                        money("Promo balance", $promoBalance)
                        DatePicker("Promo ends", selection: $promoEnd, displayedComponents: .date)
                    }
                }

                Section("Notes") {
                    TextField("Optional", text: $notes, axis: .vertical)
                }

                if card != nil {
                    Section {
                        Button("Delete card", role: .destructive) {
                            if let card { store.deleteCard(card) }
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(card == nil ? "New Card" : "Edit Card")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }.disabled(name.isEmpty)
                }
            }
            .onAppear(perform: load)
        }
    }

    private func money(_ label: String, _ value: Binding<Double>) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text("$").foregroundStyle(Theme.muted)
            TextField("0", value: value, format: .number)
                .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
        }
    }

    private func load() {
        guard let card else { return }
        name = card.name
        balance = card.balance
        limit = card.limit
        minPayment = card.minPayment
        recommendedPayment = card.recommendedPayment ?? 0
        regularAPR = card.regularAPR
        dueDay = card.dueDay ?? 1
        autopay = card.autopay
        notes = card.notes
        hasPromo = card.hasPromo
        promoAPR = card.promoAPR ?? 0
        promoBalance = card.promoBalance ?? card.balance
        if let parsed = DateLogic.parseDate(card.promoEndDate, tz: store.tz) {
            promoEnd = parsed
        }
    }

    private func save() {
        let f = DateFormatter()
        f.timeZone = store.tz
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"

        let saved = Card(
            id: card?.id ?? AppStore.newID(),
            name: name.trimmingCharacters(in: .whitespaces),
            balance: balance,
            limit: limit,
            minPayment: minPayment,
            recommendedPayment: recommendedPayment > 0 ? recommendedPayment : nil,
            regularAPR: regularAPR,
            hasPromo: hasPromo,
            promoAPR: hasPromo ? promoAPR : nil,
            promoEndDate: hasPromo ? f.string(from: promoEnd) : nil,
            promoBalance: hasPromo ? promoBalance : nil,
            dueDay: dueDay,
            autopay: autopay,
            notes: notes
        )
        store.upsertCard(saved)
        dismiss()
    }
}
