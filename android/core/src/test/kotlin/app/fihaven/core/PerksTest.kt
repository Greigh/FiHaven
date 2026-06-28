package app.fihaven.core

import app.fihaven.core.logic.Perks
import app.fihaven.core.model.Card
import app.fihaven.core.model.CardPerk
import java.time.LocalDate
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

class PerksTest {
    private val jun20 = LocalDate.of(2026, 6, 20)
    private val perk = CardPerk(id = "P1", label = "Uber", amount = 10.0, frequency = "monthly")

    @Test fun cycleKeys() {
        assertEquals("2026-06", Perks.cycleKey("monthly", jun20))
        assertEquals("2026-Q2", Perks.cycleKey("quarterly", jun20))
        assertEquals("2026-H1", Perks.cycleKey("semiannual", jun20))
        assertEquals("2026", Perks.cycleKey("annual", jun20))
        assertEquals("2026-Q4", Perks.cycleKey("quarterly", LocalDate.of(2026, 10, 1)))
    }

    @Test fun expiresInDays() {
        // Jun 20 → end Jul 1; 10 whole days remaining.
        assertEquals(10, Perks.expiresInDays("monthly", jun20))
    }

    @Test fun usageAndRemaining() {
        var usage = emptyMap<String, Double>()
        assertEquals(10.0, Perks.remaining(usage, "1", perk, jun20))

        usage = Perks.applyUsage(usage, "1", perk, 6.0, jun20)
        assertEquals(6.0, Perks.used(usage, "1", perk, jun20))
        assertEquals(4.0, Perks.remaining(usage, "1", perk, jun20))

        usage = Perks.applyUsage(usage, "1", perk, 999.0, jun20) // clamps to cap
        assertEquals(0.0, Perks.remaining(usage, "1", perk, jun20))

        // Next month starts fresh.
        assertEquals(10.0, Perks.remaining(usage, "1", perk, LocalDate.of(2026, 7, 5)))
    }

    @Test fun prunesOldCycles() {
        val seed = mapOf("1:P1:2023-06" to 5.0, "1:P1:2025-06" to 5.0)
        val next = Perks.applyUsage(seed, "1", perk, 3.0, jun20)
        assertEquals(null, next["1:P1:2023-06"]) // dropped (< 2025)
        assertEquals(5.0, next["1:P1:2025-06"])  // kept
        assertEquals(3.0, next["1:P1:2026-06"])
    }

    @Test fun feeAssessment() {
        val card = Card(id = "1", name = "Visa", perks = listOf(perk), annualFee = 95.0)
        // Fee-free → null.
        kotlin.test.assertNull(Perks.feeAssessment(Card(id = "2"), emptyMap(), jun20))

        // No usage: potential $120 covers $95 → OPTIMIZE.
        var usage = emptyMap<String, Double>()
        var a = Perks.feeAssessment(card, usage, jun20)!!
        assertEquals(120.0, a.potential)
        assertEquals(0.0, a.captured)
        assertEquals(Perks.FeeVerdict.OPTIMIZE, a.verdict)

        // Full usage → captured $120 ≥ fee → KEEP.
        usage = Perks.applyUsage(usage, "1", perk, 10.0, jun20)
        a = Perks.feeAssessment(card, usage, jun20)!!
        assertEquals(120.0, a.captured)
        assertEquals(25.0, a.net)
        assertEquals(Perks.FeeVerdict.KEEP, a.verdict)

        // Fee perks can never cover → REVIEW.
        val pricey = Card(id = "3", perks = listOf(CardPerk(id = "P2", amount = 100.0, frequency = "annual")), annualFee = 550.0)
        assertEquals(Perks.FeeVerdict.REVIEW, Perks.feeAssessment(pricey, emptyMap(), jun20)!!.verdict)

        // A spend-based rewards estimate folds into the verdict: $100 rewards
        // alone covers the $95 fee with no perk usage → KEEP.
        val withRewards = Perks.feeAssessment(card, emptyMap(), jun20, rewardsEstimate = 100.0)!!
        assertEquals(100.0, withRewards.rewards)
        assertEquals(100.0, withRewards.value)
        assertEquals(5.0, withRewards.net)
        assertEquals(Perks.FeeVerdict.KEEP, withRewards.verdict)
        // Negative estimates floor at 0.
        assertEquals(0.0, Perks.feeAssessment(card, emptyMap(), jun20, rewardsEstimate = -50.0)!!.rewards)
    }

    @Test fun portfolioTotals() {
        val cards = listOf(
            Card(id = "1", perks = listOf(perk)),
            Card(id = "2", perks = listOf(CardPerk(id = "P2", label = "Travel", amount = 300.0, frequency = "annual"))),
        )
        assertEquals(310.0, Perks.unrealizedTotal(cards, emptyMap(), jun20))
        assertEquals(120.0, Perks.annualValue(cards[0]))
        assertEquals(300.0, Perks.annualValue(cards[1]))
    }
}
