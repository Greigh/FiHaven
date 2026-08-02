package app.fihaven.core

import app.fihaven.core.logic.IssuerIcons
import app.fihaven.core.logic.IssuerLogos
import app.fihaven.core.logic.IssuerMonograms
import app.fihaven.core.logic.Schedule
import app.fihaven.core.model.Card
import app.fihaven.core.model.CategoryIcon
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class IssuerIconsTest {
    @Test fun knownIssuers() {
        assertEquals("🔵", IssuerIcons.emoji(Card(name = "Sapphire", issuer = "Chase")))
        assertEquals("🟩", IssuerIcons.emoji(Card(name = "Gold", issuer = "Amex")))
        assertEquals("🏠", IssuerIcons.emoji(Card(name = "Blue", issuer = "Bilt")))
        assertEquals("🔴", IssuerIcons.emoji(Card(name = "Double Cash", issuer = "Citi")))
        assertEquals("⬛", IssuerIcons.emoji(Card(name = "Savor", issuer = "Capital One")))
        assertEquals("🟠", IssuerIcons.emoji(Card(name = "Card", issuer = "Discover")))
        assertEquals("🍎", IssuerIcons.emoji(Card(name = "Card", issuer = "Apple")))
        assertEquals("🎯", IssuerIcons.emoji(Card(name = "Card", issuer = "Target")))
        assertEquals("🔴", IssuerIcons.emoji(Card(name = "Card", issuer = "Bank of America")))
        assertEquals("🔴", IssuerIcons.emoji(Card(name = "Card", issuer = "BoA")))
    }

    @Test fun matchesFromNameAndLoans() {
        assertEquals("🔵", IssuerIcons.emoji(Card(name = "Chase Freedom Flex")))
        assertEquals("🟩", IssuerIcons.emoji(Card(name = "Amex Gold Card")))
        assertEquals("🏦", IssuerIcons.emoji(Card(name = "Mortgage", type = "loan")))
        assertEquals("💳", IssuerIcons.emoji(Card(name = "Mystery Rewards")))
        assertEquals(
            CategoryIcon.Logo("chase", "🔵"),
            IssuerIcons.iconInfo(Card(name = "Sapphire", issuer = "Chase")),
        )
        assertEquals(
            CategoryIcon.Logo("bilt", "🏠"),
            IssuerIcons.iconInfo(Card(name = "Blue", issuer = "Bilt")),
        )
        assertEquals(
            CategoryIcon.Monogram("ML", 0x0F4C4C, "💳"),
            IssuerIcons.iconInfo(Card(name = "Card", issuer = "Mission Lane")),
        )
        assertEquals("🔵", IssuerIcons.iconInfo(Card(name = "Sapphire", issuer = "Chase")).emoji())
    }

    @Test fun brandLogos() {
        assertEquals("chase", IssuerIcons.logoKey("Chase"))
        assertEquals("americanexpress", IssuerIcons.logoKey("Amex"))
        assertEquals("americanexpress", IssuerIcons.logoKey("American Express"))
        assertEquals("bankofamerica", IssuerIcons.logoKey("Bank of America, N.A."))
        assertEquals("chase", IssuerIcons.logoKey("JPMorgan Chase"))
        assertNull(IssuerIcons.logoKey("Mission Lane"))
        assertNull(IssuerIcons.logoKey(""))

        assertEquals("chase", IssuerIcons.logo(Card(name = "Freedom Flex", issuer = "Chase"))?.key)
        assertEquals("discover", IssuerIcons.logo(Card(name = "Discover it"))?.key)
        assertNull(IssuerIcons.logo(Card(name = "Chase Mortgage", type = "loan")))
        assertNull(IssuerIcons.logo(Card(name = "Mystery Rewards")))
        assertEquals(0x117ACA, IssuerLogos.logo("chase")?.color)

        // Full-color marks: layered, wider than tall, and never recolored.
        assertEquals("citi", IssuerIcons.logoKey("Citi"))
        assertEquals("citi", IssuerIcons.logoKey("Citibank"))
        assertEquals("capitalone", IssuerIcons.logoKey("Capital One"))
        assertEquals("usbank", IssuerIcons.logoKey("U.S. Bank"))
        assertEquals("fifththird", IssuerIcons.logoKey("Fifth Third Bank"))
        assertEquals("tmobile", IssuerIcons.logoKey("T-Mobile"))
        assertEquals("bestbuy", IssuerIcons.logoKey("Best Buy"))
        assertEquals("lowes", IssuerIcons.logoKey("Lowe's"))
        assertEquals("hyatt", IssuerIcons.logoKey("World of Hyatt"))
        assertEquals(true, IssuerLogos.logo("citi")?.isFullColor)
        assertTrue((IssuerLogos.logo("citi")?.layers?.size ?: 0) > 1, "Citi mark is layered")
        assertEquals(false, IssuerLogos.logo("chase")?.isFullColor)
        assertEquals(1f, IssuerLogos.logo("chase")?.aspect, "a monochrome mark is square")
        assertTrue((IssuerLogos.logo("citi")?.aspect ?: 0f) > 1f, "Citi is a wordmark")

        // "Citizens Bank" is not Citi, and "Capital City Bank" is not Capital One.
        assertNull(IssuerIcons.logoKey("Citizens Bank"))
        assertNull(IssuerIcons.logoKey("Citizens Access"))
        assertNull(IssuerIcons.logoKey("Capital City Bank"))

        // The card says Barclay / Barclaycard; the logo key is the plural.
        assertEquals("barclays", IssuerIcons.logoKey("Barclay"))
        assertEquals("barclays", IssuerIcons.logoKey("Barclaycard Arrival"))
        assertEquals("americanexpress", IssuerIcons.logoKey("Centurion Card"))
    }

    @Test fun namedIssuerBeatsNetworkMark() {
        // "Bilt Mastercard" is a Bilt card, not a Mastercard one.
        assertEquals("bilt", IssuerIcons.logo(Card(name = "Bilt Mastercard", issuer = "Bilt"))?.key)
        assertEquals("citi", IssuerIcons.logo(Card(name = "Visa Signature", issuer = "Citi"))?.key)
        // An issuer with no mark of its own still beats the network's.
        assertNull(IssuerIcons.logo(Card(name = "Mission Lane Visa", issuer = "Mission Lane")))
        assertEquals("visa", IssuerIcons.logo(Card(name = "Signature", issuer = "Visa"))?.key)
        // With no issuer named, the network mark beats nothing.
        assertEquals("visa", IssuerIcons.logo(Card(name = "Visa Platinum"))?.key)
    }

    @Test fun aliasesAndProgramNames() {
        // "verizon" wins over "visa" because longer keys match first.
        assertEquals("verizon", IssuerIcons.logoKey("Verizon Visa"))
        assertEquals("goldmansachs", IssuerIcons.logoKey("Goldman"))
        assertEquals("americanairlines", IssuerIcons.logoKey("AAdvantage Aviator"))
        assertEquals("delta", IssuerIcons.logoKey("SkyMiles Reserve"))
        assertEquals("unitedairlines", IssuerIcons.logoKey("MileagePlus Explorer"))
        assertEquals("southwestairlines", IssuerIcons.logoKey("Rapid Rewards Priority"))
        assertEquals("marriott", IssuerIcons.logoKey("Bonvoy Boundless"))
        assertEquals("dinersclub", IssuerIcons.logoKey("Diners Club"))
        // Short aliases stay exact so they can't fire inside unrelated words.
        assertNull(IssuerIcons.logoKey("Boat Loan"))
    }

    @Test fun monogramsForIssuersWithoutLogos() {
        assertEquals(
            CategoryIcon.Monogram("ML", 0x0F4C4C, "💳"),
            IssuerIcons.iconInfo(Card(name = "Visa", issuer = "Mission Lane")),
        )
        assertEquals("CC", IssuerIcons.monogram(Card(name = "Card", issuer = "CareCredit"))?.text)
        assertEquals("OS", IssuerIcons.monogram(Card(name = "Card", issuer = "OpenSky"))?.text)
        assertEquals("LM", IssuerIcons.monogram(Card(name = "Card", issuer = "LMCU"))?.text)
        assertEquals(
            "LM",
            IssuerIcons.monogram(Card(name = "Card", issuer = "Lake Michigan Credit Union"))?.text,
        )
        assertEquals("A", IssuerIcons.monogram(Card(name = "Card", issuer = "Aven"))?.text)
        assertEquals("S", IssuerIcons.monogram(Card(name = "Card", issuer = "SoFi"))?.text)
        assertEquals("NF", IssuerIcons.monogram(Card(name = "cashRewards", issuer = "Navy Federal Credit Union"))?.text)
        // Loans keep the bank glyph rather than taking a monogram.
        assertNull(IssuerIcons.monogram(Card(name = "Mortgage", type = "loan")))
        assertEquals(CategoryIcon.Emoji("🏦"), IssuerIcons.iconInfo(Card(name = "Mortgage", type = "loan")))
    }

    @Test fun monogramInitialsAndColors() {
        assertEquals("US", IssuerMonograms.initials("U.S. Bank"))
        assertEquals("TD", IssuerMonograms.initials("TD Bank"))
        assertEquals("PNC", IssuerMonograms.initials("PNC Bank"))
        assertEquals("CC", IssuerMonograms.initials("CareCredit"))
        assertEquals("CC", IssuerMonograms.initials("Care Credit"))
        assertEquals("S", IssuerMonograms.initials("Synchrony Bank"))
        assertEquals("S", IssuerMonograms.initials("SoFi"))
        assertEquals("MA", IssuerMonograms.initials("Mountain America Credit Union"))
        assertEquals("CU", IssuerMonograms.initials("Credit Union"))
        assertEquals("", IssuerMonograms.initials(""))
        assertEquals("", IssuerMonograms.initials("   "))

        // Curated color where we have one, stable fallback otherwise.
        assertEquals(0x0057B8, IssuerMonograms.monogram("carecredit", "CareCredit")?.color)
        // Curated entries match inside a longer, more formal name.
        assertEquals(
            0x003057,
            IssuerMonograms.monogram("navyfederalcreditunion", "Navy Federal Credit Union")?.color,
        )
        assertEquals(0x003057, IssuerMonograms.monogram("synchronybank", "Synchrony Bank")?.color)
        val first = IssuerMonograms.monogram("mountainridge", "Mountain Ridge")
        val again = IssuerMonograms.monogram("mountainridge", "Mountain Ridge")
        assertEquals(first?.color, again?.color)
        assertTrue(first!!.color in 0x000000..0xFFFFFF)
    }

    /** The paths are drawn by Compose's vector parser, so bad data is invisible. */
    @Test fun bundledLogosAreWellFormed() {
        assertEquals(47, IssuerLogos.all.size)
        for ((key, logo) in IssuerLogos.all) {
            assertEquals(key, logo.key)
            assertTrue(logo.layers.isNotEmpty(), "$key has at least one layer")
            assertTrue(logo.color in 0x000000..0xFFFFFF, "$key color is 0xRRGGBB")
            assertTrue(logo.width >= 24f, "$key is at least as wide as it is tall")
            // A monochrome mark is recolored as a whole, so it stays single-path.
            if (!logo.isFullColor) {
                assertEquals(1, logo.layers.size, "$key monochrome mark is single-path")
                assertEquals(24f, logo.width, "$key monochrome mark is square")
            }
            for ((index, layer) in logo.layers.withIndex()) {
                // Absolute or relative moveto — HSBC's mark starts with "m".
                assertTrue(layer.path.first() in "Mm", "$key layer $index starts with a moveto")
                assertTrue(layer.path.length > 8, "$key layer $index has real path data")
                assertTrue(layer.color in 0x000000..0xFFFFFF, "$key layer $index color is 0xRRGGBB")
            }
        }
    }

    @Test fun normalizeAndResolve() {
        assertEquals("americanexpress", IssuerIcons.normalize("American Express"))
        assertEquals("usbank", IssuerIcons.normalize("U.S. Bank"))
        assertEquals("Chase", IssuerIcons.resolveIssuer(Card(name = "Sapphire", issuer = "Chase")))
        assertEquals("Sapphire", IssuerIcons.resolveIssuer(Card(name = "Sapphire")))
        assertNull(IssuerIcons.brand("Mystery Rewards"))
        assertEquals("🔵", IssuerIcons.brand("Chase"))
    }

    @Test fun upcomingCardRowsUseIssuerIcons() {
        val cards = listOf(
            Card(id = "10", name = "Sapphire", issuer = "Chase", minPayment = 35.0, dueDay = 20),
            Card(id = "11", name = "Blue", issuer = "Bilt", minPayment = 10.0, dueDay = 18),
            Card(id = "12", name = "Card", issuer = "Mission Lane", minPayment = 10.0, dueDay = 18),
        )
        val items = Schedule.buildUpcomingItems(emptyList(), cards, UTC, now = NOW)
        assertEquals(CategoryIcon.Logo("chase", "🔵"), items.first { it.refId == "10" }.icon)
        assertEquals(CategoryIcon.Logo("bilt", "🏠"), items.first { it.refId == "11" }.icon)
        assertEquals(
            CategoryIcon.Monogram("ML", 0x0F4C4C, "💳"),
            items.first { it.refId == "12" }.icon,
        )
    }
}
