import SwiftUI
import FiHavenCore

/// Debt-payoff simulator: strategy + extra payment → months, interest,
/// payoff date, and per-card payoff timing. Powered by Payoff.runPayoffSim.
struct PayoffView: View {
    @EnvironmentObject var store: AppStore
    @State private var strategy: PayoffStrategy = .avalanche
    @State private var extra: Double = 100

    // Calculator tools
    @State private var iBal: Double = 0
    @State private var iApr: Double = 0
    @State private var iPay: Double = 0
    @State private var splitAvail: Double = 0
    @State private var calcDisplay = "0"
    @State private var calcAccumulator: Double?
    @State private var calcPending: String?
    @State private var calcStartNew = false

    private var result: PayoffResult? {
        Payoff.runPayoffSim(cards: store.activeCards, strategy: strategy, extra: extra, tz: store.tz)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                strategyPicker
                extraControl

                if let r = result {
                    summaryCards(r)
                    perCard(r)
                } else {
                    Text("Add a card or loan with a balance to see a payoff plan.")
                        .font(Theme.ui(15)).foregroundStyle(Theme.muted).ctCard()
                }

                calculatorTools
            }
            .padding()
        }
        .background(Theme.bg.ignoresSafeArea())
        .brandedNavigationBar("Payoff")
    }

    private var strategyPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            FieldLabel(text: "Strategy")
            Picker("Strategy", selection: $strategy) {
                Text("Minimums").tag(PayoffStrategy.none)
                Text("Snowball").tag(PayoffStrategy.snowball)
                Text("Avalanche").tag(PayoffStrategy.avalanche)
            }
            .pickerStyle(.segmented)
            Text(strategyBlurb)
                .font(Theme.ui(12)).foregroundStyle(Theme.muted)
        }
        .ctCard()
    }

    private var extraControl: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                FieldLabel(text: "Extra per month")
                Spacer()
                Text(Money.fmt(extra)).font(Theme.mono(15, weight: .medium)).foregroundStyle(Theme.accent)
            }
            Slider(value: $extra, in: 0...1000, step: 25)
                .tint(Theme.accent)
                .disabled(strategy == .none)
                .accessibilityLabel("Extra monthly payment")
                .accessibilityValue(Money.fmt(extra))
            if strategy == .none {
                Text("Extra applies only to Snowball or Avalanche.")
                    .font(Theme.ui(11)).foregroundStyle(Theme.muted)
            }
        }
        .ctCard()
    }

    private func summaryCards(_ r: PayoffResult) -> some View {
        HStack(spacing: 12) {
            stat("Debt-free in", "\(r.months) mo", .accent, subtitle: payoffDateLabel(r.payoffDate))
            interestStat(r.totalInterest)
        }
    }

    private func interestStat(_ interest: Double) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            FieldLabel(text: "Total interest")
            SemanticAmount(
                value: Money.fmtShort(interest),
                tone: .negative,
                font: Theme.mono(22, weight: .semibold),
                statusWords: "Cost"
            )
            .minimumScaleFactor(0.6)
            .lineLimit(1)
        }
        .ctCard()
    }

    private func stat(_ label: String, _ value: String, _ tone: A11y.MoneyTone, subtitle: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            FieldLabel(text: label)
            SemanticAmount(value: value, tone: tone, font: Theme.mono(22, weight: .semibold))
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            if let subtitle {
                Text(subtitle).font(Theme.ui(11)).foregroundStyle(Theme.muted)
            }
        }
        .ctCard()
    }

    private func perCard(_ r: PayoffResult) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("By account").font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.muted)
            VStack(spacing: 0) {
                ForEach(Array(r.cards.enumerated()), id: \.element.id) { i, c in
                    if i > 0 { Divider().overlay(Theme.border) }
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(c.name).font(Theme.ui(14, weight: .medium)).foregroundStyle(Theme.text)
                            Text("Started at \(Money.fmt(c.origBalance))")
                                .font(Theme.ui(11)).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(c.paidOffMonth.map { "Month \($0)" } ?? "Not paid off")
                                .font(Theme.mono(13, weight: .medium)).foregroundStyle(Theme.text)
                            Text("\(Money.fmtShort(c.interestPaid)) interest")
                                .font(Theme.mono(10)).foregroundStyle(Theme.muted)
                        }
                    }
                    .padding(.vertical, 10)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(
                        "\(c.name), paid off \(c.paidOffMonth.map { "month \($0)" } ?? "not in plan"), \(Money.fmtShort(c.interestPaid)) interest"
                    )
                }
            }
            .ctCard()
        }
    }

    private var strategyBlurb: String {
        switch strategy {
        case .none: return "Pay only the minimums on every card and loan."
        case .snowball: return "Throw extra at the smallest balance first for quick wins."
        case .avalanche: return "Throw extra at the highest APR first to minimize interest."
        }
    }

    private func payoffDateLabel(_ date: Date) -> String {
        let f = DateFormatter()
        f.timeZone = store.tz
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = "MMMM yyyy"
        return f.string(from: date)
    }

    // ── Calculator tools ─────────────────────────────────────────────
    private var calculatorTools: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Calculator tools").font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.muted)
            interestTool
            splitterTool
            calculatorTool
        }
    }

    @ViewBuilder
    private func numField(_ label: String, _ value: Binding<Double>, _ suffix: String) -> some View {
        Group {
            if suffix == "%" {
                PercentField(label: label, value: value)
            } else {
                CurrencyField(label: label, value: value)
            }
        }
        .font(Theme.ui(13))
        .foregroundStyle(Theme.muted)
    }

    private var iMonthlyInterest: Double { iBal * iApr / 100 / 12 }
    private var iResult: (months: Int, interest: Double)? {
        let r = iApr / 100 / 12
        guard iBal > 0, iPay > 0 else { return nil }
        if r > 0, iPay <= iBal * r { return nil }
        var b = iBal, total = 0.0, m = 0
        while b > 0.005, m < 1200 { let i = b * r; total += i; b = b + i - iPay; m += 1 }
        return (m, total)
    }

    private var interestTool: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Interest & payoff estimator").font(Theme.ui(15, weight: .semibold)).foregroundStyle(Theme.text)
            Text("Monthly interest on a balance, and how long to clear it at a fixed payment.")
                .font(Theme.ui(12)).foregroundStyle(Theme.muted)
            numField("Balance", $iBal, "$")
            numField("APR", $iApr, "%")
            numField("Monthly payment", $iPay, "$")
            Divider().overlay(Theme.border)
            statRow("Interest / month", Money.fmt(iMonthlyInterest))
            if let r = iResult {
                statRow("Paid off in", "\(r.months) mo")
                statRow("Total interest", Money.fmt(r.interest))
            } else if iBal > 0, iPay > 0 {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(Theme.orange)
                    Text("Payment doesn't cover the interest.")
                        .font(Theme.ui(12))
                        .foregroundStyle(Theme.text)
                }
            }
        }
        .ctCard()
    }

    private func statRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).font(Theme.ui(12)).foregroundStyle(Theme.muted)
            Spacer()
            Text(value).font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.text)
        }
    }

    private var splitPlan: [(name: String, apr: Double, pay: Double)] {
        var list = store.activeCards
            .filter { ($0.type ?? "card") == "card" || $0.type == "loan" }
            .map { c -> (name: String, apr: Double, min: Double, bal: Double, pay: Double) in
                let bal = (c.currentBalance ?? 0) > 0 ? (c.currentBalance ?? 0) : c.balance
                return (c.name, c.regularAPR, c.minPayment, bal, 0)
            }
            .filter { $0.bal > 0 }
            .sorted { $0.apr > $1.apr }
        var remaining = splitAvail
        for i in list.indices { let m = min(list[i].min, list[i].bal, remaining); list[i].pay += m; remaining -= m }
        for i in list.indices { if remaining <= 0.005 { break }; let e = min(list[i].bal - list[i].pay, remaining); list[i].pay += e; remaining -= e }
        return list.map { ($0.name, $0.apr, $0.pay) }
    }

    private var splitterTool: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Payment splitter").font(Theme.ui(15, weight: .semibold)).foregroundStyle(Theme.text)
            Text("Covers minimums first, then attacks the highest APR.")
                .font(Theme.ui(12)).foregroundStyle(Theme.muted)
            numField("Available", $splitAvail, "$")
            let plan = splitPlan
            if plan.isEmpty {
                Text("Add a credit card or loan to use the splitter.").font(Theme.ui(12)).foregroundStyle(Theme.muted)
            } else {
                ForEach(Array(plan.enumerated()), id: \.offset) { _, p in
                    HStack {
                        Text(p.name).font(Theme.ui(13)).foregroundStyle(Theme.text)
                        Text("\(Int(p.apr))%").font(Theme.ui(11)).foregroundStyle(Theme.muted)
                        Spacer()
                        Text(Money.fmt(p.pay)).font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.text)
                    }
                }
            }
        }
        .ctCard()
    }

    private var calculatorTool: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Calculator").font(Theme.ui(15, weight: .semibold)).foregroundStyle(Theme.text)
            Text(calcDisplay)
                .font(Theme.mono(26, weight: .semibold)).foregroundStyle(Theme.text)
                .frame(maxWidth: .infinity, alignment: .trailing).lineLimit(1).minimumScaleFactor(0.5)
                .padding(12).background(Theme.surface2).clipShape(RoundedRectangle(cornerRadius: 10))
                .accessibilityLabel("Calculator display")
                .accessibilityValue(calcDisplay)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 4), spacing: 6) {
                ForEach(["C", "⌫", "%", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "±", "0", ".", "="], id: \.self) { k in
                    Button { calcKey(k) } label: {
                        Text(k).font(Theme.ui(18, weight: .medium))
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(isCalcOp(k) ? Theme.accent.opacity(0.12) : Theme.surface2)
                            .foregroundStyle(isCalcOp(k) ? Theme.accent : Theme.text)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(A11y.payoffCalculatorKeyLabel(k))
                }
            }
        }
        .ctCard()
    }

    private func isCalcOp(_ k: String) -> Bool { ["÷", "×", "−", "+", "="].contains(k) }

    private func calcKey(_ k: String) {
        switch k {
        case "C": calcDisplay = "0"; calcAccumulator = nil; calcPending = nil; calcStartNew = false
        case "⌫": calcDisplay = calcDisplay.count > 1 ? String(calcDisplay.dropLast()) : "0"
        case "±": calcDisplay = calcFormat(-(Double(calcDisplay) ?? 0))
        case "%": calcDisplay = calcFormat((Double(calcDisplay) ?? 0) / 100)
        case "÷", "×", "−", "+": calcOp(k)
        case "=": calcEquals()
        default:
            if calcStartNew { calcDisplay = "0"; calcStartNew = false }
            if k == "." { if !calcDisplay.contains(".") { calcDisplay += "." } }
            else { calcDisplay = calcDisplay == "0" ? k : calcDisplay + k }
        }
    }
    private func calcOp(_ op: String) {
        let val = Double(calcDisplay) ?? 0
        if let acc = calcAccumulator, let p = calcPending, !calcStartNew {
            let res = calcApply(acc, p, val); calcAccumulator = res; calcDisplay = calcFormat(res)
        } else {
            calcAccumulator = val
        }
        calcPending = op; calcStartNew = true
    }
    private func calcEquals() {
        guard let acc = calcAccumulator, let p = calcPending else { calcStartNew = true; return }
        calcDisplay = calcFormat(calcApply(acc, p, Double(calcDisplay) ?? 0))
        calcAccumulator = nil; calcPending = nil; calcStartNew = true
    }
    private func calcApply(_ a: Double, _ op: String, _ b: Double) -> Double {
        switch op {
        case "+": return a + b
        case "−": return a - b
        case "×": return a * b
        case "÷": return b == 0 ? 0 : a / b
        default: return b
        }
    }
    private func calcFormat(_ v: Double) -> String {
        if v == v.rounded(), abs(v) < 1e15 { return String(Int(v)) }
        return String((v * 1e6).rounded() / 1e6)
    }
}
