package app.fihaven.core.logic

import app.fihaven.core.model.Card
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong

enum class PayoffStrategy { NONE, SNOWBALL, AVALANCHE }

data class PayoffCardResult(
    val id: String,
    val name: String,
    val origBalance: Double,
    val paidOffMonth: Int?,
    val interestPaid: Double,
    /** Balance left when the projection stopped — nonzero only for cards
     *  that hit the 360-month cap unpaid. */
    val endBalance: Double,
    /** True only when the minimum payment cannot cover a month's interest
     *  at the balance the projection stopped at, outside any promo window —
     *  minimums provably never clear it. A card that is still declining when
     *  the projection runs out of months is incomplete, not impossible:
     *  $10,000 at 0% on $25/mo needs 400 months, but it clears. */
    val nonAmortizing: Boolean,
)

data class PayoffResult(
    val months: Int,
    val totalInterest: Double,
    val cards: List<PayoffCardResult>,
    val payoffDate: LocalDate,
) {
    /** Every card reached zero inside the projection. When false, months and
     *  totalInterest describe a run that stopped at the 360-month cap — fine
     *  to display, meaningless to compare against another sim's totals. */
    val finished: Boolean get() = cards.all { it.paidOffMonth != null }
}

/// Month-by-month debt-payoff simulation, ported verbatim from
/// payoff.js `runPayoffSim`. Interest accrues monthly and is skipped while
/// a card is inside its 0% promo window; freed minimums roll into the
/// extra pool. Capped at 360 months. Null when no card carries a balance.
object Payoff {
    /** Which strategy costs less interest. null unless both sims finished —
     *  a capped sim's totalInterest is interest accrued inside a truncated
     *  projection, and comparing it to a finished run can crown the worse
     *  plan as "best". */
    fun recommendedStrategy(snowball: PayoffResult?, avalanche: PayoffResult?): PayoffStrategy? {
        if (snowball == null || avalanche == null || !snowball.finished || !avalanche.finished) return null
        return if (avalanche.totalInterest <= snowball.totalInterest) PayoffStrategy.AVALANCHE
        else PayoffStrategy.SNOWBALL
    }

    private class Sim(
        val id: String,
        val name: String,
        var balance: Double,
        val origBalance: Double,
        val minPayment: Double,
        val apr: Double,
        val monthlyRate: Double,
        val hasPromo: Boolean,
        val promoEnd: LocalDate?,
        var paidOffMonth: Int?,
        var interestPaid: Double,
        val housing: Boolean,
        /** Whether the card sat inside its promo window in the most recent
         *  month simulated — at the cap, promo interest suppression is what
         *  keeps a small minimum ahead of a large balance. */
        var inPromoNow: Boolean = false,
    )

    /** Mortgage / home-equity loans — PMI & escrow make sims approximate. */
    fun isHousingLoan(c: Card): Boolean {
        if (c.type != "loan") return false
        val hay = listOfNotNull(c.name, c.issuer).joinToString(" ").lowercase()
        return listOf("mortgage", "home equity", "heloc", "housing", "home loan", "refinance", "refi")
            .any { hay.contains(it) }
    }

    fun runPayoffSim(
        cards: List<Card>,
        strategy: PayoffStrategy,
        extra: Double,
        zone: ZoneId,
        now: Instant = Instant.now(),
        includeMortgage: Boolean = false,
    ): PayoffResult? {
        val debtCards = cards.filter {
            (it.currentBalance ?: it.balance) > 0 && (includeMortgage || !isHousingLoan(it))
        }
        if (debtCards.isEmpty()) return null

        val sim = debtCards.map { c ->
            val startingBalance = c.currentBalance ?: c.balance
            val isLoan = c.type == "loan"
            Sim(
                id = c.id,
                name = c.name,
                balance = startingBalance,
                origBalance = startingBalance,
                minPayment = max(c.minPaymentOrZero, 1.0),
                apr = c.regularAPR,
                monthlyRate = c.regularAPR / 100.0 / 12.0,
                hasPromo = if (isLoan) false else c.hasPromo,
                promoEnd = if (isLoan) null else DateLogic.parseDate(c.promoEndDate),
                paidOffMonth = null,
                interestPaid = 0.0,
                housing = isHousingLoan(c),
            )
        }.toMutableList()

        when (strategy) {
            PayoffStrategy.SNOWBALL -> sim.sortBy { it.origBalance }
            PayoffStrategy.AVALANCHE -> sim.sortByDescending { it.apr }
            PayoffStrategy.NONE -> {}
        }

        val firstThisMonth = DateLogic.today(zone, now).withDayOfMonth(1)
        var month = 0
        var totalInterest = 0.0
        var extraPool = extra

        while (sim.any { it.balance > 0.01 } && month < 360) {
            month++
            val targetDate = firstThisMonth.plusMonths(month.toLong())

            // Accrue interest (skipped inside a promo window).
            for (c in sim) {
                if (c.balance <= 0.01) continue
                val inPromo = c.hasPromo && c.promoEnd != null && !c.promoEnd.isBefore(targetDate)
                c.inPromoNow = inPromo
                if (!inPromo && c.monthlyRate > 0) {
                    val interest = c.balance * c.monthlyRate
                    c.interestPaid += interest
                    totalInterest += interest
                    c.balance += interest
                }
            }

            // Pay each minimum.
            var freedThisMonth = 0.0
            for (c in sim) {
                if (c.balance <= 0.01) continue
                val pay = min(c.balance, c.minPayment)
                c.balance -= pay
                if (c.balance < 0.01) {
                    c.balance = 0.0
                    if (c.paidOffMonth == null) {
                        c.paidOffMonth = month
                        freedThisMonth += c.minPayment
                    }
                }
            }

            // Apply the extra pool down the sorted list.
            if (strategy != PayoffStrategy.NONE && extraPool > 0.01) {
                var remaining = extraPool
                for (c in sim) {
                    if (remaining <= 0.01) break
                    if (c.balance <= 0.01) continue
                    val pay = min(c.balance, remaining)
                    c.balance -= pay
                    remaining -= pay
                    if (c.balance < 0.01) {
                        c.balance = 0.0
                        if (c.paidOffMonth == null) {
                            c.paidOffMonth = month
                            freedThisMonth += c.minPayment
                        }
                    }
                }
            }

            extraPool += freedThisMonth
        }

        return PayoffResult(
            months = month,
            totalInterest = (totalInterest * 100).roundToLong() / 100.0,
            cards = sim.map { c ->
                PayoffCardResult(
                    c.id, c.name, c.origBalance, c.paidOffMonth, c.interestPaid,
                    endBalance = c.balance,
                    // Non-amortizing: the month's interest outruns the minimum,
                    // so the balance can never decline. A promo still running
                    // at the cap keeps even a tiny payment ahead, and a balance
                    // that fell this month would eventually reach zero — both
                    // are "ran out of projection", not "never clears".
                    nonAmortizing = c.paidOffMonth == null
                        && !c.inPromoNow
                        && c.minPayment <= c.balance * c.monthlyRate,
                )
            },
            payoffDate = firstThisMonth.plusMonths(month.toLong()),
        )
    }
}
