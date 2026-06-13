import SwiftUI
import FiHavenCore

/// "Maximize rewards" tool: pick a spending category and see which card
/// earns the most. Cards inside an active 0% promo are excluded (and
/// explained). Ranking logic lives in FiHavenCore's Rewards.
struct RewardsView: View {
    @EnvironmentObject var store: AppStore
    @State private var category = "Dining"

    private var creditCards: [Card] { store.data.cards.filter { ($0.type ?? "card") != "loan" } }
    private var anyRewards: Bool {
        creditCards.contains { $0.rewardBase > 0 || $0.rewardCategories.values.contains { $0 > 0 } }
    }
    private var ranking: Rewards.Ranking {
        Rewards.rank(store.data.cards, category: category, tz: store.tz)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if creditCards.isEmpty {
                    empty
                } else {
                    categoryPicker
                    if !anyRewards { hint }
                    let r = ranking
                    if let best = r.eligible.first { winner(best) }
                    if r.eligible.count > 1 { runnersUp(Array(r.eligible.dropFirst())) }
                    if !r.excluded.isEmpty { excludedSection(r.excluded) }
                }
            }
            .padding(16)
        }
        .background(Theme.bg.ignoresSafeArea())
        .navigationTitle("Rewards")
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
                }
            }
        }
    }

    private func winner(_ best: Rewards.Ranked) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Best for \(category.lowercased())")
                .font(Theme.ui(12)).foregroundStyle(Theme.muted).textCase(.uppercase)
            HStack {
                Text("💳 \(best.card.name.isEmpty ? "Card" : best.card.name)")
                    .font(Theme.ui(18, weight: .bold))
                Spacer()
                Text(ratePct(best.rate)).font(Theme.title(24)).foregroundStyle(Theme.accent)
            }
        }
        .padding(14)
        .background(Theme.accentBg)
        .overlay(RoundedRectangle(cornerRadius: Theme.radiusCard).stroke(Theme.accent, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard))
    }

    private func runnersUp(_ list: [Rewards.Ranked]) -> some View {
        VStack(spacing: 0) {
            ForEach(list) { e in
                HStack {
                    Text(e.card.name.isEmpty ? "Card" : e.card.name).foregroundStyle(Theme.text)
                    Spacer()
                    Text(ratePct(e.rate)).font(Theme.ui(15, weight: .semibold)).foregroundStyle(Theme.muted)
                }
                .padding(.vertical, 10)
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
                        Text("\(ratePct(e.rate)) · skipped").font(Theme.ui(12, weight: .semibold)).foregroundStyle(Theme.muted)
                    }
                    if let reason = e.reason {
                        Text("⚠ \(reason)").font(Theme.ui(11)).foregroundStyle(Theme.orange)
                    }
                }
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
}
