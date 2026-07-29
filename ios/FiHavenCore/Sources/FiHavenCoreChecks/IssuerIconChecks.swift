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
            .monogram(text: "B", color: 0x1A1A1A, emoji: "🏠"),
            "iconInfo falls back to a monogram with no bundled logo"
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

    section("IssuerIcons — issuer beats network") {
        // "Bilt Mastercard" is a Bilt card, not a Mastercard one.
        checkEqual(
            IssuerIcons.iconInfo(for: Card(id: "1", name: "Bilt Mastercard", issuer: "Bilt")),
            .monogram(text: "B", color: 0x1A1A1A, emoji: "🏠"),
            "named issuer wins over a network mark from the name"
        )
        checkEqual(
            IssuerIcons.logo(for: Card(id: "1", name: "Visa Signature", issuer: "Citi"))?.key,
            nil, "Citi card named Visa keeps its monogram"
        )
        checkEqual(
            IssuerIcons.logo(for: Card(id: "1", name: "Signature", issuer: "Visa"))?.key,
            "visa", "an issuer that IS the network keeps its logo"
        )
        checkEqual(
            IssuerIcons.logo(for: Card(id: "1", name: "Visa Platinum"))?.key,
            "visa", "with no issuer named, the network mark beats nothing"
        )
    }

    section("IssuerIcons — aliases & loyalty programs") {
        // "verizon" wins over "visa" because longer keys match first.
        checkEqual(IssuerIcons.logoKey("Verizon Visa"), "verizon", "Verizon Visa")
        checkEqual(IssuerIcons.logoKey("Goldman"), "goldmansachs", "Goldman → Goldman Sachs")
        checkEqual(IssuerIcons.logoKey("AAdvantage Aviator"), "americanairlines", "AAdvantage")
        checkEqual(IssuerIcons.logoKey("SkyMiles Reserve"), "delta", "SkyMiles")
        checkEqual(IssuerIcons.logoKey("MileagePlus Explorer"), "unitedairlines", "MileagePlus")
        checkEqual(IssuerIcons.logoKey("Rapid Rewards Priority"), "southwestairlines", "Rapid Rewards")
        checkEqual(IssuerIcons.logoKey("Bonvoy Boundless"), "marriott", "Bonvoy")
        checkEqual(IssuerIcons.logoKey("Diners Club"), "dinersclub", "Diners Club")
        // Short aliases stay exact so they can't fire inside unrelated words.
        checkEqual(IssuerIcons.logoKey("Boat Loan"), nil, "short alias doesn't match a substring")
    }

    section("IssuerIcons — monograms") {
        checkEqual(IssuerIcons.monogram(for: Card(id: "1", name: "Double Cash", issuer: "Citi"))?.text,
                   "C", "Citi")
        checkEqual(IssuerIcons.monogram(for: Card(id: "1", name: "Savor", issuer: "Capital One"))?.text,
                   "C1", "Capital One shorthand")
        checkEqual(IssuerIcons.monogram(for: Card(id: "1", name: "Altitude", issuer: "U.S. Bank"))?.text,
                   "US", "U.S. Bank")
        checkEqual(IssuerIcons.monogram(for: Card(id: "1", name: "Card", issuer: "CareCredit"))?.text,
                   "CC", "CareCredit")
        checkEqual(IssuerIcons.monogram(for: Card(id: "1", name: "Card", issuer: "SoFi"))?.text,
                   "S", "SoFi keeps one initial")
        checkEqual(
            IssuerIcons.monogram(for: Card(id: "1", name: "cashRewards", issuer: "Navy Federal Credit Union"))?.text,
            "NF", "Navy Federal"
        )
        checkEqual(IssuerIcons.monogram(for: Card(id: "1", name: "Mortgage", type: "loan"))?.text,
                   nil, "loans keep the bank glyph")

        checkEqual(IssuerMonograms.initials("U.S. Bank"), "US", "acronym start")
        checkEqual(IssuerMonograms.initials("PNC Bank"), "PNC", "three-letter acronym")
        checkEqual(IssuerMonograms.initials("Care Credit"), "CC", "two words")
        checkEqual(IssuerMonograms.initials("Synchrony Bank"), "S", "company suffix dropped")
        checkEqual(IssuerMonograms.initials("Mountain America Credit Union"), "MA", "filler dropped")
        checkEqual(IssuerMonograms.initials("Credit Union"), "CU", "nothing but filler")
        checkEqual(IssuerMonograms.initials(""), "", "empty")
        checkEqual(IssuerMonograms.initials("   "), "", "blank")

        checkEqual(IssuerMonograms.monogram(key: "citi", name: "Citi")?.color, 0x056DAE, "curated color")
        // Curated entries match inside a longer, more formal name.
        checkEqual(
            IssuerMonograms.monogram(key: "navyfederalcreditunion", name: "Navy Federal Credit Union")?.color,
            0x003057, "curated color from a longer name"
        )
        checkEqual(
            IssuerMonograms.monogram(key: "synchronybank", name: "Synchrony Bank")?.color,
            0x003057, "Synchrony Bank"
        )
        let first = IssuerMonograms.monogram(key: "mountainridge", name: "Mountain Ridge")
        let again = IssuerMonograms.monogram(key: "mountainridge", name: "Mountain Ridge")
        checkEqual(first?.color, again?.color, "fallback color is stable")
        check((first?.color ?? 0xFFFFFFFF) <= 0xFFFFFF, "fallback color is 0xRRGGBB")
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
        checkEqual(byId["11"]?.icon, .monogram(text: "B", color: 0x1A1A1A, emoji: "🏠"), "Bilt card monogram")
    }
}
