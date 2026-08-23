package app.fihaven.core

import app.fihaven.core.logic.SubscriptionLinks
import app.fihaven.core.logic.SubscriptionsFinder
import app.fihaven.core.model.Bill
import app.fihaven.core.model.SpendTransaction
import app.fihaven.core.model.TRANSFER_CATEGORY
import java.time.LocalDate
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Mirrors client/js/subscriptionsFinder.test.js. `build` reads the wall clock
 * through DateLogic.today (there is no injectable `now`), so every date here is
 * relative to the real today — a fixed calendar date would rot.
 */
class SubscriptionsFinderTest {
    private val today: LocalDate = LocalDate.now(UTC)
    private fun daysAgo(n: Long) = today.minusDays(n).toString()
    private fun monthsAgo(n: Long) = today.minusMonths(n).toString()

    private fun sub(
        id: String,
        name: String,
        amount: Double,
        frequency: String = "Monthly",
        endDate: String? = null,
        trialEnds: String? = null,
        archived: Boolean = false,
    ) = Bill(
        id = id, name = name, category = "Subscriptions", amount = amount,
        dueDay = 10, frequency = frequency, endDate = endDate,
        trialEnds = trialEnds, archived = archived,
    )

    private fun tx(id: String, merchant: String, amount: Double, date: String) =
        SpendTransaction(id = id, merchant = merchant, amount = amount, date = date)

    @Test fun aRecurringCardPaymentIsNotASubscription() {
        // A card payment recurs monthly, from a consistent merchant string, for
        // a steady-ish amount — exactly the shape this finder looks for. Without
        // the transfer gate, paying your card off every month surfaced as a
        // subscription you might want to cancel.
        val payments = listOf(
            tx("p1", "Chase Card Payment", 450.0, monthsAgo(2)).copy(category = TRANSFER_CATEGORY),
            tx("p2", "Chase Card Payment", 450.0, monthsAgo(1)).copy(category = TRANSFER_CATEGORY),
        )
        assertTrue(SubscriptionsFinder.build(emptyList(), payments, UTC).isEmpty())

        // The same cadence as ordinary spending still is one, so the gate is
        // rejecting the category rather than the pattern.
        val purchases = payments.map { it.copy(category = "Shopping") }
        assertEquals(1, SubscriptionsFinder.build(emptyList(), purchases, UTC).size)
    }

    @Test fun thresholdsAreTheDocumentedOnes() {
        // The date-based cases below derive their fixtures from these constants
        // so they never rot — which also makes them blind to the value itself.
        // Pin it here, so changing a threshold is a deliberate, visible edit.
        assertEquals(60L, SubscriptionsFinder.STALE_DAYS)
        assertEquals(3L, SubscriptionsFinder.TRIAL_REMINDER_DAYS)
        assertEquals(0.15, SubscriptionsFinder.AMOUNT_SIMILARITY, 1e-9)
    }

    @Test fun monthlyOfBillNormalizesFrequencies() {
        assertEquals(20.0, SubscriptionsFinder.monthlyOfBill(sub("1", "M", 20.0)), 1e-9)
        assertEquals(10.0 * 52 / 12, SubscriptionsFinder.monthlyOfBill(sub("2", "W", 10.0, "Weekly")), 1e-9)
        assertEquals(10.0 * 26 / 12, SubscriptionsFinder.monthlyOfBill(sub("3", "B", 10.0, "Bi-weekly")), 1e-9)
        assertEquals(30.0 / 3, SubscriptionsFinder.monthlyOfBill(sub("4", "Q", 30.0, "Quarterly")), 1e-9)
        assertEquals(120.0 / 12, SubscriptionsFinder.monthlyOfBill(sub("5", "A", 120.0, "Annually")), 1e-9)
        // A bill with no amount contributes nothing rather than blowing up.
        assertEquals(0.0, SubscriptionsFinder.monthlyOfBill(Bill(id = "6", name = "Blank")), 1e-9)
    }

    @Test fun amountsSimilarToleratesFifteenPercent() {
        assertTrue(SubscriptionsFinder.amountsSimilar(emptyList()))
        assertTrue(SubscriptionsFinder.amountsSimilar(listOf(10.0)))
        assertTrue(SubscriptionsFinder.amountsSimilar(listOf(10.0, 11.0)))     // 9% apart
        assertFalse(SubscriptionsFinder.amountsSimilar(listOf(10.0, 20.0)))    // 50% apart
        // All-zero amounts have no meaningful ratio; treat them as similar
        // rather than dividing by zero.
        assertTrue(SubscriptionsFinder.amountsSimilar(listOf(0.0, 0.0)))
    }

    @Test fun includesActiveSubscriptionBillsAndSkipsRetiredOnes() {
        val items = SubscriptionsFinder.build(
            bills = listOf(
                sub("1", "Netflix", 15.49),
                sub("2", "Old Gym", 40.0, endDate = daysAgo(40)),
                sub("3", "Archived", 9.0, archived = true),
                Bill(id = "4", name = "Electric", category = "Utilities", amount = 85.0),
            ),
            transactions = emptyList(),
            zone = UTC,
        )
        assertEquals(listOf("Netflix"), items.map { it.name })
        val netflix = items.single()
        assertEquals("bill", netflix.source)
        assertEquals("bill-1", netflix.id)
        assertEquals(15.49, netflix.monthly, 1e-9)
        // A known brand resolves to its cancellation page.
        assertEquals("https://www.netflix.com/cancelplan", netflix.manageUrl)
    }

    @Test fun detectsRecurringMerchantsAcrossTwoMonths() {
        val items = SubscriptionsFinder.build(
            bills = emptyList(),
            transactions = listOf(
                tx("1", "Spotify", 11.99, monthsAgo(2)),
                tx("2", "Spotify", 11.99, monthsAgo(1)),
                // One-off: a single month never looks like a subscription.
                tx("3", "Corner Store", 6.25, monthsAgo(1)),
            ),
            zone = UTC,
        )
        assertEquals(listOf("Spotify"), items.map { it.name })
        assertEquals("tx", items[0].source)
        assertNull(items[0].priceUp)
    }

    @Test fun skipsTwoMonthNoiseWithUnlikeAmounts() {
        // Two months but wildly different amounts — a shop you happened to
        // visit twice, not a subscription.
        val noise = SubscriptionsFinder.build(
            bills = emptyList(),
            transactions = listOf(
                tx("1", "Target", 12.00, monthsAgo(2)),
                tx("2", "Target", 140.00, monthsAgo(1)),
            ),
            zone = UTC,
        )
        assertTrue(noise.isEmpty())

        // A third month is evidence enough on its own, similar amounts or not.
        val threeMonths = SubscriptionsFinder.build(
            bills = emptyList(),
            transactions = listOf(
                tx("1", "Target", 12.00, monthsAgo(3)),
                tx("2", "Target", 140.00, monthsAgo(2)),
                tx("3", "Target", 30.00, monthsAgo(1)),
            ),
            zone = UTC,
        )
        assertEquals(listOf("Target"), threeMonths.map { it.name })
    }

    @Test fun flagsPriceIncreasesAndStaleCharges() {
        val items = SubscriptionsFinder.build(
            bills = emptyList(),
            transactions = listOf(
                tx("1", "Hulu", 7.99, monthsAgo(2)),
                tx("2", "Hulu", 8.99, monthsAgo(1)),
            ),
            zone = UTC,
        )
        val hulu = items.single()
        assertEquals(7.99, hulu.priceUp!!, 1e-9)   // what it used to cost
        assertFalse(hulu.stale)

        // Nothing seen for longer than STALE_DAYS — probably already cancelled.
        val stale = SubscriptionsFinder.build(
            bills = emptyList(),
            transactions = listOf(
                tx("1", "Ghost", 5.0, daysAgo(SubscriptionsFinder.STALE_DAYS + 95)),
                tx("2", "Ghost", 5.0, daysAgo(SubscriptionsFinder.STALE_DAYS + 65)),
            ),
            zone = UTC,
        )
        assertTrue(stale.single().stale)
    }

    @Test fun flagsTrialsEndingSoonButNotDistantOnes() {
        val items = SubscriptionsFinder.build(
            bills = listOf(
                sub("1", "Soon", 10.0, trialEnds = today.plusDays(2).toString()),
                sub("2", "Later", 10.0, trialEnds = today.plusDays(30).toString()),
                sub("3", "NoTrial", 10.0),
            ),
            transactions = emptyList(),
            zone = UTC,
        )
        val byName = items.associateBy { it.name }
        assertTrue(byName.getValue("Soon").trialSoon)
        assertEquals(2L, byName.getValue("Soon").trialDaysLeft)
        assertFalse(byName.getValue("Later").trialSoon)
        assertNull(byName.getValue("NoTrial").trialDaysLeft)
    }

    @Test fun aTrackedBillSuppressesItsOwnTransactions() {
        // The bill is the record; its card charges must not double-count.
        val items = SubscriptionsFinder.build(
            bills = listOf(sub("1", "Netflix", 15.49)),
            transactions = listOf(
                tx("1", "netflix", 15.49, monthsAgo(2)),
                tx("2", "NETFLIX", 15.49, monthsAgo(1)),
            ),
            zone = UTC,
        )
        assertEquals(1, items.size)
        assertEquals("bill", items.single().source)
    }

    @Test fun hidesDeclinedMerchants() {
        val txs = listOf(
            tx("1", "Spotify", 11.99, monthsAgo(2)),
            tx("2", "Spotify", 11.99, monthsAgo(1)),
        )
        assertEquals(1, SubscriptionsFinder.build(emptyList(), txs, UTC).size)
        // Declining is remembered by normalized key, whatever the casing.
        assertTrue(SubscriptionsFinder.build(emptyList(), txs, UTC, declined = listOf("SPOTIFY")).isEmpty())
    }

    @Test fun sortsByMonthlyCostDescending() {
        val items = SubscriptionsFinder.build(
            bills = listOf(
                sub("1", "Cheap", 5.0),
                sub("2", "Pricey", 50.0),
                sub("3", "Middling", 20.0),
            ),
            transactions = emptyList(),
            zone = UTC,
        )
        assertEquals(listOf("Pricey", "Middling", "Cheap"), items.map { it.name })
    }

    @Test fun marksBothSidesOfADuplicate() {
        // The same service tracked as a bill AND typed under a different
        // spelling — both rows are flagged so the user can merge them.
        val items = SubscriptionsFinder.build(
            bills = listOf(sub("1", "Disney Plus", 13.99), sub("2", "disneyplus", 13.99)),
            transactions = emptyList(),
            zone = UTC,
        )
        assertEquals(2, items.size)
        assertTrue(items.all { it.duplicate })
    }
}

class SubscriptionLinksTest {
    @Test fun normalizeKeyStripsCasingAndPunctuation() {
        assertEquals("disneyplus", SubscriptionLinks.normalizeKey("Disney+ Plus"))
        assertEquals("youtubepremium", SubscriptionLinks.normalizeKey("YouTube Premium"))
        assertEquals("", SubscriptionLinks.normalizeKey("!!!"))
    }

    @Test fun manageUrlPrefersASavedLinkOverTheBrandTable() {
        val typed = Bill(id = "1", name = "Netflix", notes = "cancel here: https://example.com/cancel, thanks")
        // The trailing comma is punctuation, not part of the URL.
        assertEquals("https://example.com/cancel", SubscriptionLinks.manageUrl(typed))

        assertEquals(
            "https://www.spotify.com/account/subscription/",
            SubscriptionLinks.manageUrl(Bill(id = "2", name = "Spotify Family")),
        )
        // The business name is consulted when the nickname gives nothing away.
        assertEquals(
            "https://secure.hulu.com/account",
            SubscriptionLinks.manageUrl(Bill(id = "3", name = "TV thing", business = "Hulu")),
        )
        assertNull(SubscriptionLinks.manageUrl(Bill(id = "4", name = "Local Gym")))
    }
}
