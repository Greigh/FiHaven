package app.fihaven.core

import app.fihaven.core.logic.IssuerIcons
import app.fihaven.core.logic.IssuerLogos
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
        assertEquals(CategoryIcon.Emoji("🏠"), IssuerIcons.iconInfo(Card(name = "Blue", issuer = "Bilt")))
        assertEquals("🔵", IssuerIcons.iconInfo(Card(name = "Sapphire", issuer = "Chase")).emoji())
    }

    @Test fun brandLogos() {
        assertEquals("chase", IssuerIcons.logoKey("Chase"))
        assertEquals("americanexpress", IssuerIcons.logoKey("Amex"))
        assertEquals("americanexpress", IssuerIcons.logoKey("American Express"))
        assertEquals("bankofamerica", IssuerIcons.logoKey("Bank of America, N.A."))
        assertEquals("chase", IssuerIcons.logoKey("JPMorgan Chase"))
        assertNull(IssuerIcons.logoKey("Bilt"))
        assertNull(IssuerIcons.logoKey(""))

        assertEquals("chase", IssuerIcons.logo(Card(name = "Freedom Flex", issuer = "Chase"))?.key)
        assertEquals("discover", IssuerIcons.logo(Card(name = "Discover it"))?.key)
        assertNull(IssuerIcons.logo(Card(name = "Chase Mortgage", type = "loan")))
        assertNull(IssuerIcons.logo(Card(name = "Mystery Rewards")))
        assertEquals(0x117ACA, IssuerLogos.logo("chase")?.color)
    }

    /** The paths are drawn by Compose's vector parser, so bad data is invisible. */
    @Test fun bundledLogosAreWellFormed() {
        assertEquals(11, IssuerLogos.all.size)
        for ((key, logo) in IssuerLogos.all) {
            assertEquals(key, logo.key)
            assertTrue(logo.path.startsWith("M"), "$key starts with a moveto")
            assertTrue(logo.path.length > 32, "$key has real path data")
            assertTrue(logo.color in 0x000000..0xFFFFFF, "$key color is 0xRRGGBB")
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
        )
        val items = Schedule.buildUpcomingItems(emptyList(), cards, UTC, now = NOW)
        assertEquals(CategoryIcon.Logo("chase", "🔵"), items.first { it.refId == "10" }.icon)
        assertEquals(CategoryIcon.Emoji("🏠"), items.first { it.refId == "11" }.icon)
    }
}
