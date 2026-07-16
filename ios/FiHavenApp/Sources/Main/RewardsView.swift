import SwiftUI
import FiHavenCore

/// "Maximize rewards" tool: pick a spending category and see which card
/// earns the most. Cards inside an active 0% promo are excluded (and
/// explained). Ranking logic lives in FiHavenCore's Rewards.
struct RewardsView: View {
    @EnvironmentObject var store: AppStore
    @State private var category = "Dining"
    @State private var merchantQuery = ""
    @State private var showRateReport = false

    private var creditCards: [Card] { store.activeCards.filter { ($0.type ?? "card") != "loan" } }

    // Annualized category spend from manual + bank-synced transactions; feeds
    // the rewards estimate in the fee check and the offer-use detection.
    private var spendByCategory: [String: Double] {
        Rewards.categorySpendAnnual(store.data.transactions, tz: store.tz)
    }
    private var anyRewards: Bool {
        creditCards.contains { $0.rewardBase > 0 || $0.rewardCategories.values.contains { $0 > 0 } }
    }
    private var ranking: Rewards.Ranking {
        Rewards.rank(store.activeCards, category: category, tz: store.tz)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if creditCards.isEmpty {
                    empty
                } else {
                    categoryPicker
                    merchantField
                    if !anyRewards { hint }
                    let r = ranking
                    if let best = r.eligible.first { winner(best) }
                    if r.eligible.count > 1 { runnersUp(Array(r.eligible.dropFirst())) }
                    if !r.excluded.isEmpty { excludedSection(r.excluded) }
                    reportRateLink
                    if !walletPicks.isEmpty { walletPanel }
                    if !cardsWithPerks.isEmpty { perksPanel }
                    if !offerSuggestions.isEmpty { offerSuggestionsPanel }
                    if !activeOffers.isEmpty { offersPanel }
                    if !feeCards.isEmpty { feePanel }
                }
            }
            .padding(16)
        }
        .background(Theme.bg.ignoresSafeArea())
        .brandedNavigationBar("Rewards")
        .sheet(isPresented: $showRateReport) {
            RewardRateReportSheet(
                cards: creditCards,
                preferredCategory: category,
                preferredCardId: ranking.eligible.first?.card.id
            )
            .environmentObject(store)
        }
    }

    private var reportRateLink: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button("Spot a wrong rate? Report it") { showRateReport = true }
                .font(Theme.ui(13, weight: .semibold))
                .foregroundStyle(Theme.accent)
            Text("Helps us fix shared presets · edit your own rates on Cards")
                .font(Theme.ui(12))
                .foregroundStyle(Theme.muted)
        }
        .padding(.top, 4)
    }

    private var empty: some View {
        VStack(spacing: 8) {
            Text("💳").font(.system(size: 40))
            Text("No cards yet").font(Theme.ui(17, weight: .semibold))
            Text("Add a credit card and set its reward rates to get recommendations.")
                .font(Theme.ui(13)).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
        }.frame(maxWidth: .infinity).padding(.vertical, 40)
    }

    private var hint: some View {
        Text("No reward rates set yet. Edit a card and add a base rate (and category bonuses) to rank your cards per purchase.")
            .font(Theme.ui(13)).foregroundStyle(Theme.muted)
    }

    private var categoryPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Rewards.categories, id: \.self) { cat in
                    Button { category = cat } label: {
                        Text(cat)
                            .font(Theme.ui(13, weight: cat == category ? .semibold : .regular))
                            .padding(.horizontal, 14).padding(.vertical, 7)
                            .background(cat == category ? Theme.accent : Theme.surface)
                            .foregroundStyle(cat == category ? .white : Theme.text)
                            .clipShape(Capsule())
                            .overlay(Capsule().stroke(Theme.border, lineWidth: cat == category ? 0 : 1))
                    }
                    .accessibilityLabel(cat)
                    .accessibilityAddTraits(cat == category ? .isSelected : [])
                    .accessibilityHint("Shows the best card for this spending category")
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Spending category")
    }

    // Type a store name and jump to its reward category, so you instantly see
    // the best card for it. Unknown merchants leave a gentle note.
    private var merchantHint: String? {
        let q = merchantQuery.trimmingCharacters(in: .whitespaces)
        return q.isEmpty ? nil : Merchants.category(q)
    }

    private var merchantField: some View {
        HStack(spacing: 10) {
            TextField("Where are you shopping? (e.g. Starbucks)", text: $merchantQuery)
                .font(Theme.ui(13))
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(Theme.surface)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.border, lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .onChange(of: merchantQuery) { _, _ in
                    if let hint = merchantHint { category = hint }
                }
                .accessibilityLabel("Merchant lookup")
            if !merchantQuery.trimmingCharacters(in: .whitespaces).isEmpty {
                if let hint = merchantHint {
                    Text("→ \(hint)").font(Theme.ui(13, weight: .bold)).foregroundStyle(Theme.accent)
                } else {
                    Text("no match").font(Theme.ui(12)).foregroundStyle(Theme.muted)
                }
            }
        }
    }

    private func winner(_ best: Rewards.Ranked) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: "star.fill")
                    .font(.caption)
                    .foregroundStyle(Theme.accent)
                Text("Best for \(category.lowercased())")
                    .font(Theme.ui(12)).foregroundStyle(Theme.muted).textCase(.uppercase)
            }
            HStack {
                Text("💳 \(best.card.name.isEmpty ? "Card" : best.card.name)")
                    .font(Theme.ui(18, weight: .bold))
                if isRotating(best.card) { rotBadge }
                Spacer()
                HStack(spacing: 4) {
                    Text("Top rate")
                        .font(Theme.ui(11, weight: .medium))
                        .foregroundStyle(Theme.muted)
                    Text(ratePct(best.value)).font(Theme.title(24)).foregroundStyle(Theme.accent)
                }
            }
            Text(Rewards.explanation(best.card, category: category)
                 + (isRotating(best.card) ? " · activate this quarter" : ""))
                .font(Theme.ui(12)).foregroundStyle(Theme.muted)
        }
        .padding(14)
        .background(Theme.accentBg)
        .overlay(RoundedRectangle(cornerRadius: Theme.radiusCard).stroke(Theme.accent, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "Best card for \(category): \(best.card.name.isEmpty ? "Card" : best.card.name), \(ratePct(best.value)) reward rate"
        )
    }

    private func runnersUp(_ list: [Rewards.Ranked]) -> some View {
        VStack(spacing: 0) {
            ForEach(list) { e in
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        HStack(spacing: 6) {
                            Text(e.card.name.isEmpty ? "Card" : e.card.name).foregroundStyle(Theme.text)
                            if isRotating(e.card) { rotBadge }
                        }
                        if let bd = breakdown(e) {
                            Text(bd).font(Theme.ui(11)).foregroundStyle(Theme.muted)
                        }
                    }
                    Spacer()
                    HStack(spacing: 4) {
                        Text("Rate")
                            .font(Theme.ui(10, weight: .medium))
                            .foregroundStyle(Theme.muted)
                        Text(ratePct(e.value)).font(Theme.ui(15, weight: .semibold)).foregroundStyle(Theme.text)
                    }
                }
                .padding(.vertical, 10)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(e.card.name.isEmpty ? "Card" : e.card.name), \(ratePct(e.value)) reward rate")
                Divider().background(Theme.border)
            }
        }
        .padding(.horizontal, 14)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard))
    }

    private func excludedSection(_ list: [Rewards.Ranked]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Skipped (0% promo)")
                .font(Theme.ui(12)).foregroundStyle(Theme.muted).textCase(.uppercase)
            ForEach(list) { e in
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(e.card.name.isEmpty ? "Card" : e.card.name)
                            .foregroundStyle(Theme.muted)
                        Spacer()
                        HStack(spacing: 4) {
                            Image(systemName: "pause.circle.fill")
                                .font(.caption2)
                                .foregroundStyle(Theme.orange)
                            Text("\(ratePct(e.value)) · skipped")
                                .font(Theme.ui(12, weight: .semibold))
                                .foregroundStyle(Theme.text)
                        }
                    }
                    if let reason = e.reason {
                        HStack(alignment: .top, spacing: 6) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.caption2)
                                .foregroundStyle(Theme.orange)
                            Text(reason).font(Theme.ui(11)).foregroundStyle(Theme.muted)
                        }
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(
                    "\(e.card.name.isEmpty ? "Card" : e.card.name), skipped because of active promo, \(ratePct(e.value)) rate. \(e.reason ?? "")"
                )
            }
        }
        .padding(14)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard))
    }

    // ── Wallet at a glance ───────────────────────────────────────────
    private var walletPicks: [Rewards.WalletPick] {
        Rewards.walletStrategy(store.activeCards, categories: Rewards.categories, tz: store.tz).filter { $0.best != nil }
    }

    private var walletPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Your wallet at a glance").font(Theme.ui(12)).foregroundStyle(Theme.muted).textCase(.uppercase)
                Text("Best card for every category").font(Theme.ui(17, weight: .semibold))
            }
            ForEach(walletPicks, id: \.category) { pick in
                if let best = pick.best {
                    Button { category = pick.category } label: {
                        HStack(spacing: 10) {
                            Text(pick.category).font(Theme.ui(13)).foregroundStyle(Theme.muted)
                                .frame(width: 92, alignment: .leading)
                            Text(best.card.name.isEmpty ? "Card" : best.card.name)
                                .font(Theme.ui(14, weight: .semibold)).foregroundStyle(Theme.text)
                                .lineLimit(1)
                            if (best.card.rotatingPool?.contains(pick.category) ?? false) { rotBadge }
                            Spacer()
                            Text(ratePct(best.value)).font(Theme.ui(14, weight: .bold)).foregroundStyle(Theme.accent)
                        }
                        .padding(.vertical, 7)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(pick.category): best card \(best.card.name.isEmpty ? "Card" : best.card.name), \(ratePct(best.value))")
                }
            }
        }
        .padding(14)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard))
    }

    // ── Credits & perks ──────────────────────────────────────────────
    private var cardsWithPerks: [Card] { store.activeCards.filter { !$0.perks.isEmpty } }
    private var cal: Calendar { DateLogic.calendar(tz: store.tz) }
    private var now: Date { DateLogic.today(tz: store.tz) }
    private var unrealized: Double {
        Perks.unrealizedTotal(store.activeCards, usage: store.data.settings.perkUsage, date: now, cal: cal)
    }
    private static let freqLabels = ["monthly": "Monthly", "quarterly": "Quarterly",
                                     "semiannual": "Twice a year", "annual": "Yearly"]

    private func usedBinding(_ card: Card, _ perk: CardPerk) -> Binding<Double> {
        Binding(
            get: { Perks.used(store.data.settings.perkUsage, cardId: String(card.id), perk: perk, date: now, cal: cal) },
            set: { store.setPerkUsage(cardId: String(card.id), perk: perk, amount: $0) }
        )
    }

    private var perksPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Credits & perks").font(Theme.ui(12)).foregroundStyle(Theme.muted).textCase(.uppercase)
                    Text("Don’t leave money on the table").font(Theme.ui(17, weight: .semibold))
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 0) {
                    Text(Money.fmt(unrealized))
                        .font(Theme.title(22))
                        .foregroundStyle(unrealized < 0.005 ? Theme.green : Theme.accent)
                    Text("left this cycle").font(Theme.ui(11)).foregroundStyle(Theme.muted)
                }
            }
            ForEach(cardsWithPerks) { c in
                VStack(alignment: .leading, spacing: 6) {
                    Text("💳 \(c.name.isEmpty ? "Card" : c.name)").font(Theme.ui(13, weight: .semibold))
                    ForEach(c.perks) { p in
                        let rem = Perks.remaining(store.data.settings.perkUsage, cardId: String(c.id), perk: p, date: now, cal: cal)
                        HStack {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(p.label).foregroundStyle(Theme.text)
                                Text("\(Self.freqLabels[p.frequency] ?? "Monthly") · \(Money.fmt(p.amount)) · \(expiresLabel(p))")
                                    .font(Theme.ui(11)).foregroundStyle(Theme.muted)
                            }
                            Spacer()
                            HStack(spacing: 4) {
                                Text("used $").font(Theme.ui(11)).foregroundStyle(Theme.muted)
                                TextField("0", value: usedBinding(c, p), format: .number)
                                    .keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(width: 56)
                                    .accessibilityLabel("Amount used of \(p.label)")
                            }
                            Text(rem < 0.005 ? "✓" : Money.fmt(rem))
                                .font(Theme.ui(12, weight: .medium))
                                .foregroundStyle(rem < 0.005 ? Theme.green : Theme.accent)
                                .frame(width: 56, alignment: .trailing)
                        }
                        .opacity(rem < 0.005 ? 0.6 : 1)
                    }
                }
                .padding(.vertical, 4)
            }
        }
        .padding(14)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard))
    }

    private func expiresLabel(_ p: CardPerk) -> String {
        let d = Perks.expiresInDays(p.frequency, date: now, cal: cal)
        return d == 0 ? "ends today" : "\(d)d left"
    }

    // ── Card-linked offers ───────────────────────────────────────────
    private var activeOffers: [Offers.ActiveOffer] { Offers.active(store.activeCards, tz: store.tz) }
    private var offersSoon: Int { Offers.expiringSoon(store.activeCards, tz: store.tz) }
    private func offerExpiryLabel(_ d: Int?) -> String {
        guard let d else { return "no expiry" }
        if d <= 0 { return "ends today" }
        return d == 1 ? "1 day left" : "\(d) days left"
    }

    private var offersPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Card-linked offers").font(Theme.ui(12)).foregroundStyle(Theme.muted).textCase(.uppercase)
                    Text("Use them before they expire").font(Theme.ui(17, weight: .semibold))
                }
                Spacer()
                if offersSoon > 0 {
                    Text("\(offersSoon) expiring soon")
                        .font(Theme.ui(10, weight: .bold))
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Theme.orange.opacity(0.15)).foregroundStyle(Theme.orange)
                        .clipShape(Capsule())
                }
            }
            ForEach(activeOffers, id: \.offer.id) { item in
                let urgent = (item.daysLeft ?? 99) <= 3
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(item.offer.detail.isEmpty ? item.offer.merchant : "\(item.offer.merchant) · \(item.offer.detail)")
                            .font(Theme.ui(14, weight: .medium)).foregroundStyle(Theme.text)
                        Text("💳 \(item.card.name.isEmpty ? "Card" : item.card.name) · \(offerExpiryLabel(item.daysLeft))")
                            .font(Theme.ui(11)).foregroundStyle(urgent ? Theme.orange : Theme.muted)
                    }
                    Spacer()
                    Button("Mark used") {
                        store.setOfferUsed(cardId: String(item.card.id), offerId: item.offer.id, used: true)
                    }
                    .font(Theme.ui(12, weight: .semibold))
                    .padding(.horizontal, 12).padding(.vertical, 5)
                    .background(Theme.greenBg).foregroundStyle(Theme.green)
                    .clipShape(Capsule())
                    .buttonStyle(.plain)
                }
                .padding(.vertical, 4)
            }
        }
        .padding(14)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard))
    }

    // ── "Looks like you used this" offer suggestions ─────────────────
    private var offerSuggestions: [Offers.UseSuggestion] {
        Offers.useSuggestions(store.activeCards, transactions: store.data.transactions, tz: store.tz)
    }

    private var offerSuggestionsPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Looks like you used these").font(Theme.ui(12)).foregroundStyle(Theme.muted).textCase(.uppercase)
                Text("Mark them used?").font(Theme.ui(17, weight: .semibold))
            }
            Text("We spotted a charge at these offers’ merchants. Confirm if the offer terms were met — FiHaven never marks an offer used on its own.")
                .font(Theme.ui(11)).foregroundStyle(Theme.muted)
            ForEach(offerSuggestions, id: \.offer.id) { item in
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(item.offer.detail.isEmpty ? item.offer.merchant : "\(item.offer.merchant) · \(item.offer.detail)")
                            .font(Theme.ui(14, weight: .medium)).foregroundStyle(Theme.text)
                        Text("💳 \(item.card.name.isEmpty ? "Card" : item.card.name) · \(Money.fmt(item.tx.amount)) at \(item.tx.merchant) on \(item.tx.date)")
                            .font(Theme.ui(11)).foregroundStyle(Theme.green)
                    }
                    Spacer()
                    Button("Mark used") {
                        store.setOfferUsed(cardId: String(item.card.id), offerId: item.offer.id, used: true)
                    }
                    .font(Theme.ui(12, weight: .semibold))
                    .padding(.horizontal, 12).padding(.vertical, 5)
                    .background(Theme.greenBg).foregroundStyle(Theme.green)
                    .clipShape(Capsule())
                    .buttonStyle(.plain)
                }
                .padding(.vertical, 4)
            }
        }
        .padding(14)
        .background(Theme.surface)
        .overlay(RoundedRectangle(cornerRadius: Theme.radiusCard).stroke(Theme.green.opacity(0.4), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard))
    }

    // ── Annual-fee check ─────────────────────────────────────────────
    private var feeCards: [(card: Card, a: Perks.FeeAssessment)] {
        store.activeCards.compactMap { c in
            let est = Rewards.cardRewardsEstimateAnnual(c, spendByCategory: spendByCategory)
            return Perks.feeAssessment(c, usage: store.data.settings.perkUsage, date: now, cal: cal, rewardsEstimate: est).map { (c, $0) }
        }
    }
    private var hasSpendData: Bool { !spendByCategory.isEmpty }
    private static let monthShort = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                                     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    private func verdictLabel(_ v: Perks.FeeVerdict) -> String {
        switch v { case .keep: return "Pays for itself"; case .optimize: return "Use it more"; case .review: return "Review" }
    }
    private func verdictColor(_ v: Perks.FeeVerdict) -> Color {
        switch v { case .keep: return Theme.green; case .optimize: return Theme.accent; case .review: return Theme.orange }
    }
    private func feeMath(_ a: Perks.FeeAssessment) -> String {
        let rewards = a.rewards > 0 ? " + ~\(Money.fmt(a.rewards)) rewards" : ""
        return "Captures \(Money.fmt(a.captured)) perks\(rewards) of \(Money.fmt(a.potential + a.rewards)) · \(Money.fmt(a.fee)) fee · net \(a.net >= 0 ? "+" : "")\(Money.fmt(a.net))"
    }

    private var feePanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Annual fee check").font(Theme.ui(12)).foregroundStyle(Theme.muted).textCase(.uppercase)
                Text("Is the fee worth it?").font(Theme.ui(17, weight: .semibold))
            }
            Text(hasSpendData
                 ? "Fee vs. the value this card returns — perks you’re capturing plus an estimate of rewards earned from your category spend."
                 : "Fee vs. the value of this card’s perks. Add or sync transactions to factor in rewards earned from spending.")
                .font(Theme.ui(11)).foregroundStyle(Theme.muted)
            ForEach(feeCards, id: \.card.id) { item in
                let a = item.a
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text("💳 \(item.card.name.isEmpty ? "Card" : item.card.name)").font(Theme.ui(14, weight: .semibold))
                            if let m = item.card.feeMonth, m >= 1, m <= 12 {
                                Text("renews \(Self.monthShort[m])").font(Theme.ui(10)).foregroundStyle(Theme.muted)
                            }
                        }
                        Text(feeMath(a)).font(Theme.ui(11)).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    Text(verdictLabel(a.verdict))
                        .font(Theme.ui(10, weight: .bold))
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(verdictColor(a.verdict).opacity(0.15))
                        .foregroundStyle(verdictColor(a.verdict))
                        .clipShape(Capsule())
                }
                .padding(.vertical, 4)
            }
        }
        .padding(14)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard))
    }

    private func ratePct(_ r: Double) -> String {
        let rounded = (r * 100).rounded() / 100
        return (rounded == rounded.rounded() ? String(Int(rounded)) : String(rounded)) + "%"
    }

    // This category rotates on the card — its rate only applies while the user
    // has it activated for the quarter, so flag it.
    private func isRotating(_ card: Card) -> Bool {
        card.rotatingPool?.contains(category) ?? false
    }

    private var rotBadge: some View {
        Text("rotating")
            .font(Theme.ui(10, weight: .bold)).textCase(.uppercase)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(Theme.accentBg)
            .foregroundStyle(Theme.accent)
            .clipShape(Capsule())
    }

    // For a points card (point value ≠ 1), how the cash-equivalent breaks down.
    private func breakdown(_ e: Rewards.Ranked) -> String? {
        guard e.pointValue != 1 else { return nil }
        return "\(ratePct(e.rate).dropLast())× points · \(e.pointValue)¢/pt"
    }
}

/// Report a wrong preset rate to FiHaven (and optionally fix the local card).
private struct RewardRateReportSheet: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss

    let cards: [Card]
    let preferredCategory: String
    let preferredCardId: String?

    private static let baseRate = "Base rate (everything)"
    private var categories: [String] { [Self.baseRate] + Rewards.categories }

    @State private var cardId: String = ""
    @State private var category = ""
    @State private var rate = ""
    @State private var note = ""
    @State private var alsoFix = true
    @State private var busy = false
    @State private var message: String?

    private var card: Card? { cards.first { $0.id == cardId } }

    private var shownRate: Double? {
        guard let card, !category.isEmpty else { return nil }
        if category == Self.baseRate { return card.rewardBase }
        return card.rewardCategories[category]
    }

    private var correctRate: Double? {
        guard let v = Double(rate.trimmingCharacters(in: .whitespaces)),
              v >= 0, v <= 100 else { return nil }
        return v
    }

    private var isValid: Bool { card != nil && !category.isEmpty && correctRate != nil }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Card", selection: $cardId) {
                        ForEach(cards) { c in
                            Text(c.name.isEmpty ? "Card" : c.name).tag(c.id)
                        }
                    }
                    Picker("Category", selection: $category) {
                        Text("Which is wrong?").tag("")
                        ForEach(categories, id: \.self) { Text($0).tag($0) }
                    }
                } header: {
                    Text("What should we fix?")
                } footer: {
                    Text("Tell us what a preset got wrong so we can fix it for everyone.")
                }

                Section {
                    HStack {
                        Text("We show").foregroundStyle(Theme.muted)
                        Spacer()
                        Text(category.isEmpty ? "—" : (shownRate.map { "\($0)%" } ?? "none set"))
                            .font(Theme.mono(13))
                    }
                    HStack {
                        Text("Should be")
                        Spacer()
                        TextField("0", text: $rate)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 70)
                        Text("%").foregroundStyle(Theme.muted)
                    }
                    TextField("Note (optional)", text: $note, axis: .vertical)
                    Toggle("Also correct this rate on my card", isOn: $alsoFix)
                }

                if let message {
                    Section { Text(message).foregroundStyle(Theme.muted).font(Theme.ui(13)) }
                }

                Section {
                    Text("Sends the card, category, rates, and your email address to FiHaven.")
                        .font(Theme.ui(11))
                        .foregroundStyle(Theme.muted)
                }
            }
            .navigationTitle("Report a wrong rate")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Sending…" : "Send") { Task { await submit() } }
                        .disabled(!isValid || busy)
                }
            }
            .onAppear {
                cardId = preferredCardId ?? cards.first?.id ?? ""
                if categories.contains(preferredCategory) { category = preferredCategory }
            }
        }
    }

    private func submit() async {
        guard let card, let correct = correctRate else { return }
        busy = true
        let ours = shownRate
        if alsoFix {
            store.setCardRewardRate(
                cardId: card.id,
                category: category == Self.baseRate ? nil : category,
                rate: correct
            )
        }
        let ok = await store.reportRewardRate(
            card: card.name.isEmpty ? "Card" : card.name,
            issuer: card.issuer ?? "",
            category: category,
            ourRate: ours,
            correctRate: correct,
            note: note.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        busy = false
        if ok {
            message = alsoFix ? "Thanks — reported, and updated on your card." : "Thanks — report sent."
            try? await Task.sleep(nanoseconds: 900_000_000)
            dismiss()
        } else if alsoFix {
            message = "Updated on your card. Report couldn’t be sent right now."
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            dismiss()
        } else {
            message = "Couldn’t send the report — try again."
        }
    }
}
