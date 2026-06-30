package app.fihaven.core.logic

import app.fihaven.core.CTConstants
import app.fihaven.core.model.Bill
import app.fihaven.core.model.Card
import app.fihaven.core.model.Payment
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.max

data class UpcomingItem(
    val name: String,
    val amount: Double,
    val days: Int,
    val nextDue: LocalDate?,
    val type: String,      // "bill" | "card"
    val refId: String,
    val autopay: Boolean,
    val icon: String,
)

/// Upcoming-items + paid-state helpers, ported from utils.js.
object Schedule {
    fun promoNeeded(card: Card, zone: ZoneId, now: Instant = Instant.now()): Double {
        val bal = card.promoBalance?.takeIf { it != 0.0 }
            ?: card.balance.takeIf { it != 0.0 }
            ?: 0.0
        val months = DateLogic.monthsUntil(card.promoEndDate, zone, now)
        return if (months <= 0) bal else bal / months
    }

    fun buildUpcomingItems(
        bills: List<Bill>,
        cards: List<Card>,
        zone: ZoneId,
        payments: List<Payment> = emptyList(),
        bounds: PeriodBounds? = null,
        policy: PaidGoalPolicy = PaidGoalPolicy.RECOMMENDED,
        now: Instant = Instant.now(),
    ): List<UpcomingItem> {
        val items = mutableListOf<UpcomingItem>()

        for (b in bills) {
            if (b.dueDay == null && b.startDate.isNullOrEmpty()) continue
            if (!DateLogic.billActive(b, zone, now)) continue
            val ref = b.id.toString()
            val days = if (bounds != null) {
                val goal = goalAmount(b)
                val paid = max(0.0, goal - paidAmount(payments, "bill", ref, bounds)) <= PAID_EPSILON
                BillSchedule.effectiveDaysUntilDue(b, paid, zone, now)
            } else {
                BillSchedule.daysUntilDue(b, zone, now)
            }
            items.add(
                UpcomingItem(
                    name = b.name,
                    amount = b.amount,
                    days = days,
                    nextDue = BillSchedule.nextDueDate(b, zone, DateLogic.today(zone, now)),
                    type = "bill",
                    refId = ref,
                    autopay = b.autopay,
                    icon = CTConstants.iconForCategory(b.category),
                )
            )
        }

        for (c in cards) {
            val dd = c.dueDay ?: continue
            if (dd == 0) continue
            val needed = if (c.hasPromo) max(c.minPayment, promoNeeded(c, zone, now)) else c.minPayment
            val ref = c.id.toString()
            val days = if (bounds != null) {
                val goal = goalAmount(c, policy, payments, bounds, zone, now)
                val paid = max(0.0, goal - paidAmount(payments, "card", ref, bounds)) <= PAID_EPSILON
                DateLogic.effectiveDaysUntilDue(dd, paid, zone, now)
            } else {
                DateLogic.daysUntilDue(dd, zone, now)
            }
            items.add(
                UpcomingItem(
                    name = c.name + " (payment)",
                    amount = needed,
                    days = days,
                    nextDue = DateLogic.nextDueDate(dd, zone, now),
                    type = "card",
                    refId = ref,
                    autopay = c.autopay,
                    icon = CTConstants.cardIcon,
                )
            )
        }

        return items.sortedBy { it.days }
    }

    fun isPaid(payments: List<Payment>, type: String, refId: String, monthKey: String): Boolean =
        payments.any { !it.skipped && it.type == type && it.refId == refId && it.monthKey == monthKey }

    /**
     * True if this bill/card was skipped for the month — a payment record
     * flagged `skipped` (amount 0). It owes nothing and drops out of
     * "still owed", but isn't a real payment.
     */
    fun isSkipped(payments: List<Payment>, type: String, refId: String, monthKey: String): Boolean =
        payments.any { it.skipped && it.type == type && it.refId == refId && it.monthKey == monthKey }

    fun paidAmount(payments: List<Payment>, type: String, refId: String, monthKey: String): Double =
        payments.filter { !it.skipped && it.type == type && it.refId == refId && it.monthKey == monthKey }
            .sumOf { it.amount }

    // ── Period-aware variants (match by date range, see Period) ──────
    fun isPaid(payments: List<Payment>, type: String, refId: String, bounds: PeriodBounds): Boolean =
        payments.any { !it.skipped && it.type == type && it.refId == refId && bounds.contains(it) }

    fun isSkipped(payments: List<Payment>, type: String, refId: String, bounds: PeriodBounds): Boolean =
        payments.any { it.skipped && it.type == type && it.refId == refId && bounds.contains(it) }

    fun paidAmount(payments: List<Payment>, type: String, refId: String, bounds: PeriodBounds): Double =
        payments.filter { !it.skipped && it.type == type && it.refId == refId && bounds.contains(it) }
            .sumOf { it.amount }

    fun goalAmount(
        card: Card,
        policy: PaidGoalPolicy,
        payments: List<Payment>,
        bounds: PeriodBounds,
        zone: ZoneId,
        now: Instant = Instant.now(),
    ): Double {
        val paid = paidAmount(payments, "card", card.id.toString(), bounds)
        val startBalance = card.balance + paid
        // Loans: the monthly obligation is the scheduled payment under every
        // policy — never the full principal. A per-loan override still wins.
        if (card.type == "loan") return card.recommendedPayment?.takeIf { it > 0 } ?: card.minPayment
        return when (policy) {
            PaidGoalPolicy.MINIMUM -> card.minPayment
            PaidGoalPolicy.FULL -> startBalance
            PaidGoalPolicy.RECOMMENDED -> {
                val override = card.recommendedPayment
                when {
                    override != null && override > 0 -> override
                    card.hasPromo -> max(card.minPayment, promoNeeded(card, zone, now))
                    // 0% interest (no active promo): no interest cost to carry,
                    // so the goal is just the minimum, not the full balance.
                    card.regularAPR <= 0 -> card.minPayment
                    else -> startBalance
                }
            }
        }
    }

    /** Cent-level tolerance so a goal met to the penny reads as full. */
    const val PAID_EPSILON = 0.005

    /**
     * The "recommended" payment for a card (mirrors recommendedAmount in utils.js).
     * A per-card override wins; otherwise promo cards spread the balance to clear it
     * before the promo ends (never below the minimum) and non-promo cards recommend
     * paying off the remaining balance.
     */
    fun recommendedAmount(card: Card, zone: ZoneId, now: Instant = Instant.now()): Double {
        card.recommendedPayment?.let { if (it > 0) return it }
        // Loans: the recommended payment is the scheduled monthly payment, never
        // the whole principal (paying it off is still an explicit option).
        if (card.type == "loan") return card.minPayment
        if (card.hasPromo) return max(card.minPayment, promoNeeded(card, zone, now))
        // 0% interest (no active promo): carrying a balance costs nothing, so the
        // recommended payment is just the minimum — not the whole balance.
        if (card.regularAPR <= 0) return card.minPayment
        return card.balance
    }

    /** A bill's fully-paid goal is always its full amount. */
    fun goalAmount(bill: Bill): Double = bill.amount

    /**
     * A card's fully-paid goal under the active policy. For [PaidGoalPolicy.FULL],
     * card payments decrement the live balance, so this month's payments are added
     * back to keep the goal stable as installments land (mirrors goalAmountFor in utils.js).
     */
    fun goalAmount(
        card: Card,
        policy: PaidGoalPolicy,
        payments: List<Payment>,
        monthKey: String,
        zone: ZoneId,
        now: Instant = Instant.now(),
    ): Double {
        val paid = paidAmount(payments, "card", card.id.toString(), monthKey)
        // "full" and a non-promo "recommended" both target paying the balance
        // to zero. Card payments decrement the live balance, so add this
        // month's payments back to keep that goal stable across installments.
        val startBalance = card.balance + paid
        // Loans: the monthly obligation is the scheduled payment under every
        // policy — never the full principal. A per-loan override still wins.
        if (card.type == "loan") return card.recommendedPayment?.takeIf { it > 0 } ?: card.minPayment
        return when (policy) {
            PaidGoalPolicy.MINIMUM -> card.minPayment
            PaidGoalPolicy.FULL -> startBalance
            PaidGoalPolicy.RECOMMENDED -> {
                val override = card.recommendedPayment
                when {
                    override != null && override > 0 -> override
                    card.hasPromo -> max(card.minPayment, promoNeeded(card, zone, now))
                    // 0% interest (no active promo): no interest cost to carry,
                    // so the goal is just the minimum, not the full balance.
                    card.regularAPR <= 0 -> card.minPayment
                    else -> startBalance
                }
            }
        }
    }
}

/** How much must be paid before a bill/card counts as fully paid. */
enum class PaidGoalPolicy {
    MINIMUM, RECOMMENDED, FULL;

    val raw: String
        get() = when (this) {
            MINIMUM -> "minimum"
            RECOMMENDED -> "recommended"
            FULL -> "full"
        }

    companion object {
        /** Lenient parse, defaulting to RECOMMENDED (matches settings.paidGoal on the web). */
        fun from(raw: String?): PaidGoalPolicy = when (raw) {
            "minimum" -> MINIMUM
            "full" -> FULL
            else -> RECOMMENDED
        }
    }
}

/** Tri-state for badges/rows: nothing paid, some paid, goal reached. */
enum class PaidState { UNPAID, PARTIAL, FULL }
