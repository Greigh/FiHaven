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
import app.fihaven.core.model.IncomeAdjustment
import app.fihaven.core.model.Card
import app.fihaven.core.model.CategoryIcon
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
import kotlin.test.assertFalse
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

    @Test fun adjustmentsMatchOnMonthsNotPeriodKeys() {
        // Outside calendar mode a period is keyed by its START DATE. Handing
        // that to appliesTo used to match nothing, so a one-time adjustment
        // created under a rolling period was invisible and counted for nothing.
        val once = IncomeAdjustment(id = "a", amount = 500.0, kind = "once", monthKey = "2026-07")
        assertTrue(once.appliesTo("2026-07-08"))
        assertTrue(once.appliesTo("2026-07"))
        assertFalse(once.appliesTo("2026-08-08"))

        // Records an older build stamped with a date heal on read.
        val legacy = IncomeAdjustment(id = "b", amount = 500.0, kind = "once", monthKey = "2026-07-08")
        assertTrue(legacy.appliesTo("2026-07"))
        assertTrue(legacy.appliesTo("2026-07-08"))

        // A date-keyed window bound no longer sorts after the month it names.
        val ending = IncomeAdjustment(
            id = "c", amount = 100.0, kind = "recurring",
            startMonth = "2026-06-15", endMonth = "2026-08-15",
        )
        assertTrue(ending.appliesTo("2026-08"))
        assertTrue(ending.appliesTo("2026-06"))
        assertFalse(ending.appliesTo("2026-09"))
    }

    @Test fun adjustmentsForPeriodCoverEveryOverlappedMonth() {
        val settings = FiHavenJson.parseToJsonElement(
            """{"incomeAdjustments":[
                 {"id":"jul","amount":500,"kind":"once","monthKey":"2026-07"},
                 {"id":"aug","amount":200,"kind":"once","monthKey":"2026-08"},
                 {"id":"sep","amount":900,"kind":"once","monthKey":"2026-09"}
               ]}"""
        ).jsonObject
        // A 35-day window from Jul 8 straddles July and August.
        val cfg = PeriodConfig.normalized("rolling", null, 35)
        val bounds = Period.bounds(LocalDate.of(2026, 7, 20), cfg)
        val ids = Income.adjustmentsForPeriod(settings, bounds).map { it.id }
        assertEquals(listOf("jul", "aug"), ids)
        // The anchor for a NEW one-time adjustment is the month the period starts in.
        assertEquals(bounds.key.take(7), Income.periodAnchorMonth(bounds))
        assertEquals(7, Income.periodAnchorMonth(bounds).length)

        // Calendar mode keys by month already, so nothing changes there.
        val cal = Period.bounds(LocalDate.of(2026, 7, 20), PeriodConfig.normalized("calendar", null, null))
        assertEquals(listOf("jul"), Income.adjustmentsForPeriod(settings, cal).map { it.id })
        assertEquals("2026-07", Income.periodAnchorMonth(cal))
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

    @Test fun rolloverAmount() {
        assertEquals(150.0, Schedule.rolloverAmount("average", 90.0, 150.0), 1e-9)
        assertEquals(90.0, Schedule.rolloverAmount("average", 90.0, null), 1e-9)
        assertEquals(90.0, Schedule.rolloverAmount("average", 90.0, 0.0), 1e-9)
        assertEquals(90.0, Schedule.rolloverAmount("carry", 90.0, 150.0), 1e-9)
        assertEquals(0.0, Schedule.rolloverAmount("blank", 90.0, 150.0), 1e-9)
        assertEquals(150.0, Schedule.rolloverAmount("nonsense", 90.0, 150.0), 1e-9)
    }

    @Test fun recentPaymentAverage() {
        val pays = listOf(
            Payment(type = "bill", refId = "1", amount = 100.0, date = "2026-04-01"),
            Payment(type = "bill", refId = "1", amount = 200.0, date = "2026-05-01"),
            Payment(type = "bill", refId = "1", amount = 150.0, date = "2026-06-01"),
            Payment(type = "bill", refId = "1", amount = 0.0, date = "2026-06-15", skipped = true),
            Payment(type = "card", refId = "1", amount = 999.0, date = "2026-06-01"),
        )
        assertEquals(150.0, Schedule.recentPaymentAverage(pays, "bill", "1")!!, 1e-9)
        assertEquals(175.0, Schedule.recentPaymentAverage(pays, "bill", "1", 2)!!, 1e-9)
        assertNull(Schedule.recentPaymentAverage(pays, "bill", "nope"))
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
        assertEquals(CategoryIcon.Emoji("📌"), items[0].icon)
    }

    @Test fun upcomingAppliesCategoryIconOverrides() {
        val bills = listOf(Bill(id = "h", name = "Rent", amount = 10.0, dueDay = 20, category = "Housing"))
        val emoji = Schedule.buildUpcomingItems(
            bills, emptyList(), UTC,
            categoryIcons = mapOf("Housing" to CategoryIcon.Emoji("🏡")),
            now = NOW,
        )
        assertEquals(CategoryIcon.Emoji("🏡"), emoji[0].icon)

        val image = Schedule.buildUpcomingItems(
            bills, emptyList(), UTC,
            categoryIcons = mapOf("Housing" to CategoryIcon.Image("data:image/png;base64,abc")),
            now = NOW,
        )
        assertEquals(CategoryIcon.Image("data:image/png;base64,abc"), image[0].icon)
    }

    @Test fun cardUsesPromoNeeded() {
        val cards = listOf(Card(id = "10", name = "Chase", balance = 2340.0, minPayment = 35.0,
            hasPromo = true, promoEndDate = "2026-10-01", promoBalance = 2340.0, dueDay = 18))
        val items = Schedule.buildUpcomingItems(emptyList(), cards, UTC, now = NOW)
        assertEquals(1, items.size)
        assertEquals(585.0, items[0].amount, 0.001)
        assertEquals("Chase (payment)", items[0].name)
        assertEquals(CategoryIcon.Logo("chase", "🔵"), items[0].icon)
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

    @Test fun payTargetHoldsStillWhileRemainderShrinks() {
        // $500 of a $2,000 balance paid: the payment decremented the balance, so
        // the card reads 1500 and the target adds the payment back.
        val card = Card(id = "1", name = "Reg", balance = 1500.0, minPayment = 50.0, regularAPR = 24.0)
        assertEquals(2000.0, Schedule.payTarget(Schedule.PayTarget.RECOMMENDED, card, 500.0, UTC, NOW), 1e-6)
        assertEquals(1500.0, Schedule.payRemaining(Schedule.PayTarget.RECOMMENDED, card, 500.0, UTC, NOW), 1e-6)
        // The minimum is a flat target — paying it leaves nothing toward it.
        assertEquals(50.0, Schedule.payTarget(Schedule.PayTarget.MINIMUM, card, 500.0, UTC, NOW), 1e-6)
        assertEquals(0.0, Schedule.payRemaining(Schedule.PayTarget.MINIMUM, card, 500.0, UTC, NOW), 1e-6)

        // An explicit recommendation is spent down, not re-suggested in full.
        val fixed = card.copy(recommendedPayment = 300.0)
        assertEquals(100.0, Schedule.payRemaining(Schedule.PayTarget.RECOMMENDED, fixed, 200.0, UTC, NOW), 1e-6)
        assertEquals(0.0, Schedule.payRemaining(Schedule.PayTarget.RECOMMENDED, fixed, 300.0, UTC, NOW), 1e-6)

        // A 0% promo's monthly target comes off the start-of-period promo
        // balance: $1,200 over 6 months = $200/mo, $200 of it already paid.
        val promo = Card(id = "2", name = "Promo", balance = 1000.0, minPayment = 25.0, regularAPR = 24.0,
            hasPromo = true, promoBalance = 1000.0, promoEndDate = "2026-12-01")
        assertEquals(200.0, Schedule.payTarget(Schedule.PayTarget.RECOMMENDED, promo, 200.0, UTC, NOW), 1e-6)
        assertEquals(0.0, Schedule.payRemaining(Schedule.PayTarget.RECOMMENDED, promo, 200.0, UTC, NOW), 1e-6)

        // Loans: the scheduled payment, with payoff as the whole principal.
        val loan = Card(id = "9", name = "Mortgage", balance = 248_800.0, minPayment = 1200.0, type = "loan")
        assertEquals(0.0, Schedule.payRemaining(Schedule.PayTarget.MONTHLY, loan, 1200.0, UTC, NOW), 1e-6)
        assertEquals(250_000.0, Schedule.payTarget(Schedule.PayTarget.PAYOFF, loan, 1200.0, UTC, NOW), 1e-6)
        assertEquals(248_800.0, Schedule.payRemaining(Schedule.PayTarget.PAYOFF, loan, 1200.0, UTC, NOW), 1e-6)
    }

    @Test fun liveBalancePrefersCurrentWhenTracked() {
        val linked = Card(id = "1", name = "Visa", balance = 2829.0, currentBalance = 2946.18, minPayment = 35.0)
        assertEquals(2946.18, Schedule.liveBalance(linked), 1e-6)
        // Unset means "not tracked separately" — fall back to the statement.
        assertEquals(300.0, Schedule.liveBalance(Card(id = "2", name = "Plain", balance = 300.0)), 1e-6)
        // A current balance of exactly zero is a real figure, not "unset".
        assertEquals(0.0, Schedule.liveBalance(Card(id = "3", balance = 300.0, currentBalance = 0.0)), 1e-6)
    }

    @Test fun balanceProposalChangeReadsDirectionAndLimitNews() {
        // More debt is "up" (the review row paints it red), less is "down".
        assertEquals("up", Schedule.balanceProposalChange(2336.64, 2400.0, null, null).direction)
        assertEquals("down", Schedule.balanceProposalChange(2336.64, 1900.0, null, null).direction)
        // Sub-cent float noise from a re-reported figure is not a change.
        assertEquals("same", Schedule.balanceProposalChange(2336.64, 2336.641, null, null).direction)
        // Nothing to compare against when the card is gone.
        assertEquals("same", Schedule.balanceProposalChange(null, 500.0, null, null).direction)

        // The limit stays out of the row unless it actually moved.
        assertFalse(Schedule.balanceProposalChange(1.0, 1.0, 40_900.0, 40_900.0).limitChanged)
        assertTrue(Schedule.balanceProposalChange(1.0, 1.0, 40_900.0, 45_000.0).limitChanged)
        assertFalse(Schedule.balanceProposalChange(1.0, 1.0, 40_900.0, null).limitChanged)
        // A first limit on a card that has none is news.
        assertTrue(Schedule.balanceProposalChange(1.0, 1.0, null, 5_000.0).limitChanged)
    }

    @Test fun cardAmountsSeparatesDueCurrentAndOwed() {
        val bounds = Period.bounds(LocalDate.of(2026, 6, 15), PeriodConfig.normalized("calendar", null, null))
        val card = Card(id = "1", name = "Visa", balance = 2829.0, currentBalance = 2946.18,
            minPayment = 35.0, limit = 13_500.0, regularAPR = 0.0)

        val a = Schedule.amounts(card, PaidGoalPolicy.MINIMUM, emptyList(), bounds, UTC, NOW)
        assertEquals(35.0, a.due, 1e-6)          // this period's goal under the policy
        assertEquals(2946.18, a.current, 1e-6)   // live balance (drives utilization)
        assertEquals(35.0, a.owed, 1e-6)         // none of it paid yet
        assertEquals(2946.18, a.valueFor("current"), 1e-6)
        assertEquals(35.0, a.valueFor("nonsense"), 1e-6)

        // The full-balance policy leads with the balance instead.
        val full = Schedule.amounts(card, PaidGoalPolicy.FULL, emptyList(), bounds, UTC, NOW)
        assertEquals(2829.0, full.due, 1e-6)

        // A partial payment shrinks only the owed figure — the target holds still.
        val part = listOf(Payment(id = "1", type = "card", refId = "1", amount = 20.0, date = "2026-06-10"))
        val b = Schedule.amounts(card, PaidGoalPolicy.MINIMUM, part, bounds, UTC, NOW)
        assertEquals(35.0, b.due, 1e-6)
        assertEquals(15.0, b.owed, 1e-6)

        // A skip owes nothing but doesn't change what the period asked for.
        val skip = listOf(Payment(id = "2", type = "card", refId = "1", date = "2026-06-10", skipped = true))
        val c = Schedule.amounts(card, PaidGoalPolicy.MINIMUM, skip, bounds, UTC, NOW)
        assertEquals(0.0, c.owed, 1e-6)
        assertEquals(35.0, c.due, 1e-6)

        // A 0% promo card with a clear statement still leads with the monthly
        // payoff slice it owes — it used to read a settled "$0.00".
        val promo = Card(
            id = "5", name = "Diamond", balance = 0.0, currentBalance = 9732.0, minPayment = 0.0,
            hasPromo = true, promoBalance = 2000.0, promoEndDate = "2026-10-15", regularAPR = 32.99,
        )
        val p = Schedule.amounts(promo, PaidGoalPolicy.RECOMMENDED, emptyList(), bounds, UTC, NOW)
        assertEquals(500.0, p.due, 1e-6)         // 2000 over the 4 months left
        assertEquals(500.0, p.owed, 1e-6)

        // A loan's "due" is its scheduled payment, never its principal.
        val loan = Card(id = "9", name = "Mortgage", type = "loan", balance = 250_000.0, minPayment = 1600.0)
        val l = Schedule.amounts(loan, PaidGoalPolicy.FULL, emptyList(), bounds, UTC, NOW)
        assertEquals(1600.0, l.due, 1e-6)
        assertEquals(250_000.0, l.current, 1e-6)

        // The preference re-ranks the three; it never hides one.
        assertEquals(listOf("current", "owed"), Schedule.otherAmounts("due"))
        assertEquals(listOf("due", "owed"), Schedule.otherAmounts("current"))
        assertEquals(listOf("due", "current"), Schedule.otherAmounts("owed"))
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

/**
 * A zero goal satisfies `remaining <= 0` on its own, so an item whose amount
 * was never filled in used to read as fully paid with no payment behind it —
 * and the row's Undo, which removes a payment record, had nothing to remove.
 * These pin the blank-vs-explicit-zero distinction the fix rests on.
 */
class NeedsAmountTest {
    private val UTC: java.time.ZoneId = java.time.ZoneId.of("UTC")
    private val CAL = PeriodConfig.normalized("calendar", null, null)
    private val bounds = Period.bounds(LocalDate.of(2026, 8, 15), CAL)
    private fun paid(type: String, ref: String, amount: Double) = listOf(
        Payment(id = "p1", type = type, refId = ref, name = "x", amount = amount,
            date = "2026-08-10", monthKey = "2026-08")
    )
    private fun skip(type: String, ref: String) = listOf(
        Payment(id = "s1", type = type, refId = ref, name = "x", amount = 0.0,
            date = "2026-08-10", monthKey = "2026-08", skipped = true)
    )

    @Test fun blankBillAmountIsNotPaid() {
        val bill = Bill(id = "1", name = "Mortgage", dueDay = 1)   // amount never set
        assertNull(bill.amount)
        assertEquals(0.0, Schedule.goalAmount(bill), 1e-9)
        assertTrue(Schedule.needsAmount(bill, emptyList(), bounds))
        assertFalse(Schedule.isFullyPaid(Schedule.goalAmount(bill), 0.0, false, true))
        assertFalse(Schedule.nothingDue(Schedule.goalAmount(bill), 0.0, false, true))
    }

    @Test fun explicitZeroBillIsSettledNotUnfinished() {
        val bill = Bill(id = "1", name = "Free trial", dueDay = 1, amount = 0.0)
        assertFalse(Schedule.needsAmount(bill, emptyList(), bounds))
        assertTrue(Schedule.isFullyPaid(Schedule.goalAmount(bill), 0.0, false, false))
        assertTrue(Schedule.nothingDue(Schedule.goalAmount(bill), 0.0, false, false))
    }

    @Test fun payingTowardABlankAmountCountsAsPaid() {
        val bill = Bill(id = "1", name = "Mortgage", dueDay = 1)
        val payments = paid("bill", "1", 25.0)
        assertFalse(Schedule.needsAmount(bill, payments, bounds))
        assertTrue(Schedule.isFullyPaid(Schedule.goalAmount(bill), 25.0, false, false))
        assertFalse(Schedule.nothingDue(Schedule.goalAmount(bill), 25.0, false, false))
    }

    @Test fun skippedItemOwesNothingByChoice() {
        val bill = Bill(id = "1", name = "Mortgage", dueDay = 1)
        assertFalse(Schedule.needsAmount(bill, skip("bill", "1"), bounds))
    }

    @Test fun loanWithoutAMonthlyPaymentNeedsAnAmount() {
        val loan = Card(id = "9", name = "Mortgage", type = "loan", balance = 250_000.0)
        assertNull(loan.minPayment)
        assertTrue(Schedule.needsAmount(loan, PaidGoalPolicy.RECOMMENDED, emptyList(), bounds))

        val set = loan.copy(minPayment = 1800.0)
        assertFalse(Schedule.needsAmount(set, PaidGoalPolicy.RECOMMENDED, emptyList(), bounds))
        assertEquals(1800.0, Schedule.goalAmount(set, PaidGoalPolicy.RECOMMENDED, 0.0, UTC), 1e-9)
    }

    @Test fun loanOverrideOnlyCountsWhileAboveZero() {
        val loan = Card(id = "9", type = "loan", balance = 250_000.0, recommendedPayment = 0.0)
        assertTrue(Schedule.needsAmount(loan, PaidGoalPolicy.RECOMMENDED, emptyList(), bounds))
        val overridden = loan.copy(recommendedPayment = 900.0)
        assertFalse(Schedule.needsAmount(overridden, PaidGoalPolicy.RECOMMENDED, emptyList(), bounds))
    }

    // A balance-derived goal reaching zero means the card is paid off — a real
    // answer, so it must never be mistaken for unfinished setup.
    @Test fun paidOffCreditCardIsNothingDueNotMissingAnAmount() {
        val card = Card(id = "1", name = "Visa", balance = 0.0)
        assertFalse(Schedule.needsAmount(card, PaidGoalPolicy.FULL, emptyList(), bounds))
        val goal = Schedule.goalAmount(card, PaidGoalPolicy.FULL, 0.0, UTC)
        assertEquals(0.0, goal, 1e-9)
        assertTrue(Schedule.nothingDue(goal, 0.0, false, false))
    }

    @Test fun minimumPolicyWithoutAMinimumNeedsAnAmount() {
        val card = Card(id = "1", name = "Visa", balance = 500.0)
        assertTrue(Schedule.needsAmount(card, PaidGoalPolicy.MINIMUM, emptyList(), bounds))
        // The same card under a balance-derived policy is simply unpaid.
        assertFalse(Schedule.needsAmount(card, PaidGoalPolicy.FULL, emptyList(), bounds))
    }

    // The blank/zero distinction is worthless if it doesn't survive a round trip
    // through the sync payload.
    @Test fun blankAmountSurvivesJsonRoundTrip() {
        val blank = Bill(id = "1", name = "Mortgage", dueDay = 1)
        val json = FiHavenJson.encodeToString(Bill.serializer(), blank)
        assertFalse(json.contains("\"amount\""))   // omitted, not written as 0
        assertNull(FiHavenJson.decodeFromString(Bill.serializer(), json).amount)

        val zero = Bill(id = "1", name = "Free", dueDay = 1, amount = 0.0)
        val zeroJson = FiHavenJson.encodeToString(Bill.serializer(), zero)
        assertEquals(0.0, FiHavenJson.decodeFromString(Bill.serializer(), zeroJson).amount)

        // A payload from an older client that never had the field at all.
        assertNull(FiHavenJson.decodeFromString(Bill.serializer(), """{"id":"1","name":"Old"}""").amount)
    }

    @Test fun blankMinPaymentSurvivesJsonRoundTrip() {
        val loan = Card(id = "9", name = "Mortgage", type = "loan")
        val json = FiHavenJson.encodeToString(Card.serializer(), loan)
        assertFalse(json.contains("\"minPayment\""))
        assertNull(FiHavenJson.decodeFromString(Card.serializer(), json).minPayment)
        assertEquals(0.0, FiHavenJson.decodeFromString(Card.serializer(), json).minPaymentOrZero, 1e-9)
    }
}
