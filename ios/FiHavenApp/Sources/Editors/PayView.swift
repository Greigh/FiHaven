import SwiftUI
import FiHavenCore

/// Identifies the bill/card a `PayView` records a payment against.
struct PayTarget: Identifiable {
    let type: String   // "bill" | "card"
    let refId: String
    let name: String
    var id: String { "\(type)-\(refId)" }

    init(type: String, refId: String, name: String) {
        self.type = type
        self.refId = refId
        self.name = name
    }

    init(_ item: UpcomingItem) {
        self.type = item.type
        self.refId = item.refId
        self.name = item.name
    }
}

/// Record a payment toward a bill/card with quick presets — Full for
/// bills, Minimum / Recommended for cards — plus a custom amount and a
/// goal hint. Payments accumulate toward the monthly goal, so partial
/// installments are kept. Mirrors the web pay modal.
struct PayView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let target: PayTarget

    @State private var amount: Double = 0
    @State private var date = Date()
    @State private var note = ""
    @State private var started = false
    @State private var showDuplicateAlert = false
    @State private var showPromoClearAlert = false

    private struct Preset: Identifiable {
        let id = UUID()
        let label: String
        let sub: String
        let amount: Double
    }

    private var bill: Bill? { store.data.bills.first { String($0.id) == target.refId } }
    private var card: Card? { store.data.cards.first { String($0.id) == target.refId } }

    /// Each preset shows what's *left* toward its target after the payments
    /// already recorded this period, so paying part of a card and coming back
    /// doesn't re-suggest the whole amount; a target already covered drops out.
    private var presets: [Preset] {
        let paid = alreadyPaid
        let partly = paid > Schedule.paidEpsilon

        // The sub notes the payments already counted, so a shrunken figure is
        // never a mystery.
        func preset(_ label: String, _ sub: String, target: Double) -> Preset? {
            let left = max(0, target - paid)
            if partly && left <= Schedule.paidEpsilon { return nil }
            let note = partly ? "\(sub) · \(Money.fmt(paid)) of \(Money.fmt(target)) paid" : sub
            return Preset(label: label, sub: note, amount: left)
        }

        if target.type == "bill" {
            return [preset("Full amount", "The whole bill", target: bill?.amount ?? 0)].compactMap { $0 }
        }
        guard let c = card else { return [] }
        func cardTarget(_ kind: Schedule.PayTarget) -> Double {
            Schedule.payTarget(kind, card: c, paid: paid, tz: store.tz)
        }
        if (c.type ?? "card") == "loan" {
            // Loans: scheduled monthly payment, plus paying off the remaining
            // principal in full as an explicit (rarely-used) option.
            var ps = [preset("Monthly payment", "Your scheduled payment", target: cardTarget(.monthly))]
            if cardTarget(.payoff) > cardTarget(.monthly) + Schedule.paidEpsilon {
                ps.append(preset("Pay off in full", "Clears the remaining principal", target: cardTarget(.payoff)))
            }
            return ps.compactMap { $0 }
        }
        var ps = [preset("Minimum", "Minimum payment", target: cardTarget(.minimum))]
        if cardTarget(.recommended) > cardTarget(.minimum) + Schedule.paidEpsilon {
            let sub: String
            if let o = c.recommendedPayment, o > 0 { sub = "Your set payment" }
            else if c.hasPromo { sub = "Clears the 0% promo in time" }
            else { sub = "Pays off the balance" }
            ps.append(preset("Recommended", sub, target: cardTarget(.recommended)))
        }
        return ps.compactMap { $0 }
    }

    private var goal: Double { store.goalAmount(type: target.type, refId: target.refId) }
    private var alreadyPaid: Double { store.paidAmount(type: target.type, refId: target.refId) }

    private var policyLabel: String {
        if target.type == "bill" { return "full amount" }
        switch store.paidGoalPolicy {
        case .minimum:     return "minimum"
        case .recommended: return "recommended"
        case .full:        return "full balance"
        }
    }

    private var marksFullyPaid: Bool {
        guard goal > 0 else { return false }
        return alreadyPaid + amount >= goal - Schedule.paidEpsilon
    }

    private var hint: String {
        guard goal > 0 else { return "" }
        let projected = alreadyPaid + amount
        // Already at the goal before this payment: say so, instead of claiming
        // the amount being typed is what marks it paid.
        if alreadyPaid >= goal - Schedule.paidEpsilon {
            return "\(target.name) is already fully paid this period "
                + "(\(Money.fmt(alreadyPaid)) of \(Money.fmt(goal)) · \(policyLabel)). "
                + "Anything you record here is an extra payment."
        }
        if projected >= goal - Schedule.paidEpsilon {
            return "Marks \(target.name) fully paid (goal \(Money.fmt(goal)) · \(policyLabel))."
        }
        let soFar = alreadyPaid > Schedule.paidEpsilon
            ? " Already paid \(Money.fmt(alreadyPaid)) this month."
            : ""
        return "Goal is \(Money.fmt(goal)) (\(policyLabel)). "
            + "\(Money.fmt(goal - projected)) will remain after this.\(soFar)"
    }

    private func isSelected(_ p: Preset) -> Bool { abs(p.amount - amount) < Schedule.paidEpsilon }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach(presets) { p in
                        Button { amount = p.amount } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(p.label).foregroundStyle(Theme.text)
                                    Text(p.sub).font(Theme.ui(12)).foregroundStyle(Theme.muted)
                                }
                                Spacer()
                                Text(Money.fmt(p.amount)).font(Theme.mono(14)).foregroundStyle(Theme.text)
                                if isSelected(p) {
                                    HStack(spacing: 4) {
                                        Image(systemName: "checkmark.circle.fill")
                                        Text("Selected")
                                            .font(Theme.ui(10, weight: .medium))
                                    }
                                    .foregroundStyle(Theme.green)
                                }
                            }
                        }
                        .accessibilityLabel("\(p.label), \(Money.fmt(p.amount))")
                        .accessibilityValue(isSelected(p) ? "Selected" : "")
                        .accessibilityAddTraits(isSelected(p) ? .isSelected : [])
                    }
                    CurrencyField(label: "Amount", value: $amount)
                        .foregroundStyle(Theme.text)
                } header: {
                    Text("How much?")
                } footer: {
                    if !hint.isEmpty { payHintFooter }
                }

                Section {
                    DatePicker("Date paid", selection: $date, displayedComponents: .date)
                }

                Section("Note") {
                    TextField("Confirmation #, etc.", text: $note, axis: .vertical)
                }
            }
            .navigationTitle("Pay · \(target.name)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(amount <= 0)
                        .accessibilityHint(amount <= 0 ? "Enter an amount greater than zero" : "Records this payment")
                }
            }
            .onAppear(perform: start)
            .alert("Additional Payment?", isPresented: $showDuplicateAlert) {
                Button("Save Payment") { performSave() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("You have already recorded \(Money.fmt(alreadyPaid)) in payments for this card/loan this month. Is this an additional payment?")
            }
            .alert("Remove 0% promo?", isPresented: $showPromoClearAlert) {
                Button("Remove promo") {
                    store.resolvePromoClearPrompt(refId: target.refId, clear: true)
                    dismiss()
                }
                Button("Keep promo", role: .cancel) {
                    store.resolvePromoClearPrompt(refId: target.refId, clear: false)
                    dismiss()
                }
            } message: {
                Text("This card is paid off. Remove the 0% promo?")
            }
        }
    }

    private var payHintFooter: some View {
        Group {
            if marksFullyPaid {
                HStack(alignment: .top, spacing: 6) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.caption)
                        .foregroundStyle(Theme.green)
                    Text(hint).font(Theme.ui(12)).foregroundStyle(Theme.text)
                }
                .accessibilityElement(children: .combine)
            } else {
                Text(hint).font(Theme.ui(12)).foregroundStyle(Theme.muted)
            }
        }
    }

    private func start() {
        guard !started else { return }
        started = true
        // Default to whatever still gets the item to its goal. Once the goal
        // is met the field starts at 0 — an extra payment is a deliberate
        // amount to type, not the whole recommendation offered up again.
        let remaining = max(0, goal - alreadyPaid)
        if remaining > Schedule.paidEpsilon {
            amount = remaining
        } else {
            amount = alreadyPaid > Schedule.paidEpsilon ? 0 : max(0, goal)
        }
    }

    private func save() {
        let day = Calendar.current.component(.day, from: date)
        if target.type == "card" && day >= 15 && alreadyPaid > Schedule.paidEpsilon {
            showDuplicateAlert = true
        } else {
            performSave()
        }
    }

    private func performSave() {
        store.recordPayment(
            type: target.type, refId: target.refId, name: target.name,
            amount: amount, date: date, note: note
        )
        if target.type == "card", store.cardNeedsPromoClearPrompt(refId: target.refId) {
            showPromoClearAlert = true
        } else {
            dismiss()
        }
    }
}
