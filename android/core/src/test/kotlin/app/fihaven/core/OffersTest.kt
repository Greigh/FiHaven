package app.fihaven.core

import app.fihaven.core.logic.Offers
import app.fihaven.core.model.Card
import app.fihaven.core.model.CardOffer
import app.fihaven.core.model.SpendTransaction
import java.time.LocalDate
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.test.assertFalse

class OffersTest {
    private val jun20 = LocalDate.of(2026, 6, 20)
    private fun offer(id: String, expires: String, used: Boolean = false) =
        CardOffer(id = id, merchant = "M$id", detail = "deal", expires = expires, used = used)

    @Test fun daysLeftAndExpiry() {
        assertEquals(5, Offers.daysLeft(offer("a", "2026-06-25"), jun20))
        assertFalse(Offers.expired(offer("a", "2026-06-25"), jun20))
        assertTrue(Offers.expired(offer("b", "2026-06-10"), jun20))
        assertNull(Offers.daysLeft(offer("c", ""), jun20))
        assertFalse(Offers.expired(offer("c", ""), jun20))
    }

    @Test fun activeSortedDroppingUsedAndExpired() {
        val cards = listOf(
            Card(id = 1, offers = listOf(
                offer("a", "2026-06-28"),
                offer("b", "2026-06-22"),
                offer("used", "2026-06-21", used = true),
                offer("gone", "2026-06-01"),
            )),
            Card(id = 2, offers = listOf(offer("noexp", ""))),
        )
        val list = Offers.active(cards, jun20)
        assertEquals(listOf("b", "a", "noexp"), list.map { it.offer.id })
        assertEquals(1, list.first().card.id)
    }

    @Test fun expiringSoonCount() {
        val cards = listOf(Card(id = 1, offers = listOf(
            offer("soon", "2026-06-23"),  // 3d
            offer("later", "2026-07-15"), // 25d
        )))
        assertEquals(1, Offers.expiringSoon(cards, jun20))
        assertEquals(2, Offers.expiringSoon(cards, jun20, withinDays = 30))
    }

    @Test fun likelyUsedAndSuggestions() {
        val card = Card(id = 1, name = "Amex", offers = listOf(
            CardOffer(id = "match", merchant = "Best Buy", expires = "2026-06-30"),
            CardOffer(id = "used", merchant = "Best Buy", expires = "2026-06-30", used = true),
            CardOffer(id = "expired", merchant = "Best Buy", expires = "2026-06-01"),
        ))
        val txns = listOf(
            SpendTransaction(id = "t1", date = "2026-06-12", amount = 200.0, merchant = "BEST BUY #14"),
            SpendTransaction(id = "t2", date = "2026-06-15", amount = 300.0, merchant = "BEST BUY ONLINE"), // newer
            SpendTransaction(id = "t3", date = "2026-06-15", amount = -5.0, merchant = "Best Buy refund"),  // inflow ignored
        )
        assertEquals("t2", Offers.likelyUsedTx(card.offers[0], txns, jun20)?.id)
        // Used offers never match.
        assertNull(Offers.likelyUsedTx(card.offers[1], txns, jun20))
        // Stale (outside 60d) doesn't match.
        assertNull(Offers.likelyUsedTx(CardOffer(id = "x", merchant = "Best Buy"),
            listOf(SpendTransaction(id = "old", date = "2026-01-01", amount = 50.0, merchant = "Best Buy")), jun20))

        val sugg = Offers.useSuggestions(listOf(card), txns, jun20)
        assertEquals(listOf("match"), sugg.map { it.offer.id }) // used/expired excluded
    }
}
