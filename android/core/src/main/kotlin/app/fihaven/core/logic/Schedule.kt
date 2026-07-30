package app.fihaven.core.logic

import app.fihaven.core.CTConstants
import app.fihaven.core.model.Bill
import app.fihaven.core.model.Card
import app.fihaven.core.model.CategoryIcon
import app.fihaven.core.model.Payment
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.max

data class UpcomingItem(
    val name: String,
    /// Who it's actually paid to (a bill's business / a card's issuer). The name
    /// is often a nickname ("Phone"), so this is what identifies the payee.
    val business: String = "",
    val amount: Double,
    val days: Int,
    val nextDue: LocalDate?,
    val type: String,      // "bill" | "card"
    val refId: String,
    val autopay: Boolean,
    val icon: CategoryIcon,
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
        categoryIcons: Map<String, CategoryIcon> = emptyMap(),
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
                    business = b.business.orEmpty(),
                    amount = b.amount,
                    days = days,
                    nextDue = BillSchedule.nextDueDate(b, zone, DateLogic.today(zone, now)),
                    type = "bill",
                    refId = ref,
                    autopay = b.autopay,
                    icon = CTConstants.iconInfoForCategory(b.category, categoryIcons),
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
                    business = c.issuer.orEmpty(),
                    amount = needed,
                    days = days,
                    nextDue = DateLogic.nextDueDate(dd, zone, now),
                    type = "card",
                    refId = ref,
                    autopay = c.autopay,
                    icon = IssuerIcons.iconInfo(c),
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

    // ── Monthly rollover ────────────────────────────────────────────
    /** Average of a bill/card's recent (non-skip) payment amounts — the
     *  "average of recent months" seed for the rollover review. Null when
     *  there's no history to average. Mirrors recentPaymentAverage in utils.js. */
    fun recentPaymentAverage(payments: List<Payment>, type: String, refId: String, n: Int = 6): Double? {
        val recent = payments
            .filter { !it.skipped && it.type == type && it.refId == refId }
            .sortedByDescending { it.date }
            .take(n)
        if (recent.isEmpty()) return null
        return recent.sumOf { it.amount } / recent.size
    }

    /** Amount to pre-fill for a bill when a new period starts, under the active
     *  policy: "average" (default) → recentAvg (else current); "carry" →
     *  current; "blank" → 0. Mirrors rolloverAmount in utils.js. */
    fun rolloverAmount(mode: String, currentAmount: Double, recentAvg: Double?): Double = when (mode) {
        "carry" -> currentAmount
        "blank" -> 0.0
        else -> if (recentAvg != null && recentAvg.isFinite() && recentAvg > 0) recentAvg else currentAmount
    }

    fun goalAmount(
        card: Card,
        policy: PaidGoalPolicy,
        payments: List<Payment>,
        bounds: PeriodBounds,
        zone: ZoneId,
        now: Instant = Instant.now(),
    ): Double = goalAmount(
        card,
        policy,
        paidAmount(payments, "card", card.id.toString(), bounds),
        zone,
        now,
    )

    /** Cent-level tolerance so a goal met to the penny reads as full. */
    const val PAID_EPSILON = 0.005

    // ── The three amounts on a card ─────────────────────────────────
    /**
     * What's actually on the card right now. [Card.balance] is the statement
     * balance — what's due by the due date — while [Card.currentBalance]
     * (typed in, or pushed by a bank sync) is the live figure including
     * charges made since the statement closed. Utilization follows the live
     * figure because that's what the issuer reports; unset means "not tracked
     * separately", so fall back to the statement. Mirrors liveCardBalance in
     * utils.js.
     */
    fun liveBalance(card: Card): Double = card.currentBalance ?: card.balance

    /**
     * The three amounts a card row can lead with, resolved together so the
     * headline and its companion figures can never disagree.
     */
    data class CardAmounts(
        /** Statement balance — a loan's is its scheduled payment. */
        val due: Double,
        /** Live balance, the one utilization is measured against. */
        val current: Double,
        /** Still owed this period under the paid-goal policy (0 if skipped). */
        val owed: Double,
    ) {
        /** The amount named by a `settings.cardHeadline` value. */
        fun valueFor(headline: String): Double = when (headline) {
            "current" -> current
            "owed" -> owed
            else -> due
        }
    }

    fun amounts(
        card: Card,
        policy: PaidGoalPolicy,
        payments: List<Payment>,
        bounds: PeriodBounds,
        zone: ZoneId,
        now: Instant = Instant.now(),
    ): CardAmounts {
        val ref = card.id.toString()
        val owed = if (isSkipped(payments, "card", ref, bounds)) {
            0.0
        } else {
            max(0.0, goalAmount(card, policy, payments, bounds, zone, now) - paidAmount(payments, "card", ref, bounds))
        }
        return CardAmounts(
            due = if (card.type == "loan") card.minPayment else card.balance,
            current = liveBalance(card),
            owed = owed,
        )
    }

    /**
     * The two amounts a row isn't leading with, in a stable order. The
     * preference re-ranks the three; it never hides one.
     */
    fun otherAmounts(headline: String): List<String> =
        listOf("due", "current", "owed").filter { it != headline }

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

    // ── Pay targets ─────────────────────────────────────────────────
    /**
     * One target a payment can aim at this period. [payTarget] gives the target
     * itself and [payRemaining] what's left of it after the payments already
     * recorded. Mirrors payTargetAmount in utils.js.
     */
    enum class PayTarget {
        /** A bill's whole amount (the only target a bill has). */
        FULL,
        /** The card's minimum payment. */
        MINIMUM,
        /** The payoff-aware recommendation. */
        RECOMMENDED,
        /** A loan's scheduled monthly payment. */
        MONTHLY,
        /** The whole start-of-period balance (a loan's remaining principal). */
        PAYOFF,
    }

    /**
     * The card as it stood at the start of the period, payments undone. Card
     * payments decrement the live balance, so balance-derived targets add this
     * period's payments back: the target holds still while the remainder
     * shrinks as installments land.
     */
    private fun cardAtPeriodStart(card: Card, paid: Double): Card {
        if (paid <= 0) return card
        return card.copy(
            balance = card.balance + paid,
            promoBalance = card.promoBalance?.let { it + paid },
        )
    }

    /** This period's target for one pay preset, before payments are subtracted. */
    fun payTarget(
        kind: PayTarget,
        card: Card,
        paid: Double,
        zone: ZoneId,
        now: Instant = Instant.now(),
    ): Double = when (kind) {
        PayTarget.MINIMUM -> card.minPayment
        PayTarget.MONTHLY -> card.recommendedPayment?.takeIf { it > 0 } ?: card.minPayment
        PayTarget.PAYOFF, PayTarget.FULL -> cardAtPeriodStart(card, paid).balance
        PayTarget.RECOMMENDED -> recommendedAmount(cardAtPeriodStart(card, paid), zone, now)
    }

    /** What's left toward a target after this period's payments (never below 0). */
    fun payRemaining(
        kind: PayTarget,
        card: Card,
        paid: Double,
        zone: ZoneId,
        now: Instant = Instant.now(),
    ): Double = max(0.0, payTarget(kind, card, paid, zone, now) - paid)

    /** A bill's fully-paid goal is always its full amount. */
    fun goalAmount(bill: Bill): Double = bill.amount

    /**
     * A card's fully-paid goal this period — the pay target the active policy names
     * (mirrors goalAmountFor in utils.js). [paid] is what's already been paid this
     * period; balance-derived targets add it back so the goal stays stable as
     * installments land.
     */
    fun goalAmount(
        card: Card,
        policy: PaidGoalPolicy,
        paid: Double,
        zone: ZoneId,
        now: Instant = Instant.now(),
    ): Double {
        // Loans: the monthly obligation is the scheduled payment under every
        // policy — never the full principal. A per-loan override still wins.
        if (card.type == "loan") return payTarget(PayTarget.MONTHLY, card, paid, zone, now)
        return when (policy) {
            PaidGoalPolicy.MINIMUM -> payTarget(PayTarget.MINIMUM, card, paid, zone, now)
            PaidGoalPolicy.FULL -> payTarget(PayTarget.PAYOFF, card, paid, zone, now)
            PaidGoalPolicy.RECOMMENDED -> payTarget(PayTarget.RECOMMENDED, card, paid, zone, now)
        }
    }

    fun goalAmount(
        card: Card,
        policy: PaidGoalPolicy,
        payments: List<Payment>,
        monthKey: String,
        zone: ZoneId,
        now: Instant = Instant.now(),
    ): Double = goalAmount(
        card,
        policy,
        paidAmount(payments, "card", card.id.toString(), monthKey),
        zone,
        now,
    )
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
