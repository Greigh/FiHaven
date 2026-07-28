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
            .logo(key: "chase", emoji: "🔵"),
            "iconInfo prefers the bundled logo"
        )
        checkEqual(
            IssuerIcons.iconInfo(for: Card(id: "1", name: "Blue", issuer: "Bilt")),
            .emoji("🏠"),
            "iconInfo falls back to emoji with no bundled logo"
        )
        checkEqual(
            IssuerIcons.iconInfo(for: Card(id: "1", name: "Sapphire", issuer: "Chase")).emoji(),
            "🔵",
            "logo carries its emoji stand-in for text contexts"
        )
    }

    section("IssuerIcons — brand logos") {
        checkEqual(IssuerIcons.logoKey("Chase"), "chase", "exact issuer")
        checkEqual(IssuerIcons.logoKey("Amex"), "americanexpress", "alias → canonical key")
        checkEqual(IssuerIcons.logoKey("American Express"), "americanexpress", "normalized issuer")
        checkEqual(IssuerIcons.logoKey("Bank of America, N.A."), "bankofamerica", "substring match")
        checkEqual(IssuerIcons.logoKey("JPMorgan Chase"), "chase", "alias on a longer name")
        checkEqual(IssuerIcons.logoKey("Bilt"), nil, "no bundled mark")
        checkEqual(IssuerIcons.logoKey(""), nil, "empty")

        checkEqual(
            IssuerIcons.logo(for: Card(id: "1", name: "Freedom Flex", issuer: "Chase"))?.key,
            "chase", "logo from issuer"
        )
        checkEqual(
            IssuerIcons.logo(for: Card(id: "1", name: "Discover it"))?.key,
            "discover", "logo from card name"
        )
        checkEqual(
            IssuerIcons.logo(for: Card(id: "1", name: "Chase Mortgage", type: "loan"))?.key,
            nil, "loans keep the bank glyph"
        )
        checkEqual(
            IssuerIcons.logo(for: Card(id: "1", name: "Mystery Rewards"))?.key,
            nil, "unknown issuer"
        )
        checkEqual(IssuerLogos.logo("chase")?.color, 0x117ACA, "brand color packed as 0xRRGGBB")
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
        checkEqual(byId["10"]?.icon, .logo(key: "chase", emoji: "🔵"), "Chase card logo")
        checkEqual(byId["11"]?.icon, .emoji("🏠"), "Bilt card icon")
    }
}
