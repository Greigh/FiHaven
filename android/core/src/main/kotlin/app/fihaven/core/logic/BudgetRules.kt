package app.fihaven.core.logic

import app.fihaven.core.model.Bill
import app.fihaven.core.model.Card
import app.fihaven.core.model.SavingsGoal
import app.fihaven.core.model.SpendTransaction
import app.fihaven.core.model.budgetRule
import app.fihaven.core.model.budgetRuleSplits
import app.fihaven.core.model.categoryBudgets
import app.fihaven.core.model.debtFocusExtra
import kotlinx.serialization.json.JsonObject
import java.time.LocalDate
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.round

/// Budget lenses on the Budget tab — port of budgetRules.js.
object BudgetRules {
    enum class Bucket { NEEDS, WANTS, SAVE }

    data class Splits(val needs: Int, val wants: Int, val save: Int)

    data class Row(
        val key: String,
        val label: String,
        val pct: Int? = null,
        val target: Double? = null,
        val actual: Double,
        val delta: Double = 0.0,
        val status: String,
        val hint: String? = null,
    )

    data class Headline(val label: String, val amount: Double, val status: String)

    data class Warning(
        val key: String,
        val label: String,
        val amount: Double,
        val pct: Double,
        val limit: Int,
        val over: Boolean,
    )

    data class Lens(
        val mode: String,
        val title: String,
        val subtitle: String,
        val headline: Headline? = null,
        val rows: List<Row>,
        val warnings: List<Warning>,
        val proLocked: Boolean = false,
    )

    const val HOUSING_RATIO_LIMIT = 30
    const val DEBT_RATIO_LIMIT = 36

    private val presetSplits = mapOf(
        "50-30-20" to Splits(50, 30, 20),
        "80-20" to Splits(80, 0, 20),
        "60-20-20" to Splits(60, 20, 20),
        "70-20-10" to Splits(70, 20, 10),
    )

    private val splitModes = presetSplits.keys + "custom"

    private val billBuckets = mapOf(
        "Housing" to Bucket.NEEDS, "Utilities" to Bucket.NEEDS, "Insurance" to Bucket.NEEDS,
        "Loan" to Bucket.NEEDS, "Auto" to Bucket.NEEDS, "Subscriptions" to Bucket.WANTS,
        "Investment" to Bucket.SAVE, "Other" to Bucket.NEEDS,
    )

    private val spendingBuckets = mapOf(
        "Groceries" to Bucket.NEEDS, "Dining" to Bucket.WANTS, "Shopping" to Bucket.WANTS,
        "Transport" to Bucket.NEEDS, "Entertainment" to Bucket.WANTS, "Health" to Bucket.NEEDS,
        "Bills" to Bucket.NEEDS, "Other" to Bucket.WANTS,
    )

    private val debtBillCategories = setOf("Loan", "Auto")

    private val titles = mapOf(
        "50-30-20" to "50 / 30 / 20",
        "80-20" to "80 / 20",
        "60-20-20" to "60 / 20 / 20",
        "70-20-10" to "70 / 20 / 10",
        "custom" to "Custom split",
        "obligations-first" to "Obligations first",
        "debt-focus" to "Debt focus",
        "envelope" to "Envelope lite",
    )

    fun mode(settings: JsonObject): String = when (settings.budgetRule) {
        "50-30-20", "503020" -> "50-30-20"
        in presetSplits -> settings.budgetRule
        "custom" -> "custom"
        "obligations-first", "obligations" -> "obligations-first"
        "debt-focus", "debt" -> "debt-focus"
        "envelope" -> "envelope"
        else -> "off"
    }

    fun enabled(settings: JsonObject): Boolean = mode(settings) != "off"

    fun title(mode: String): String = titles[mode] ?: mode

    fun splits(settings: JsonObject): Splits? {
        val m = mode(settings)
        presetSplits[m]?.let { return it }
        if (m != "custom") return null
        val raw = settings.budgetRuleSplits
        val sum = raw.needs + raw.wants + raw.save
        if (sum <= 0) return Splits(50, 30, 20)
        return Splits(
            needs = round(raw.needs * 100.0 / sum).toInt(),
            wants = round(raw.wants * 100.0 / sum).toInt(),
            save = round(raw.save * 100.0 / sum).toInt(),
        )
    }

    fun suggestedGoalMonthly(g: SavingsGoal, zone: java.time.ZoneId): Double {
        val remaining = max(0.0, g.target - g.saved)
        if (g.targetDate.isBlank() || remaining <= 0) return 0.0
        val months = max(1, DateLogic.monthsUntil(g.targetDate, zone))
        return remaining / months
    }

    fun obligationsTotal(
        bills: List<Bill>, cards: List<Card>, bounds: PeriodBounds,
        billDueInPeriod: (Bill) -> Boolean,
        billAmount: (Bill) -> Double, cardAmount: (Card) -> Double,
    ): Double {
        var t = 0.0
        bills.filter(billDueInPeriod).forEach { t += billAmount(it) }
        cards.forEach { t += cardAmount(it) }
        return t
    }

    fun housingMonthly(
        bills: List<Bill>, billDueInPeriod: (Bill) -> Boolean, billAmount: (Bill) -> Double,
    ): Double = bills.filter { it.category == "Housing" && billDueInPeriod(it) }.sumOf(billAmount)

    fun debtPaymentsMonthly(
        bills: List<Bill>, cards: List<Card>,
        billDueInPeriod: (Bill) -> Boolean, billAmount: (Bill) -> Double, cardAmount: (Card) -> Double,
    ): Double {
        var t = cards.sumOf(cardAmount)
        bills.filter { it.category in debtBillCategories && billDueInPeriod(it) }.forEach { t += billAmount(it) }
        return t
    }

    fun ratioWarnings(
        income: Double, bills: List<Bill>, cards: List<Card>,
        billDueInPeriod: (Bill) -> Boolean, billAmount: (Bill) -> Double, cardAmount: (Card) -> Double,
    ): List<Warning> {
        if (income <= 0) return emptyList()
        val out = mutableListOf<Warning>()
        val housing = housingMonthly(bills, billDueInPeriod, billAmount)
        if (housing > 0) {
            val pct = housing / income * 100
            out += Warning("housing", "Housing", housing, round(pct * 10) / 10, HOUSING_RATIO_LIMIT, pct > HOUSING_RATIO_LIMIT + 0.05)
        }
        val debt = debtPaymentsMonthly(bills, cards, billDueInPeriod, billAmount, cardAmount)
        if (debt > 0) {
            val pct = debt / income * 100
            out += Warning("debt", "Debt payments", debt, round(pct * 10) / 10, DEBT_RATIO_LIMIT, pct > DEBT_RATIO_LIMIT + 0.05)
        }
        return out
    }

    fun lens(
        settings: JsonObject,
        income: Double,
        bills: List<Bill>,
        cards: List<Card>,
        transactions: List<SpendTransaction>,
        goals: List<SavingsGoal>,
        bounds: PeriodBounds,
        billDueInPeriod: (Bill) -> Boolean,
        isPro: Boolean,
        zone: java.time.ZoneId,
        billAmount: (Bill) -> Double = { it.amount },
        cardAmount: (Card) -> Double = { it.minPayment },
    ): Lens? {
        val m = mode(settings)
        if (m == "off") return null
        if (m != "envelope" && income <= 0) return null

        val warn = ratioWarnings(income, bills, cards, billDueInPeriod, billAmount, cardAmount)

        return when (m) {
            "obligations-first" -> obligationsFirst(income, bills, cards, goals, bounds, billDueInPeriod, billAmount, cardAmount, warn, zone)
            "debt-focus" -> debtFocus(income, settings, bills, cards, billDueInPeriod, billAmount, cardAmount, warn)
            "envelope" -> envelope(income, settings, bills, cards, goals, bounds, billDueInPeriod, isPro, billAmount, cardAmount, warn, zone)
            in splitModes -> splitLens(m, settings, income, bills, cards, transactions, bounds, billDueInPeriod, billAmount, cardAmount, warn)
            else -> null
        }
    }

    /** @deprecated use [lens] */
    fun summary(
        settings: JsonObject, income: Double, bills: List<Bill>, cards: List<Card>,
        transactions: List<SpendTransaction>, bounds: PeriodBounds,
        billDueInPeriod: (Bill) -> Boolean,
        billAmount: (Bill) -> Double = { it.amount },
        cardAmount: (Card) -> Double = { it.minPayment },
    ): Lens? = lens(settings, income, bills, cards, transactions, emptyList(), bounds, billDueInPeriod, false, java.time.ZoneId.systemDefault(), billAmount, cardAmount)

    private fun splitLens(
        mode: String, settings: JsonObject, income: Double,
        bills: List<Bill>, cards: List<Card>, transactions: List<SpendTransaction>,
        bounds: PeriodBounds, billDueInPeriod: (Bill) -> Boolean,
        billAmount: (Bill) -> Double, cardAmount: (Card) -> Double, warnings: List<Warning>,
    ): Lens? {
        val sp = splits(settings) ?: return null
        val targets = mapOf(
            Bucket.NEEDS to income * sp.needs / 100,
            Bucket.WANTS to income * sp.wants / 100,
            Bucket.SAVE to income * sp.save / 100,
        )
        val actual = mutableMapOf(Bucket.NEEDS to 0.0, Bucket.WANTS to 0.0, Bucket.SAVE to 0.0)
        bills.filter(billDueInPeriod).forEach { b ->
            actual[billBuckets[b.category] ?: Bucket.NEEDS] = actual.getValue(billBuckets[b.category] ?: Bucket.NEEDS) + billAmount(b)
        }
        cards.forEach { actual[Bucket.NEEDS] = actual.getValue(Bucket.NEEDS) + cardAmount(it) }
        transactions.forEach { t ->
            if (!transactionInPeriod(t.date, bounds)) return@forEach
            val b = spendingBuckets[t.category] ?: Bucket.WANTS
            actual[b] = actual.getValue(b) + abs(t.amount)
        }
        actual[Bucket.SAVE] = max(0.0, income - actual.getValue(Bucket.NEEDS) - actual.getValue(Bucket.WANTS))
        val rows = listOf(
            splitRow("needs", "Needs", sp.needs, targets.getValue(Bucket.NEEDS), actual.getValue(Bucket.NEEDS)),
            splitRow("wants", "Wants", sp.wants, targets.getValue(Bucket.WANTS), actual.getValue(Bucket.WANTS)),
            splitRow("save", "Save", sp.save, targets.getValue(Bucket.SAVE), actual.getValue(Bucket.SAVE), isSave = true),
        )
        return Lens(mode, title(mode), "Needs, wants, and save targets from income.", null, rows, warnings)
    }

    private fun obligationsFirst(
        income: Double, bills: List<Bill>, cards: List<Card>, goals: List<SavingsGoal>,
        bounds: PeriodBounds, billDueInPeriod: (Bill) -> Boolean,
        billAmount: (Bill) -> Double, cardAmount: (Card) -> Double,
        warnings: List<Warning>, zone: java.time.ZoneId,
    ): Lens {
        val obligations = obligationsTotal(bills, cards, bounds, billDueInPeriod, billAmount, cardAmount)
        val goalMonthly = goals.sumOf { suggestedGoalMonthly(it, zone) }
        val safe = income - obligations - goalMonthly
        val rows = listOf(
            Row("income", "Income", actual = income, status = "ok"),
            Row("obligations", "Bills + minimums", actual = obligations, status = "ok"),
            Row("goals", "Goal contributions", actual = goalMonthly, status = "ok",
                hint = if (goalMonthly > 0) "Suggested monthly from savings goals" else "Add target dates on goals"),
        )
        return Lens("obligations-first", title("obligations-first"), "What is left after fixed obligations and planned savings.",
            Headline("Safe to spend", safe, if (safe >= 0) "ok" else "over"), rows, warnings)
    }

    private fun debtFocus(
        income: Double, settings: JsonObject, bills: List<Bill>, cards: List<Card>,
        billDueInPeriod: (Bill) -> Boolean, billAmount: (Bill) -> Double, cardAmount: (Card) -> Double,
        warnings: List<Warning>,
    ): Lens {
        val mins = debtPaymentsMonthly(bills, cards, billDueInPeriod, billAmount, cardAmount)
        val extra = max(0.0, settings.debtFocusExtra)
        val flex = income - mins - extra
        val rows = listOf(
            Row("minimums", "Debt minimums", actual = mins, target = mins, status = "ok"),
            Row("extra", "Extra debt payment", actual = extra, target = extra, status = "ok", hint = "Set in Settings → Budget lens"),
            Row("flex", "Flexible spending", actual = flex, target = max(0.0, flex), status = if (flex >= 0) "ok" else "over"),
        )
        return Lens("debt-focus", title("debt-focus"), "Minimums plus your planned extra payment.",
            Headline("After debt plan", flex, if (flex >= 0) "ok" else "over"), rows, warnings)
    }

    private fun envelope(
        income: Double, settings: JsonObject, bills: List<Bill>, cards: List<Card>,
        goals: List<SavingsGoal>, bounds: PeriodBounds, billDueInPeriod: (Bill) -> Boolean, isPro: Boolean,
        billAmount: (Bill) -> Double, cardAmount: (Card) -> Double,
        warnings: List<Warning>, zone: java.time.ZoneId,
    ): Lens {
        if (!isPro) {
            return Lens("envelope", title("envelope"), "Assign every dollar — goals plus category budgets.",
                proLocked = true, rows = emptyList(), warnings = emptyList())
        }
        val obligations = obligationsTotal(bills, cards, bounds, billDueInPeriod, billAmount, cardAmount)
        val goalsTotal = goals.sumOf { suggestedGoalMonthly(it, zone) }
        val catsTotal = settings.categoryBudgets.values.sum()
        val unassigned = income - obligations - goalsTotal - catsTotal
        val rows = listOf(
            Row("obligations", "Fixed obligations", actual = obligations, status = "ok"),
            Row("goals", "Assigned to goals", actual = goalsTotal, status = "ok"),
            Row("categories", "Assigned to categories", actual = catsTotal, status = "ok"),
            Row("unassigned", "Left to assign", actual = unassigned,
                status = if (abs(unassigned) < 0.01) "ok" else if (unassigned > 0) "under" else "over",
                hint = if (unassigned > 0) "Assign to goals or category budgets" else "Over-assigned"),
        )
        return Lens("envelope", title("envelope"), "Zero-based lite: goals + category budgets should use income after obligations.",
            Headline("Unassigned", unassigned, if (abs(unassigned) < 0.01) "ok" else if (unassigned > 0) "under" else "over"),
            rows, warnings)
    }

    private fun splitRow(key: String, label: String, pct: Int, target: Double, actual: Double, isSave: Boolean = false) = Row(
        key, label, pct, target, actual, actual - target,
        if (isSave) { if (actual >= target - 0.005) "ok" else "under" }
        else { if (actual <= target + 0.005) "ok" else "over" },
    )

    private fun transactionInPeriod(date: String, bounds: PeriodBounds): Boolean {
        if (date.isBlank()) return false
        val d = runCatching { LocalDate.parse(date) }.getOrNull() ?: return false
        return !d.isBefore(bounds.start) && d.isBefore(bounds.end)
    }
}
