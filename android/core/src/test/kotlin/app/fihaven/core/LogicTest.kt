package app.fihaven.core

import app.fihaven.core.logic.BillSchedule
import app.fihaven.core.logic.BudgetRules
import app.fihaven.core.logic.DateLogic
import app.fihaven.core.logic.Income
import app.fihaven.core.logic.PaidGoalPolicy
import app.fihaven.core.logic.Payoff
import app.fihaven.core.logic.PayoffStrategy
import app.fihaven.core.logic.Period
import app.fihaven.core.logic.PeriodConfig
import app.fihaven.core.logic.Rewards
import app.fihaven.core.logic.Schedule
import app.fihaven.core.logic.SpendingInsights
import java.time.Instant
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import app.fihaven.core.model.Bill
import app.fihaven.core.model.Card
import app.fihaven.core.model.FiHavenJson
import app.fihaven.core.model.Payment
import app.fihaven.core.model.SavingsGoal
import app.fihaven.core.model.SpendTransaction
import app.fihaven.core.model.envelopeRolloverBal
import app.fihaven.core.model.envelopeRolloverAppliedFor
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

    @Test fun periodIncomeProratesRolling() {
        val s = FiHavenJson.parseToJsonElement("""{"income":3000}""").jsonObject
        val cfg = PeriodConfig.normalized("rolling", null, 35)
        val b = Period.bounds(LocalDate.of(2026, 5, 15), cfg)
        assertEquals(35, Income.periodDays(b))
        assertEquals(3000.0 * (35.0 / Income.AVG_MONTH_DAYS), Income.periodIncome(s, b), 1.0)
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

    @Test fun effectiveDaysUntilDueWhenPaid() {
        val paid = DateLogic.effectiveDaysUntilDue(28, fullyPaid = true, UTC, Instant.parse("2026-06-29T12:00:00Z"))
        assertEquals(-1, DateLogic.daysUntilDue(28, UTC, Instant.parse("2026-06-29T12:00:00Z")))
        assertTrue(paid > 20)
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

    @Test fun billPeriodNoun() {
        assertEquals("month", BillSchedule.periodNoun("Monthly"))
        assertEquals("quarter", BillSchedule.periodNoun("Quarterly"))
        assertEquals("year", BillSchedule.periodNoun("Annually"))
        assertEquals("week", BillSchedule.periodNoun("Weekly"))
        assertEquals("cycle", BillSchedule.periodNoun("Bi-weekly"))
        assertEquals("month", BillSchedule.periodNoun("nonsense"))
    }
}

class ScheduleTest {
    @Test fun promoNeeded() {
        val card = Card(id = "10", name = "Chase", balance = 2340.0, hasPromo = true,
            promoEndDate = "2026-10-01", promoBalance = 2340.0)
        assertEquals(585.0, Schedule.promoNeeded(card, UTC, NOW), 0.001)

        val fallback = Card(id = "1", name = "X", balance = 1000.0, hasPromo = true,
            promoEndDate = "2026-10-01", promoBalance = 0.0)
        assertEquals(250.0, Schedule.promoNeeded(fallback, UTC, NOW), 0.001)

        val expired = Card(id = "1", name = "X", balance = 800.0, hasPromo = true,
            promoEndDate = "2025-01-01", promoBalance = 800.0)
        assertEquals(800.0, Schedule.promoNeeded(expired, UTC, NOW), 1e-6)
    }

    @Test fun upcomingSortedAndIcons() {
        val bills = listOf(
            Bill(id = "1", name = "Late", amount = 50.0, dueDay = 20),
            Bill(id = "2", name = "Rolled", amount = 30.0, dueDay = 10),
        )
        val items = Schedule.buildUpcomingItems(bills, emptyList(), UTC, now = NOW)
        assertEquals(listOf("1", "2"), items.map { it.refId })
        assertEquals(5, items[0].days)
        assertEquals(25, items[1].days)
        assertEquals("📌", items[0].icon)
    }

    @Test fun cardUsesPromoNeeded() {
        val cards = listOf(Card(id = "10", name = "Chase", balance = 2340.0, minPayment = 35.0,
            hasPromo = true, promoEndDate = "2026-10-01", promoBalance = 2340.0, dueDay = 18))
        val items = Schedule.buildUpcomingItems(emptyList(), cards, UTC, now = NOW)
        assertEquals(1, items.size)
        assertEquals(585.0, items[0].amount, 0.001)
        assertEquals("Chase (payment)", items[0].name)
    }

    @Test fun paidHelpers() {
        val payments = listOf(
            Payment(id = "1", type = "bill", refId = "1", amount = 100.0, monthKey = "2026-06"),
            Payment(id = "2", type = "bill", refId = "1", amount = 50.0, monthKey = "2026-06"),
            Payment(id = "3", type = "bill", refId = "1", amount = 999.0, monthKey = "2026-05"),
        )
        assertTrue(Schedule.isPaid(payments, "bill", "1", "2026-06"))
        assertTrue(!Schedule.isPaid(payments, "card", "1", "2026-06"))
        assertEquals(150.0, Schedule.paidAmount(payments, "bill", "1", "2026-06"), 1e-6)
    }

    @Test fun recommendedAndGoal() {
        val card = Card(id = "1", name = "Reg", balance = 2000.0, minPayment = 50.0, regularAPR = 24.0)
        // Interest-bearing non-promo recommended = full balance.
        assertEquals(2000.0, Schedule.recommendedAmount(card, UTC, NOW), 1e-6)
        // Per-card override wins.
        assertEquals(300.0, Schedule.recommendedAmount(card.copy(recommendedPayment = 300.0), UTC, NOW), 1e-6)

        // Recommended goal is stabilized to the start-of-month balance
        // (balance + payments already made this month).
        val paid = listOf(Payment(id = "1", type = "card", refId = "1", amount = 500.0, monthKey = "2026-06"))
        assertEquals(2500.0, Schedule.goalAmount(card, PaidGoalPolicy.RECOMMENDED, paid, "2026-06", UTC, NOW), 1e-6)
        assertEquals(2500.0, Schedule.goalAmount(card, PaidGoalPolicy.FULL, paid, "2026-06", UTC, NOW), 1e-6)
        // Minimum policy ignores the balance.
        assertEquals(50.0, Schedule.goalAmount(card, PaidGoalPolicy.MINIMUM, paid, "2026-06", UTC, NOW), 1e-6)
        // Override is a fixed monthly target (not stabilized).
        assertEquals(300.0, Schedule.goalAmount(card.copy(recommendedPayment = 300.0), PaidGoalPolicy.RECOMMENDED, paid, "2026-06", UTC, NOW), 1e-6)
    }

    @Test fun zeroInterestCardRecommendsMinimum() {
        // A 0% card has no interest cost to carry, so recommended/owed is the
        // minimum — not the whole balance — under the recommended policy.
        val card = Card(id = "1", name = "0% card", balance = 2000.0, minPayment = 50.0, regularAPR = 0.0)
        assertEquals(50.0, Schedule.recommendedAmount(card, UTC, NOW), 1e-6)
        val none = emptyList<Payment>()
        assertEquals(50.0, Schedule.goalAmount(card, PaidGoalPolicy.RECOMMENDED, none, "2026-06", UTC, NOW), 1e-6)
        // Explicit "full" still targets the balance.
        assertEquals(2000.0, Schedule.goalAmount(card, PaidGoalPolicy.FULL, none, "2026-06", UTC, NOW), 1e-6)
    }

    @Test fun loanRecommendedIsMonthlyPayment() {
        // A loan recommends its scheduled monthly payment, never the principal.
        val loan = Card(id = "9", name = "Mortgage", type = "loan", balance = 250_000.0, minPayment = 1600.0)
        assertEquals(1600.0, Schedule.recommendedAmount(loan, UTC, NOW), 1e-6)
        // Goal is the monthly payment under every policy (not the balance).
        val none = emptyList<Payment>()
        assertEquals(1600.0, Schedule.goalAmount(loan, PaidGoalPolicy.RECOMMENDED, none, "2026-06", UTC, NOW), 1e-6)
        assertEquals(1600.0, Schedule.goalAmount(loan, PaidGoalPolicy.FULL, none, "2026-06", UTC, NOW), 1e-6)
        assertEquals(1600.0, Schedule.goalAmount(loan, PaidGoalPolicy.MINIMUM, none, "2026-06", UTC, NOW), 1e-6)
        // A per-loan override (e.g. extra principal) still wins.
        assertEquals(2000.0, Schedule.recommendedAmount(loan.copy(recommendedPayment = 2000.0), UTC, NOW), 1e-6)
    }

    @Test fun rewardsRankExcludesLoansAndPromos() {
        val flat = Card(id = "1", name = "Flat 2%", rewardBase = 2.0)
        val dining = Card(id = "2", name = "Dining 4%", rewardBase = 1.0, rewardCategories = mapOf("Dining" to 4.0))
        val promo = Card(id = "3", name = "Promo 5%", rewardBase = 5.0, hasPromo = true, promoEndDate = "2026-12-31")
        val loan = Card(id = "4", name = "Loan", type = "loan", rewardBase = 9.0)

        val r = Rewards.rank(listOf(flat, dining, promo, loan), "Dining", UTC, NOW)
        assertEquals("2", r.eligible.first().card.id)                 // dining 4% wins
        assertTrue(r.eligible.none { it.card.id == "4" })             // loan excluded
        assertTrue(r.excluded.any { it.card.id == "3" })             // active promo excluded
        assertTrue(r.eligible.none { it.card.id == "3" })

        // Groceries → dining card falls back to its 1% base, so flat 2% wins.
        val g = Rewards.rank(listOf(flat, dining), "Groceries", UTC, NOW)
        assertEquals("1", g.eligible.first().card.id)
    }

    @Test fun rewardsExplanationAndWallet() {
        val flat = Card(id = "1", name = "Flat 2%", rewardBase = 2.0)
        val dining = Card(id = "2", name = "Dining 4%", rewardBase = 1.0, rewardCategories = mapOf("Dining" to 4.0))
        val bilt = Card(id = "5", name = "Bilt", rewardBase = 1.0, rewardCategories = mapOf("Dining" to 3.0), pointValue = 2.0)

        assertEquals("4% back on dining", Rewards.explanation(dining, "Dining"))
        assertEquals("1% back on everything", Rewards.explanation(dining, "Gas"))
        assertEquals("3× points · 2¢/pt = 6% back on dining", Rewards.explanation(bilt, "Dining"))
        assertEquals("No reward rate set", Rewards.explanation(Card(id = "6"), "Gas"))

        val wallet = Rewards.walletStrategy(listOf(flat, dining), listOf("Dining", "Gas"), UTC)
        assertEquals("2", wallet.first { it.category == "Dining" }.best?.card?.id)
        assertEquals("1", wallet.first { it.category == "Gas" }.best?.card?.id)
        assertNull(Rewards.walletStrategy(listOf(Card(id = "7")), listOf("Gas"), UTC).first().best)
    }
}

class PeriodTest {
    @Test fun calendarMatchesLegacyMonth() {
        val cfg = PeriodConfig.normalized("calendar", null, null)
        val b = Period.bounds(LocalDate.of(2026, 6, 15), cfg)
        assertEquals("2026-06", b.key)
        assertEquals("2026-06-01", b.startKey)
        assertEquals("2026-07-01", b.endKey)
        assertTrue(b.contains(Payment(id = "a", type = "bill", refId = "1", date = "2026-06-20")))
        assertTrue(!b.contains(Payment(id = "b", type = "bill", refId = "1", date = "2026-07-01")))
    }

    @Test fun startDayGroupsEarlyMonthBills() {
        val cfg = PeriodConfig.normalized("startDay", 25, null)
        val b = Period.bounds(LocalDate.of(2026, 6, 15), cfg)
        assertEquals("2026-05-25", b.key)
        assertEquals("2026-06-25", b.endKey)
        // Rent paid Jun 1 belongs to the period that began May 25.
        assertTrue(b.contains(Payment(id = "a", type = "bill", refId = "1", date = "2026-06-01")))
        // The 25th itself starts the next period.
        assertTrue(!b.contains(Payment(id = "b", type = "bill", refId = "1", date = "2026-06-25")))
    }

    @Test fun rollingBucketsAreFixedLength() {
        val cfg = PeriodConfig.normalized("rolling", null, 35)
        val b = Period.bounds(LocalDate.of(2026, 6, 15), cfg)
        assertEquals(35, ChronoUnit.DAYS.between(b.start, b.end).toInt())
        assertTrue(b.contains(Payment(id = "a", type = "bill", refId = "1", date = b.startKey)))
        assertTrue(!b.contains(Payment(id = "b", type = "bill", refId = "1", date = b.endKey)))
    }

    @Test fun boundsForKeyRoundTrips() {
        val cfg = PeriodConfig.normalized("startDay", 25, null)
        val b = Period.bounds(LocalDate.of(2026, 6, 15), cfg)
        val resolved = Period.boundsForKey(b.key, cfg)
        assertEquals(b.key, resolved.key)
        assertEquals(b.startKey, resolved.startKey)
        assertEquals(b.endKey, resolved.endKey)
    }

    @Test fun clampsOutOfRange() {
        val cfg = PeriodConfig.normalized("startDay", 99, 999)
        assertEquals(28, cfg.startDay)
        assertEquals(90, cfg.length)
    }
}

class PayoffTest {
    @Test fun nilWhenNoDebt() {
        assertNull(Payoff.runPayoffSim(listOf(Card(id = "1", name = "Paid", balance = 0.0)),
            PayoffStrategy.AVALANCHE, 0.0, UTC, NOW))
    }

    @Test fun zeroInterestMinimums() {
        val r = Payoff.runPayoffSim(
            listOf(Card(id = "1", name = "A", balance = 1000.0, minPayment = 100.0, regularAPR = 0.0)),
            PayoffStrategy.NONE, 0.0, UTC, NOW)!!
        assertEquals(10, r.months)
        assertEquals(0.0, r.totalInterest, 1e-6)
        assertEquals(10, r.cards[0].paidOffMonth)
        assertEquals("2027-04", DateLogic.monthKey(r.payoffDate))
    }

    @Test fun noneIgnoresExtra() {
        val r = Payoff.runPayoffSim(
            listOf(Card(id = "1", name = "A", balance = 1000.0, minPayment = 100.0, regularAPR = 0.0)),
            PayoffStrategy.NONE, 1000.0, UTC, NOW)!!
        assertEquals(10, r.months)
    }

    @Test fun extraSpeedsPayoff() {
        val r = Payoff.runPayoffSim(
            listOf(Card(id = "1", name = "A", balance = 1000.0, minPayment = 100.0, regularAPR = 0.0)),
            PayoffStrategy.AVALANCHE, 100.0, UTC, NOW)!!
        assertEquals(5, r.months)
    }

    @Test fun interestAccrues() {
        val r = Payoff.runPayoffSim(
            listOf(Card(id = "1", name = "A", balance = 1000.0, minPayment = 100.0, regularAPR = 24.0)),
            PayoffStrategy.NONE, 0.0, UTC, NOW)!!
        assertTrue(r.totalInterest > 0)
        assertTrue(r.months > 10)
    }

    @Test fun promoSuppressesInterest() {
        val reg = Payoff.runPayoffSim(
            listOf(Card(id = "1", name = "Reg", balance = 2000.0, minPayment = 50.0, regularAPR = 25.0)),
            PayoffStrategy.NONE, 0.0, UTC, NOW)!!
        val promo = Payoff.runPayoffSim(
            listOf(Card(id = "2", name = "Promo", balance = 2000.0, minPayment = 50.0, regularAPR = 25.0,
                hasPromo = true, promoEndDate = "2030-01-01")),
            PayoffStrategy.NONE, 0.0, UTC, NOW)!!
        assertTrue(reg.totalInterest > promo.totalInterest)
    }

    @Test fun snowballSmallestFirst() {
        val r = Payoff.runPayoffSim(
            listOf(
                Card(id = "1", name = "Big", balance = 3000.0, minPayment = 50.0, regularAPR = 0.0),
                Card(id = "2", name = "Small", balance = 500.0, minPayment = 50.0, regularAPR = 0.0),
            ),
            PayoffStrategy.SNOWBALL, 200.0, UTC, NOW)!!
        val small = r.cards.first { it.id == "2" }
        val big = r.cards.first { it.id == "1" }
        assertTrue(small.paidOffMonth != null && big.paidOffMonth != null)
        assertTrue(small.paidOffMonth!! <= big.paidOffMonth!!)
    }
}

class BudgetRulesTest {
    @Test fun modeAndSplits() {
        val off = FiHavenJson.parseToJsonElement("{}").jsonObject
        assertEquals("off", BudgetRules.mode(off))
        val rule = FiHavenJson.parseToJsonElement("""{"budgetRule":"50-30-20"}""").jsonObject
        assertEquals("50-30-20", BudgetRules.mode(rule))
        assertEquals(50, BudgetRules.splits(rule)!!.needs)
        val preset = FiHavenJson.parseToJsonElement("""{"budgetRule":"80-20"}""").jsonObject
        assertEquals(80, BudgetRules.splits(preset)!!.needs)
    }

    @Test fun obligationsFirstLens() {
        val settings = FiHavenJson.parseToJsonElement("""{"budgetRule":"obligations-first"}""").jsonObject
        val bounds = Period.bounds(LocalDate.of(2026, 6, 1), PeriodConfig.normalized("calendar", null, 35))
        val lens = BudgetRules.lens(
            settings, 5000.0,
            listOf(Bill(id = "1", category = "Housing", amount = 1500.0)),
            listOf(Card(id = "1", minPayment = 100.0)),
            emptyList(), emptyList(), bounds, { true }, false, java.time.ZoneId.of("UTC"),
        )
        assertTrue(lens != null)
        assertEquals("Safe to spend", lens!!.headline!!.label)
    }

    @Test fun splitLensWhenEnabled() {
        val settings = FiHavenJson.parseToJsonElement("""{"budgetRule":"50-30-20"}""").jsonObject
        val bounds = Period.bounds(LocalDate.of(2026, 6, 1), PeriodConfig.normalized("calendar", null, 35))
        val lens = BudgetRules.lens(
            settings, 4000.0,
            listOf(Bill(id = "1", category = "Utilities", amount = 200.0)),
            listOf(Card(id = "1", minPayment = 50.0)),
            emptyList(), emptyList(), bounds, { true }, false, java.time.ZoneId.of("UTC"),
        )
        assertTrue(lens != null)
        assertEquals(250.0, lens!!.rows.first { it.key == "needs" }.actual, 1e-6)
    }

    @Test fun bucketOverridesAffectSplitLens() {
        val settings = FiHavenJson.parseToJsonElement(
            """{"budgetRule":"50-30-20","budgetBucketOverrides":{"bills":{"Utilities":"wants"}}}""",
        ).jsonObject
        assertEquals(BudgetRules.Bucket.WANTS, BudgetRules.billBucket("Utilities", settings))
        val bounds = Period.bounds(LocalDate.of(2026, 6, 1), PeriodConfig.normalized("calendar", null, 35))
        val lens = BudgetRules.lens(
            settings, 4000.0,
            listOf(Bill(id = "1", category = "Utilities", amount = 200.0)),
            emptyList(), emptyList(), emptyList(), bounds, { true }, false, java.time.ZoneId.of("UTC"),
        )
        assertEquals(200.0, lens!!.rows.first { it.key == "wants" }.actual, 1e-6)
    }

    @Test fun envelopeAssignmentsUsesGoalsAndBudgets() {
        val settings = FiHavenJson.parseToJsonElement(
            """{"categoryBudgets":{"Groceries":300},"envelopeAssign":{"categories":{"Dining":100}}}""",
        ).jsonObject
        val goals = listOf(SavingsGoal(id = "g1", name = "Trip", target = 1200.0, saved = 0.0, targetDate = "2027-01-01"))
        val env = BudgetRules.envelopeAssignments(settings, goals, java.time.ZoneId.of("UTC"))
        assertTrue(env.goalsTotal > 0)
        assertEquals(300.0, env.catMap["Groceries"]!!, 1e-6)
        assertEquals(100.0, env.catMap["Dining"]!!, 1e-6)
    }

    @Test fun applyEnvelopeRolloverOncePerPeriod() {
        val settings = FiHavenJson.parseToJsonElement(
            """{"envelopeRollover":true,"categoryBudgets":{"Groceries":100},"envelopeAssign":{"categories":{"Groceries":100}}}""",
        ).jsonObject
        val prev = Period.bounds(LocalDate.of(2026, 5, 1), PeriodConfig.normalized("calendar", null, 35))
        val tx = listOf(
            SpendTransaction(id = "1", date = "2026-05-10", amount = 40.0, category = "Groceries", merchant = "", note = ""),
        )
        val next = BudgetRules.applyEnvelopeRollover(settings, tx, prev)
        assertEquals(60.0, next.envelopeRolloverBal["Groceries"]!!, 1e-6)
        assertEquals(prev.key, next.envelopeRolloverAppliedFor)
        assertEquals(next, BudgetRules.applyEnvelopeRollover(next, tx, prev))
    }
}

class SpendingInsightsTest {
    @Test fun computeSortsByDelta() {
        val cur = Period.bounds(LocalDate.of(2026, 6, 1), PeriodConfig.normalized("calendar", null, 35))
        val prev = Period.shift(cur, -1, PeriodConfig.normalized("calendar", null, 35))
        val tx = listOf(
            SpendTransaction(id = "1", date = "2026-06-05", amount = 200.0, category = "Dining", merchant = "", note = ""),
            SpendTransaction(id = "2", date = "2026-05-05", amount = 50.0, category = "Dining", merchant = "", note = ""),
            SpendTransaction(id = "3", date = "2026-06-03", amount = 80.0, category = "Groceries", merchant = "", note = ""),
        )
        val rows = SpendingInsights.compute(tx, cur, prev)
        assertEquals("Dining", rows.first().cat)
        assertEquals(150.0, rows.first().delta, 1e-6)
    }
}
