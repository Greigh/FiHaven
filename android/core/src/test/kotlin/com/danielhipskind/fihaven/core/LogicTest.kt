package com.danielhipskind.fihaven.core

import com.danielhipskind.fihaven.core.logic.DateLogic
import com.danielhipskind.fihaven.core.logic.Income
import com.danielhipskind.fihaven.core.logic.PaidGoalPolicy
import com.danielhipskind.fihaven.core.logic.Payoff
import com.danielhipskind.fihaven.core.logic.PayoffStrategy
import com.danielhipskind.fihaven.core.logic.Schedule
import com.danielhipskind.fihaven.core.model.Bill
import com.danielhipskind.fihaven.core.model.Card
import com.danielhipskind.fihaven.core.model.FiHavenJson
import com.danielhipskind.fihaven.core.model.Payment
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class IncomeTest {
    @Test fun factors() {
        assertEquals(52.0 / 12.0, Income.factor("weekly"), 1e-9)
        assertEquals(26.0 / 12.0, Income.factor("biweekly"), 1e-9)
        assertEquals(2.0, Income.factor("semimonthly"), 1e-9)
        assertEquals(1.0, Income.factor("monthly"), 1e-9)
        assertEquals(1.0 / 12.0, Income.factor("annual"), 1e-9)
        assertEquals(1.0, Income.factor("nonsense"), 1e-9)
    }

    @Test fun monthlyFromSources() {
        val s = FiHavenJson.parseToJsonElement(
            """{"incomes":[{"id":"a","label":"Pay","amount":2080,"frequency":"biweekly"}]}"""
        ).jsonObject
        assertEquals(4506.6667, Income.monthlyIncome(s), 0.001)
    }

    @Test fun fallbackToLegacy() {
        val s = FiHavenJson.parseToJsonElement("""{"income":3200}""").jsonObject
        assertEquals(3200.0, Income.monthlyIncome(s), 1e-6)
    }

    @Test fun sourcesBeatLegacy() {
        val s = FiHavenJson.parseToJsonElement(
            """{"income":9999,"incomes":[{"id":"a","label":"x","amount":1000,"frequency":"monthly"}]}"""
        ).jsonObject
        assertEquals(1000.0, Income.monthlyIncome(s), 1e-6)
    }
}

class DateLogicTest {
    @Test fun monthKey() {
        assertEquals("2026-06", DateLogic.currentMonthKey(UTC, NOW))
    }

    @Test fun daysUntilDue() {
        assertEquals(5, DateLogic.daysUntilDue(20, UTC, NOW))
        assertEquals(0, DateLogic.daysUntilDue(15, UTC, NOW))
        assertEquals(-1, DateLogic.daysUntilDue(14, UTC, NOW))
        assertEquals(25, DateLogic.daysUntilDue(10, UTC, NOW))
    }

    @Test fun nextDueDate() {
        assertEquals("2026-06", DateLogic.monthKey(DateLogic.nextDueDate(20, UTC, NOW)!!))
        assertEquals("2026-07", DateLogic.monthKey(DateLogic.nextDueDate(10, UTC, NOW)!!))
    }

    @Test fun monthsUntilAndLabels() {
        assertEquals(4, DateLogic.monthsUntil("2026-10-01", UTC, NOW))
        assertEquals(0, DateLogic.monthsUntil("2026-06-30", UTC, NOW))
        assertEquals(0, DateLogic.monthsUntil("2025-01-01", UTC, NOW))
        assertEquals(0, DateLogic.monthsUntil(null, UTC, NOW))
        assertEquals("June 2026", DateLogic.monthKeyLabel("2026-06"))
    }
}

class ScheduleTest {
    @Test fun promoNeeded() {
        val card = Card(id = 10, name = "Chase", balance = 2340.0, hasPromo = true,
            promoEndDate = "2026-10-01", promoBalance = 2340.0)
        assertEquals(585.0, Schedule.promoNeeded(card, UTC, NOW), 0.001)

        val fallback = Card(id = 1, name = "X", balance = 1000.0, hasPromo = true,
            promoEndDate = "2026-10-01", promoBalance = 0.0)
        assertEquals(250.0, Schedule.promoNeeded(fallback, UTC, NOW), 0.001)

        val expired = Card(id = 1, name = "X", balance = 800.0, hasPromo = true,
            promoEndDate = "2025-01-01", promoBalance = 800.0)
        assertEquals(800.0, Schedule.promoNeeded(expired, UTC, NOW), 1e-6)
    }

    @Test fun upcomingSortedAndIcons() {
        val bills = listOf(
            Bill(id = 1, name = "Late", amount = 50.0, dueDay = 20),
            Bill(id = 2, name = "Rolled", amount = 30.0, dueDay = 10),
        )
        val items = Schedule.buildUpcomingItems(bills, emptyList(), UTC, NOW)
        assertEquals(listOf("1", "2"), items.map { it.refId })
        assertEquals(5, items[0].days)
        assertEquals(25, items[1].days)
        assertEquals("📌", items[0].icon)
    }

    @Test fun cardUsesPromoNeeded() {
        val cards = listOf(Card(id = 10, name = "Chase", balance = 2340.0, minPayment = 35.0,
            hasPromo = true, promoEndDate = "2026-10-01", promoBalance = 2340.0, dueDay = 18))
        val items = Schedule.buildUpcomingItems(emptyList(), cards, UTC, NOW)
        assertEquals(1, items.size)
        assertEquals(585.0, items[0].amount, 0.001)
        assertEquals("Chase (payment)", items[0].name)
    }

    @Test fun paidHelpers() {
        val payments = listOf(
            Payment(id = 1, type = "bill", refId = "1", amount = 100.0, monthKey = "2026-06"),
            Payment(id = 2, type = "bill", refId = "1", amount = 50.0, monthKey = "2026-06"),
            Payment(id = 3, type = "bill", refId = "1", amount = 999.0, monthKey = "2026-05"),
        )
        assertTrue(Schedule.isPaid(payments, "bill", "1", "2026-06"))
        assertTrue(!Schedule.isPaid(payments, "card", "1", "2026-06"))
        assertEquals(150.0, Schedule.paidAmount(payments, "bill", "1", "2026-06"), 1e-6)
    }

    @Test fun recommendedAndGoal() {
        val card = Card(id = 1, name = "Reg", balance = 2000.0, minPayment = 50.0)
        // Non-promo recommended = full balance.
        assertEquals(2000.0, Schedule.recommendedAmount(card, UTC, NOW), 1e-6)
        // Per-card override wins.
        assertEquals(300.0, Schedule.recommendedAmount(card.copy(recommendedPayment = 300.0), UTC, NOW), 1e-6)

        // Recommended goal is stabilized to the start-of-month balance
        // (balance + payments already made this month).
        val paid = listOf(Payment(id = 1, type = "card", refId = "1", amount = 500.0, monthKey = "2026-06"))
        assertEquals(2500.0, Schedule.goalAmount(card, PaidGoalPolicy.RECOMMENDED, paid, "2026-06", UTC, NOW), 1e-6)
        assertEquals(2500.0, Schedule.goalAmount(card, PaidGoalPolicy.FULL, paid, "2026-06", UTC, NOW), 1e-6)
        // Minimum policy ignores the balance.
        assertEquals(50.0, Schedule.goalAmount(card, PaidGoalPolicy.MINIMUM, paid, "2026-06", UTC, NOW), 1e-6)
        // Override is a fixed monthly target (not stabilized).
        assertEquals(300.0, Schedule.goalAmount(card.copy(recommendedPayment = 300.0), PaidGoalPolicy.RECOMMENDED, paid, "2026-06", UTC, NOW), 1e-6)
    }
}

class PayoffTest {
    @Test fun nilWhenNoDebt() {
        assertNull(Payoff.runPayoffSim(listOf(Card(id = 1, name = "Paid", balance = 0.0)),
            PayoffStrategy.AVALANCHE, 0.0, UTC, NOW))
    }

    @Test fun zeroInterestMinimums() {
        val r = Payoff.runPayoffSim(
            listOf(Card(id = 1, name = "A", balance = 1000.0, minPayment = 100.0, regularAPR = 0.0)),
            PayoffStrategy.NONE, 0.0, UTC, NOW)!!
        assertEquals(10, r.months)
        assertEquals(0.0, r.totalInterest, 1e-6)
        assertEquals(10, r.cards[0].paidOffMonth)
        assertEquals("2027-04", DateLogic.monthKey(r.payoffDate))
    }

    @Test fun noneIgnoresExtra() {
        val r = Payoff.runPayoffSim(
            listOf(Card(id = 1, name = "A", balance = 1000.0, minPayment = 100.0, regularAPR = 0.0)),
            PayoffStrategy.NONE, 1000.0, UTC, NOW)!!
        assertEquals(10, r.months)
    }

    @Test fun extraSpeedsPayoff() {
        val r = Payoff.runPayoffSim(
            listOf(Card(id = 1, name = "A", balance = 1000.0, minPayment = 100.0, regularAPR = 0.0)),
            PayoffStrategy.AVALANCHE, 100.0, UTC, NOW)!!
        assertEquals(5, r.months)
    }

    @Test fun interestAccrues() {
        val r = Payoff.runPayoffSim(
            listOf(Card(id = 1, name = "A", balance = 1000.0, minPayment = 100.0, regularAPR = 24.0)),
            PayoffStrategy.NONE, 0.0, UTC, NOW)!!
        assertTrue(r.totalInterest > 0)
        assertTrue(r.months > 10)
    }

    @Test fun promoSuppressesInterest() {
        val reg = Payoff.runPayoffSim(
            listOf(Card(id = 1, name = "Reg", balance = 2000.0, minPayment = 50.0, regularAPR = 25.0)),
            PayoffStrategy.NONE, 0.0, UTC, NOW)!!
        val promo = Payoff.runPayoffSim(
            listOf(Card(id = 2, name = "Promo", balance = 2000.0, minPayment = 50.0, regularAPR = 25.0,
                hasPromo = true, promoEndDate = "2030-01-01")),
            PayoffStrategy.NONE, 0.0, UTC, NOW)!!
        assertTrue(reg.totalInterest > promo.totalInterest)
    }

    @Test fun snowballSmallestFirst() {
        val r = Payoff.runPayoffSim(
            listOf(
                Card(id = 1, name = "Big", balance = 3000.0, minPayment = 50.0, regularAPR = 0.0),
                Card(id = 2, name = "Small", balance = 500.0, minPayment = 50.0, regularAPR = 0.0),
            ),
            PayoffStrategy.SNOWBALL, 200.0, UTC, NOW)!!
        val small = r.cards.first { it.id == 2 }
        val big = r.cards.first { it.id == 1 }
        assertTrue(small.paidOffMonth != null && big.paidOffMonth != null)
        assertTrue(small.paidOffMonth!! <= big.paidOffMonth!!)
    }
}
