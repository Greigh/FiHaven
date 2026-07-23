import Foundation
import FiHavenCore

func runIssuerIconChecks() {
    section("IssuerIcons — known issuers") {
        checkEqual(
            IssuerIcons.emoji(for: Card(id: "1", name: "Sapphire", issuer: "Chase")),
            "🔵", "Chase"
        )
        checkEqual(
            IssuerIcons.emoji(for: Card(id: "1", name: "Gold", issuer: "Amex")),
            "🟩", "Amex alias"
        )
        checkEqual(
            IssuerIcons.emoji(for: Card(id: "1", name: "Blue", issuer: "Bilt")),
            "🏠", "Bilt"
        )
        checkEqual(
            IssuerIcons.emoji(for: Card(id: "1", name: "Double Cash", issuer: "Citi")),
            "🔴", "Citi"
        )
        checkEqual(
            IssuerIcons.emoji(for: Card(id: "1", name: "Savor", issuer: "Capital One")),
            "⬛", "Capital One"
        )
        checkEqual(
            IssuerIcons.emoji(for: Card(id: "1", name: "Card", issuer: "Discover")),
            "🟠", "Discover"
        )
        checkEqual(
            IssuerIcons.emoji(for: Card(id: "1", name: "Card", issuer: "Apple")),
            "🍎", "Apple"
        )
        checkEqual(
            IssuerIcons.emoji(for: Card(id: "1", name: "Card", issuer: "Target")),
            "🎯", "Target"
        )
    }

    section("IssuerIcons — name match + loans + fallback") {
        checkEqual(
            IssuerIcons.emoji(for: Card(id: "1", name: "Chase Freedom Flex")),
            "🔵", "issuer from name"
        )
        checkEqual(
            IssuerIcons.emoji(for: Card(id: "1", name: "Mortgage", type: "loan")),
            "🏦", "loan glyph"
        )
        checkEqual(
            IssuerIcons.emoji(for: Card(id: "1", name: "Mystery Rewards")),
            "💳", "unknown → card glyph"
        )
        checkEqual(
            IssuerIcons.iconInfo(for: Card(id: "1", name: "Sapphire", issuer: "Chase")),
            .emoji("🔵"),
            "iconInfo wraps emoji"
        )
    }

    section("IssuerIcons — normalize") {
        checkEqual(IssuerIcons.normalize("American Express"), "americanexpress", "spaces stripped")
        checkEqual(IssuerIcons.normalize("U.S. Bank"), "usbank", "punctuation stripped")
        checkEqual(IssuerIcons.normalize(""), "", "empty")
    }

    section("IssuerIcons — upcoming card rows") {
        let tz = utcTZ
        let now = makeDate(2026, 6, 15, tz: tz)
        let cards = [
            Card(id: "10", name: "Sapphire", minPayment: 35, dueDay: 20, issuer: "Chase"),
            Card(id: "11", name: "Blue", minPayment: 10, dueDay: 18, issuer: "Bilt"),
        ]
        let items = Schedule.buildUpcomingItems(bills: [], cards: cards, tz: tz, now: now)
        checkEqual(items.count, 2, "two card items")
        let byId = Dictionary(uniqueKeysWithValues: items.map { ($0.refId, $0) })
        checkEqual(byId["10"]?.icon, .emoji("🔵"), "Chase card icon")
        checkEqual(byId["11"]?.icon, .emoji("🏠"), "Bilt card icon")
    }
}
