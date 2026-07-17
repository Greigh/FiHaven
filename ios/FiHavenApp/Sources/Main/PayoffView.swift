import SwiftUI
import FiHavenCore

/// Debt-payoff planner: hero + strategy compare + account list.
/// Mortgages excluded by default (PMI/escrow); opt-in estimate available.
struct PayoffView: View {
    @EnvironmentObject var store: AppStore
    @State private var strategy: PayoffStrategy = .avalanche
    @State private var extra: Double = 100
    @State private var includeMortgage = false
    @State private var showCompare = false

    @State private var iBal: Double = 0
    @State private var iApr: Double = 0
    @State private var iPay: Double = 0
    @State private var splitAvail: Double = 0

    private var housingLoans: [Card] {
        store.activeCards.filter { Payoff.isHousingLoan($0) && debtOf($0) > 0 }
    }

    private var planCards: [Card] {
        store.activeCards.filter { debtOf($0) > 0 && (includeMortgage || !Payoff.isHousingLoan($0)) }
    }

    private func debtOf(_ c: Card) -> Double {
        if let cur = c.currentBalance, cur > 0 { return cur }
        return c.balance
    }

    private var simMin: PayoffResult? {
        Payoff.runPayoffSim(cards: store.activeCards, strategy: .none, extra: 0, tz: store.tz, includeMortgage: includeMortgage)
    }
    private var simSnow: PayoffResult? {
        Payoff.runPayoffSim(cards: store.activeCards, strategy: .snowball, extra: extra, tz: store.tz, includeMortgage: includeMortgage)
    }
    private var simAval: PayoffResult? {
        Payoff.runPayoffSim(cards: store.activeCards, strategy: .avalanche, extra: extra, tz: store.tz, includeMortgage: includeMortgage)
    }
    private var hero: PayoffResult? { strategy == .avalanche ? simAval : simSnow }
    private var avalIsBest: Bool {
        guard let a = simAval, let s = simSnow else { return true }
        return a.totalInterest <= s.totalInterest
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if !housingLoans.isEmpty {
                    mortgageToggle
                }
                extraControl
                if let r = hero {
                    heroCard(r)
                    strategyCompare
                    accounts(r)
                } else {
                    Text(emptyCopy)
                        .font(Theme.ui(15)).foregroundStyle(Theme.muted).ctCard()
                }
                calculatorTools
            }
            .padding()
        }
        .background(Theme.bg.ignoresSafeArea())
        .brandedNavigationBar("Payoff")
    }

    private var emptyCopy: String {
        if !housingLoans.isEmpty && !includeMortgage {
            return "Add a card or loan with a balance, or include your mortgage estimate above."
        }
        return "Add a card or loan with a balance to see a payoff plan."
    }

    private var mortgageToggle: some View {
        VStack(alignment: .leading, spacing: 8) {
            Toggle("Include mortgage (estimate only)", isOn: $includeMortgage)
                .font(Theme.ui(14, weight: .semibold))
            Text(includeMortgage
                 ? "Ignores PMI, escrow, taxes, and insurance — dates are approximate."
                 : "\(housingLoans.count) housing loan\(housingLoans.count == 1 ? "" : "s") hidden.")
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
                .accessibilityLabel("Extra monthly payment")
                .accessibilityValue(Money.fmt(extra))
                .onChange(of: extra) { _, v in
                    if v > 0 { strategy = avalIsBest ? .avalanche : .snowball }
                }
        }
        .ctCard()
    }

    private func heroCard(_ r: PayoffResult) -> some View {
        let saves: Double = {
            guard let m = simMin else { return 0 }
            return max(0, m.totalInterest - r.totalInterest)
        }()
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(strategy == .avalanche ? "Avalanche plan" : "Snowball plan")
                    .font(Theme.ui(12, weight: .bold))
                    .foregroundStyle(Theme.muted)
                if (strategy == .avalanche) == avalIsBest, extra > 0 {
                    Text("Recommended")
                        .font(Theme.ui(11, weight: .semibold))
                        .foregroundStyle(Theme.green)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Theme.green.opacity(0.12))
                        .clipShape(Capsule())
                }
            }
            Text("Debt-free by \(payoffDateLabel(r.payoffDate))")
                .font(Theme.ui(24, weight: .bold))
                .foregroundStyle(Theme.text)
            Text("\(r.months) months · \(Money.fmt(r.totalInterest)) interest"
                  + (saves > 0 && extra > 0 ? " · save \(Money.fmt(saves)) vs mins" : ""))
                .font(Theme.ui(13)).foregroundStyle(Theme.muted)
            Picker("Strategy", selection: $strategy) {
                Text("Snowball").tag(PayoffStrategy.snowball)
                Text("Avalanche").tag(PayoffStrategy.avalanche)
            }
            .pickerStyle(.segmented)
        }
        .ctCard()
    }

    private var strategyCompare: some View {
        HStack(alignment: .top, spacing: 12) {
            if let s = simSnow {
                strategyTile("Snowball", "Smallest first", s, isBest: !avalIsBest, tag: .snowball)
            }
            if let a = simAval {
                strategyTile("Avalanche", "Highest APR", a, isBest: avalIsBest, tag: .avalanche)
            }
        }
    }

    private func strategyTile(_ title: String, _ sub: String, _ r: PayoffResult, isBest: Bool, tag: PayoffStrategy) -> some View {
        Button {
            strategy = tag
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                if isBest && extra > 0 {
                    Text("Best for you").font(Theme.ui(10, weight: .semibold)).foregroundStyle(Theme.green)
                }
                Text(title).font(Theme.ui(15, weight: .semibold)).foregroundStyle(Theme.text)
                Text(sub).font(Theme.ui(11)).foregroundStyle(Theme.muted)
                Text(payoffDateLabel(r.payoffDate)).font(Theme.mono(16, weight: .semibold)).foregroundStyle(Theme.accent)
                Text("\(r.months) mo · \(Money.fmtShort(r.totalInterest)) interest")
                    .font(Theme.ui(11)).foregroundStyle(Theme.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Theme.surface)
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(strategy == tag ? Theme.accent.opacity(0.5) : Theme.border, lineWidth: strategy == tag ? 2 : 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
    }

    private func accounts(_ r: PayoffResult) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Accounts · \(strategy == .avalanche ? "Avalanche" : "Snowball")")
                    .font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.muted)
                Spacer()
                Button(showCompare ? "Hide compare" : "Compare both") { showCompare.toggle() }
                    .font(Theme.ui(12, weight: .semibold)).foregroundStyle(Theme.accent)
            }
            VStack(spacing: 0) {
                ForEach(Array(r.cards.enumerated()), id: \.element.id) { i, c in
                    if i > 0 { Divider().overlay(Theme.border) }
                    let src = planCards.first { $0.id == c.id }
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 6) {
                                    Text(c.name).font(Theme.ui(14, weight: .medium)).foregroundStyle(Theme.text)
                                    if let src, Payoff.isHousingLoan(src) {
                                        Text("Estimate").font(Theme.ui(10, weight: .semibold))
                                            .foregroundStyle(Theme.muted)
                                            .padding(.horizontal, 6).padding(.vertical, 2)
                                            .background(Theme.surface2).clipShape(Capsule())
                                    }
                                }
                                Text("\(Money.fmt(c.origBalance)) · started")
                                    .font(Theme.ui(11)).foregroundStyle(Theme.muted)
                            }
                            Spacer()
                            VStack(alignment: .trailing, spacing: 2) {
                                Text(c.paidOffMonth.map { "Month \($0)" } ?? "—")
                                    .font(Theme.mono(13, weight: .medium)).foregroundStyle(Theme.text)
                                Text("\(Money.fmtShort(c.interestPaid)) interest")
                                    .font(Theme.mono(10)).foregroundStyle(Theme.muted)
                            }
                        }
                        if showCompare, let snow = simSnow?.cards.first(where: { $0.id == c.id }),
                           let aval = simAval?.cards.first(where: { $0.id == c.id }) {
                            Text("Snowball: \(snow.paidOffMonth.map { "\($0) mo" } ?? "—") · Avalanche: \(aval.paidOffMonth.map { "\($0) mo" } ?? "—")")
                                .font(Theme.ui(11)).foregroundStyle(Theme.muted)
                        }
                    }
                    .padding(.vertical, 10)
                }
            }
            .ctCard()
        }
    }

    private func payoffDateLabel(_ date: Date) -> String {
        let f = DateFormatter()
        f.timeZone = store.tz
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = "MMMM yyyy"
        return f.string(from: date)
    }

    // ── Tools ────────────────────────────────────────────────
    private var calculatorTools: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Tools").font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.muted)
            interestTool
            splitterTool
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
            numField("Balance", $iBal, "$")
            numField("APR", $iApr, "%")
            numField("Monthly payment", $iPay, "$")
            Divider().overlay(Theme.border)
            statRow("Interest / month", Money.fmt(iMonthlyInterest))
            if let r = iResult {
                statRow("Paid off in", "\(r.months) mo")
                statRow("Total interest", Money.fmt(r.interest))
            } else if iBal > 0, iPay > 0 {
                Text("Payment doesn't cover the interest.").font(Theme.ui(12)).foregroundStyle(Theme.orange)
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
            .filter { includeMortgage || !Payoff.isHousingLoan($0) }
            .map { c -> (name: String, apr: Double, min: Double, bal: Double, pay: Double) in
                (c.name, c.regularAPR, c.minPayment, debtOf(c), 0)
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
}
