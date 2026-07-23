package app.fihaven.core

import app.fihaven.core.logic.IssuerIcons
import app.fihaven.core.logic.Schedule
import app.fihaven.core.model.Card
import app.fihaven.core.model.CategoryIcon
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

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
        assertEquals(CategoryIcon.Emoji("🔵"), IssuerIcons.iconInfo(Card(name = "Sapphire", issuer = "Chase")))
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
        assertEquals(CategoryIcon.Emoji("🔵"), items.first { it.refId == "10" }.icon)
        assertEquals(CategoryIcon.Emoji("🏠"), items.first { it.refId == "11" }.icon)
    }
}
