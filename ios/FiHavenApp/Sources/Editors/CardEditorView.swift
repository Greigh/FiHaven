import SwiftUI
import FiHavenCore

/// Add/edit a credit card or loan.
struct CardEditorView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss

    let card: Card?
    var defaultType: String = "card"

    @State private var type = "card"
    @State private var name = ""
    @State private var issuer = ""
    @State private var balance: Double = 0
    @State private var currentBalance = ""
    @State private var limit: Double = 0
    @State private var minPayment: Double = 0
    @State private var recommendedPayment: Double = 0
    @State private var regularAPR: Double = 0
    @State private var dueDay = 1
    @State private var autopay = false
    @State private var notes = ""
    @State private var lastDigits = ""
    @State private var network = ""

    @State private var hasPromo = false
    @State private var promoAPR: Double = 0
    @State private var promoBalance: Double = 0
    @State private var promoEnd = Date()

    @State private var rewardBase: Double = 0
    @State private var rewardCats: [String: Double] = [:]
    @State private var rotatingPool: [String] = []
    @State private var rotatingRate: Double = 5
    @State private var pointValue: Double = 1

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Account Type", selection: $type) {
                        Text("Credit Card").tag("card")
                        Text("Loan").tag("loan")
                    }
                    .pickerStyle(.segmented)
                    
                    TextField("Name", text: $name)
                        .onChange(of: name) { _, _ in trySuggestPreset() }
                    TextField("Issuer / Bank", text: $issuer)
                        .onChange(of: issuer) { _, _ in trySuggestPreset() }
                    TextField("Ends in (Last 4/5 digits)", text: $lastDigits)
                        .keyboardType(.numberPad)
                        .onChange(of: lastDigits) { _, newValue in
                            if newValue.count > 5 {
                                lastDigits = String(newValue.prefix(5))
                            }
                        }
                    Picker("Network", selection: $network) {
                        Text("—").tag("")
                        ForEach(["Visa", "Mastercard", "Amex", "Discover", "Other"], id: \.self) { Text($0).tag($0) }
                    }
                }

                Section {
                    money(type == "loan" ? "Remaining Principal" : "Statement Balance", $balance)
                    
                    if type == "card" {
                        HStack {
                            Text("Current Balance (Optional)")
                            Spacer()
                            Text("$").foregroundStyle(Theme.muted)
                            TextField("0", text: $currentBalance)
                                .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                        }
                        money("Credit limit", $limit)
                    }
                    
                    money(type == "loan" ? "Monthly payment" : "Minimum payment", $minPayment)
                    
                    if type == "card" {
                        money("Recommended payment", $recommendedPayment)
                    }
                    
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
                    if type == "card" {
                        Text("Recommended payment is optional — leave it at 0 to default to the full balance (or the 0%-promo payoff).")
                    }
                }

                if type == "card" {
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
                }

                if type == "card" {
                    Section {
                        Menu {
                            ForEach(Rewards.cardPresets) { p in
                                Button(p.label) { applyPreset(p) }
                            }
                        } label: {
                            HStack {
                                Text("Start from a known card…").foregroundStyle(Theme.accent)
                                Spacer()
                                Image(systemName: "chevron.down")
                                    .font(.caption)
                                    .foregroundStyle(Theme.muted)
                                    .accessibilityHidden(true)
                            }
                        }
                        .accessibilityLabel("Start from a known card preset")
                        .accessibilityHint("Opens reward rate presets for popular cards")
                        HStack {
                            Text("Base reward rate")
                            Spacer()
                            TextField("0", value: $rewardBase, format: .number)
                                .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                            Text("%").foregroundStyle(Theme.muted)
                        }
                        HStack {
                            Text("Point value")
                            Spacer()
                            TextField("1.0", value: $pointValue, format: .number)
                                .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                            Text("¢/pt").foregroundStyle(Theme.muted)
                        }
                        ForEach(Rewards.categories, id: \.self) { cat in
                            if !rotatingPool.contains(cat) {
                                HStack {
                                    Text(cat)
                                    Spacer()
                                    TextField("—", value: catBinding(cat), format: .number)
                                        .keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(width: 64)
                                    Text("%").foregroundStyle(Theme.muted)
                                }
                            }
                        }
                        if !rotatingPool.isEmpty {
                            Text("Rotating \(Int(rotatingRate))% — tick this quarter’s active categories")
                                .font(.caption).foregroundStyle(Theme.muted)
                            ForEach(rotatingPool, id: \.self) { cat in
                                Toggle(cat, isOn: rotBinding(cat))
                            }
                        }
                    } header: {
                        Text("Rewards")
                    } footer: {
                        Text("Powers the “which card should I use?” tool. A category bonus overrides the base rate; leave a category at 0 to use the base.")
                    }
                }

                Section("Notes") {
                    TextField("Optional", text: $notes, axis: .vertical)
                }

                if card != nil {
                    Section {
                        Button(type == "loan" ? "Delete loan" : "Delete card", role: .destructive) {
                            if let card { store.deleteCard(card) }
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(card == nil ? (type == "loan" ? "New Loan" : "New Card") : (type == "loan" ? "Edit Loan" : "Edit Card"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(name.isEmpty)
                        .accessibilityHint(name.isEmpty ? "Enter a name to save" : "Saves this \(type == "loan" ? "loan" : "card")")
                }
            }
            .onAppear(perform: load)
        }
    }

    // Auto-fill name/issuer/network (without clobbering non-empty fields) and
    // the reward rates from a preset. Everything stays editable afterward.
    private func applyPreset(_ p: Rewards.CardPreset) {
        if name.isEmpty { name = p.name }
        if issuer.isEmpty { issuer = p.issuer }
        network = p.network
        rewardBase = p.rewardBase
        rewardCats = p.rewardCategories
        rotatingPool = p.rotatingPool ?? []
        rotatingRate = p.rotatingRate ?? 5
        pointValue = p.pointValue ?? 1
    }

    private func trySuggestPreset() {
        guard type == "card", rewardBase == 0, rewardCats.isEmpty else { return }
        guard let p = Rewards.suggestCardPreset(name: name, issuer: issuer) else { return }
        applyPreset(p)
    }

    // Binding for an optional per-category reward rate (0 == unset).
    private func catBinding(_ cat: String) -> Binding<Double> {
        Binding(get: { rewardCats[cat] ?? 0 }, set: { rewardCats[cat] = $0 })
    }

    // Toggle for a rotating-pool category: on writes the elevated rate, off clears it.
    private func rotBinding(_ cat: String) -> Binding<Bool> {
        Binding(get: { (rewardCats[cat] ?? 0) > 0 },
                set: { rewardCats[cat] = $0 ? rotatingRate : 0 })
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
        guard let card else { type = defaultType; return }
        type = card.type ?? "card"
        name = card.name
        issuer = card.issuer ?? ""
        balance = card.balance
        currentBalance = card.currentBalance.map { String($0) } ?? ""
        limit = card.limit
        minPayment = card.minPayment
        recommendedPayment = card.recommendedPayment ?? 0
        regularAPR = card.regularAPR
        dueDay = card.dueDay ?? 1
        autopay = card.autopay
        notes = card.notes
        lastDigits = card.lastDigits ?? ""
        network = card.network ?? ""
        hasPromo = card.hasPromo
        promoAPR = card.promoAPR ?? 0
        promoBalance = card.promoBalance ?? card.balance
        if let parsed = DateLogic.parseDate(card.promoEndDate, tz: store.tz) {
            promoEnd = parsed
        }
        rewardBase = card.rewardBase
        rewardCats = card.rewardCategories
        rotatingPool = card.rotatingPool ?? []
        rotatingRate = card.rotatingRate ?? 5
        pointValue = card.pointValue ?? 1
    }

    private func save() {
        let f = DateFormatter()
        f.timeZone = store.tz
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"

        let isLoan = type == "loan"
        let saved = Card(
            id: card?.id ?? AppStore.newID(),
            name: name.trimmingCharacters(in: .whitespaces),
            balance: balance,
            limit: isLoan ? 0 : limit,
            minPayment: minPayment,
            recommendedPayment: isLoan ? nil : (recommendedPayment > 0 ? recommendedPayment : nil),
            regularAPR: regularAPR,
            hasPromo: isLoan ? false : hasPromo,
            promoAPR: (isLoan ? false : hasPromo) ? promoAPR : nil,
            promoEndDate: (isLoan ? false : hasPromo) ? f.string(from: promoEnd) : nil,
            promoBalance: (isLoan ? false : hasPromo) ? promoBalance : nil,
            dueDay: dueDay,
            autopay: autopay,
            notes: notes.trimmingCharacters(in: .whitespacesAndNewlines),
            type: type,
            issuer: issuer.isEmpty ? nil : issuer.trimmingCharacters(in: .whitespaces),
            currentBalance: isLoan ? nil : Double(currentBalance),
            lastDigits: lastDigits.isEmpty ? nil : lastDigits.trimmingCharacters(in: .whitespaces),
            network: network.isEmpty ? nil : network,
            rewardBase: isLoan ? 0 : rewardBase,
            rewardCategories: isLoan ? [:] : rewardCats.filter { $0.value > 0 },
            rotatingPool: (isLoan || rotatingPool.isEmpty) ? nil : rotatingPool,
            rotatingRate: (isLoan || rotatingPool.isEmpty) ? nil : rotatingRate,
            pointValue: (isLoan || pointValue == 1) ? nil : pointValue
        )
        store.upsertCard(saved)
        dismiss()
    }
}
