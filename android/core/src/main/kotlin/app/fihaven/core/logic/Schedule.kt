package app.fihaven.core.logic

import app.fihaven.core.CTConstants
import app.fihaven.core.model.Bill
import app.fihaven.core.model.Card
import app.fihaven.core.model.CategoryIcon
import app.fihaven.core.model.Payment
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.abs
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
                    amount = b.amountOrZero,
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
            val needed = if (c.hasPromo) max(c.minPaymentOrZero, promoNeeded(c, zone, now)) else c.minPaymentOrZero
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
     * Credit utilization as a 0..1 ratio, or null when there is nothing to
     * measure against — a loan (no revolving limit) or a card with no limit
     * set. Always from [liveBalance], because that is the figure the issuer
     * reports. Mirrors utilizationOf in utils.js.
     *
     * One helper for every caller on purpose: the row, the dashboard alert and
     * the "highest utilization" sort each derived this separately, and drifted
     * apart — a row could read 91% while the alert naming it computed less.
     */
    fun utilization(card: Card): Double? {
        if (card.type == "loan" || card.limit <= 0) return null
        return liveBalance(card) / card.limit
    }

    /**
     * What's owed on revolving credit: non-archived, non-loan, at live balance.
     * Loans share the cards list, so summing it raw puts a mortgage in the card
     * total. Net worth is the opposite case and counts every liability.
     */
    fun cardDebt(cards: List<Card>): Double =
        cards.filter { !it.archived && it.type != "loan" }.sumOf { liveBalance(it) }

    /**
     * The amounts a card row shows, resolved together so the headline and its
     * companion figures can never disagree.
     */
    data class CardAmounts(
        /**
         * What to pay this period: the goal the paid-goal policy names, with a
         * per-card recommended payment overriding it. A loan's is its
         * scheduled payment.
         *
         * This was the raw statement balance, which read "$0.00" — in the
         * settled green, no less — on a 0% promo card whose statement is clear
         * but whose monthly payoff installment still has to land on time.
         */
        val due: Double,
        /** Live balance, the one utilization is measured against. */
        val current: Double,
        /** [due] less what's been paid this period (0 if skipped). */
        val owed: Double,
        /**
         * The statement balance — what the issuer actually billed — or null
         * when the row already accounts for it.
         *
         * Once [due] became the period's goal, the statement had nowhere left
         * to go whenever the goal isn't the balance: the minimum policy, a
         * promo card, a per-card override. It's null when it would only repeat
         * [due] or [current], and on loans, which have a principal rather than
         * a statement. Deciding it here keeps the three clients from drifting.
         */
        val statement: Double? = null,
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
        // One goal behind both figures: the target this period, and what's
        // left of it. Resolved together so they can't disagree.
        val goal = goalAmount(card, policy, payments, bounds, zone, now)
        val owed = if (isSkipped(payments, "card", ref, bounds)) {
            0.0
        } else {
            max(0.0, goal - paidAmount(payments, "card", ref, bounds))
        }
        val current = liveBalance(card)
        val redundant = card.type == "loan" ||
            abs(card.balance - goal) <= PAID_EPSILON ||
            abs(card.balance - current) <= PAID_EPSILON
        return CardAmounts(
            due = goal,
            current = current,
            owed = owed,
            statement = if (redundant) null else card.balance,
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
        if (card.type == "loan") return card.minPaymentOrZero
        if (card.hasPromo) return max(card.minPaymentOrZero, promoNeeded(card, zone, now))
        // 0% interest (no active promo): carrying a balance costs nothing, so the
        // recommended payment is just the minimum — not the whole balance.
        if (card.regularAPR <= 0) return card.minPaymentOrZero
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
        PayTarget.MINIMUM -> card.minPaymentOrZero
        PayTarget.MONTHLY -> card.recommendedPayment?.takeIf { it > 0 } ?: card.minPaymentOrZero
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
    fun goalAmount(bill: Bill): Double = bill.amountOrZero

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

    // ── Paid state ──────────────────────────────────────────────────
    /**
     * True when a bill has no amount to measure against: the field was never
     * filled in (null, not an explicit 0) and nothing has been paid toward it.
     *
     * This has to be separate from "fully paid", because a zero goal satisfies
     * `remaining <= 0` on its own: a bill saved without an amount read "Paid
     * this month" every month with no payment record behind it, and the row's
     * Undo had nothing to remove (it deletes a payment record), so the state
     * couldn't be cleared from the UI at all. Mirrors needsAmount in utils.js.
     *
     * A skipped item is excluded — it owes nothing by choice, which is an
     * answer rather than a missing one.
     */
    fun needsAmount(bill: Bill, payments: List<Payment>, bounds: PeriodBounds): Boolean {
        val ref = bill.id.toString()
        if (isSkipped(payments, "bill", ref, bounds)) return false
        if (paidAmount(payments, "bill", ref, bounds) > PAID_EPSILON) return false
        return bill.amount == null
    }

    /**
     * True when a card/loan has no amount to measure against. Only the field the
     * active goal actually reads counts: a balance-derived goal (the recommended
     * / full policies on a credit card) legitimately reaches 0 once the card is
     * paid off, which is "nothing due" rather than missing setup.
     */
    fun needsAmount(
        card: Card,
        policy: PaidGoalPolicy,
        payments: List<Payment>,
        bounds: PeriodBounds,
    ): Boolean {
        val ref = card.id.toString()
        if (isSkipped(payments, "card", ref, bounds)) return false
        if (paidAmount(payments, "card", ref, bounds) > PAID_EPSILON) return false
        if (card.type == "loan") {
            // An override only drives the goal while it is above zero (see
            // PayTarget.MONTHLY); otherwise the scheduled payment does.
            if ((card.recommendedPayment ?: 0.0) > 0) return false
            return card.minPayment == null
        }
        return policy == PaidGoalPolicy.MINIMUM && card.minPayment == null
    }

    /**
     * True once nothing remains toward [goal]. An item with no amount set is
     * never "paid" — see [needsAmount]. Mirrors isFullyPaid in utils.js.
     */
    fun isFullyPaid(goal: Double, paid: Double, skipped: Boolean, needsAmount: Boolean): Boolean {
        if (needsAmount) return false
        if (skipped) return true
        return max(0.0, goal - paid) <= PAID_EPSILON
    }

    /**
     * True when an item is settled because there is genuinely nothing to pay —
     * an amount deliberately set to 0 — rather than because a payment was
     * recorded. Lets a row say "Nothing due" instead of claiming credit for a
     * payment that never happened. Mirrors nothingDue in utils.js.
     */
    fun nothingDue(goal: Double, paid: Double, skipped: Boolean, needsAmount: Boolean): Boolean {
        if (skipped || needsAmount) return false
        return paid <= PAID_EPSILON && isFullyPaid(goal, paid, false, false)
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
