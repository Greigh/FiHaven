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
)

data class PayoffResult(
    val months: Int,
    val totalInterest: Double,
    val cards: List<PayoffCardResult>,
    val payoffDate: LocalDate,
)

/// Month-by-month debt-payoff simulation, ported verbatim from
/// payoff.js `runPayoffSim`. Interest accrues monthly and is skipped while
/// a card is inside its 0% promo window; freed minimums roll into the
/// extra pool. Capped at 360 months. Null when no card carries a balance.
object Payoff {
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
                minPayment = max(c.minPayment, 1.0),
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
            cards = sim.map {
                PayoffCardResult(it.id, it.name, it.origBalance, it.paidOffMonth, it.interestPaid)
            },
            payoffDate = firstThisMonth.plusMonths(month.toLong()),
        )
    }
}
