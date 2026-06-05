import SwiftUI
import FiHavenCore

/// Debt-payoff simulator: strategy + extra payment → months, interest,
/// payoff date, and per-card payoff timing. Powered by Payoff.runPayoffSim.
struct PayoffView: View {
    @EnvironmentObject var store: AppStore
    @State private var strategy: PayoffStrategy = .avalanche
    @State private var extra: Double = 100

    private var result: PayoffResult? {
        Payoff.runPayoffSim(cards: store.data.cards, strategy: strategy, extra: extra, tz: store.tz)
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
                    Text("Add a card with a balance to see a payoff plan.")
                        .font(Theme.ui(15)).foregroundStyle(Theme.muted).ctCard()
                }
            }
            .padding()
        }
        .background(Theme.bg.ignoresSafeArea())
        .navigationTitle("Payoff")
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
            if strategy == .none {
                Text("Extra applies only to Snowball or Avalanche.")
                    .font(Theme.ui(11)).foregroundStyle(Theme.muted)
            }
        }
        .ctCard()
    }

    private func summaryCards(_ r: PayoffResult) -> some View {
        HStack(spacing: 12) {
            stat("Debt-free in", "\(r.months) mo", Theme.accent, subtitle: payoffDateLabel(r.payoffDate))
            stat("Total interest", Money.fmtShort(r.totalInterest), Theme.red)
        }
    }

    private func stat(_ label: String, _ value: String, _ color: Color, subtitle: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            FieldLabel(text: label)
            Text(value).font(Theme.mono(22, weight: .semibold)).foregroundStyle(color)
                .minimumScaleFactor(0.6).lineLimit(1)
            if let subtitle {
                Text(subtitle).font(Theme.ui(11)).foregroundStyle(Theme.muted)
            }
        }
        .ctCard()
    }

    private func perCard(_ r: PayoffResult) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("By card").font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.muted)
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
                            Text(c.paidOffMonth.map { "Month \($0)" } ?? "—")
                                .font(Theme.mono(13, weight: .medium)).foregroundStyle(Theme.text)
                            Text("\(Money.fmtShort(c.interestPaid)) interest")
                                .font(Theme.mono(10)).foregroundStyle(Theme.muted)
                        }
                    }
                    .padding(.vertical, 10)
                }
            }
            .ctCard()
        }
    }

    private var strategyBlurb: String {
        switch strategy {
        case .none: return "Pay only the minimums on every card."
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
}
