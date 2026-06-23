package app.fihaven.core.logic

import app.fihaven.core.model.IncomeAdjustment
import app.fihaven.core.model.IncomeSource
import app.fihaven.core.model.income
import app.fihaven.core.model.incomeAdjustments
import app.fihaven.core.model.incomes
import kotlinx.serialization.json.JsonObject
import java.time.temporal.ChronoUnit

/// Income-frequency normalization, ported from income.js.
object Income {
    data class Frequency(val key: String, val label: String, val perMonth: Double)

    val frequencies: List<Frequency> = listOf(
        Frequency("hourly", "Hourly", 52.0 / 12.0), // ×hoursPerWeek
        Frequency("weekly", "Weekly", 52.0 / 12.0),
        Frequency("biweekly", "Bi-weekly", 26.0 / 12.0),
        Frequency("semimonthly", "Semi-monthly", 2.0),
        Frequency("monthly", "Monthly", 1.0),
        Frequency("annual", "Annual", 1.0 / 12.0),
    )

    /** Weeks per month — converts an hourly rate (× hours/week) to monthly. */
    const val WEEKS_PER_MONTH: Double = 52.0 / 12.0

    fun factor(frequency: String): Double =
        frequencies.firstOrNull { it.key == frequency }?.perMonth ?: 1.0

    /** Monthly equivalent of a source. Hourly = rate × hours/week × weeks/month. */
    fun monthly(source: IncomeSource): Double =
        if (source.frequency == "hourly") source.amount * source.hoursPerWeek * WEEKS_PER_MONTH
        else source.amount * factor(source.frequency)

    /// Base monthly income (recurring sources only).
    fun monthlyIncome(settings: JsonObject): Double {
        val sources = settings.incomes
        return if (sources.isNotEmpty()) sources.sumOf { monthly(it) } else settings.income
    }

    /// Adjustments (bonuses / unpaid time off / raises) affecting period [mk].
    fun adjustmentsFor(settings: JsonObject, mk: String): List<IncomeAdjustment> =
        settings.incomeAdjustments.filter { it.appliesTo(mk) }

    /// Signed total of all adjustments affecting period [mk].
    fun adjustmentsTotal(settings: JsonObject, mk: String): Double =
        adjustmentsFor(settings, mk).sumOf { it.amount }

    /// Effective income for a period: base income + applicable adjustments.
    fun monthlyIncome(settings: JsonObject, mk: String): Double =
        monthlyIncome(settings) + adjustmentsTotal(settings, mk)

    const val AVG_MONTH_DAYS: Double = 365.0 / 12.0

    fun periodDays(bounds: PeriodBounds): Int =
        ChronoUnit.DAYS.between(bounds.start, bounds.end).toInt().coerceAtLeast(1)

    data class MonthOverlap(val mk: String, val fraction: Double)

    fun monthOverlaps(bounds: PeriodBounds): List<MonthOverlap> {
        val out = mutableListOf<MonthOverlap>()
        var cursor = bounds.start.withDayOfMonth(1)
        while (cursor.isBefore(bounds.end)) {
            val monthStart = cursor
            val monthEnd = monthStart.plusMonths(1)
            val overlapStart = if (bounds.start.isAfter(monthStart)) bounds.start else monthStart
            val overlapEnd = if (bounds.end.isBefore(monthEnd)) bounds.end else monthEnd
            val overlapDays = ChronoUnit.DAYS.between(overlapStart, overlapEnd)
            val monthDays = ChronoUnit.DAYS.between(monthStart, monthEnd)
            if (overlapDays > 0 && monthDays > 0) {
                out += MonthOverlap(DateLogic.monthKey(monthStart), overlapDays.toDouble() / monthDays.toDouble())
            }
            cursor = monthEnd
        }
        return out
    }

    fun adjustmentsTotal(settings: JsonObject, bounds: PeriodBounds): Double {
        if (bounds.mode == "calendar") return adjustmentsTotal(settings, bounds.key)
        return monthOverlaps(bounds).sumOf { (mk, fraction) ->
            adjustmentsTotal(settings, mk) * fraction
        }
    }

    fun periodIncome(settings: JsonObject, bounds: PeriodBounds): Double {
        val base = monthlyIncome(settings)
        if (bounds.mode == "calendar") return base + adjustmentsTotal(settings, bounds.key)
        val prorate = periodDays(bounds) / AVG_MONTH_DAYS
        return base * prorate + adjustmentsTotal(settings, bounds)
    }

    fun incomeLabel(cfg: PeriodConfig): String =
        if (cfg.mode == "calendar") "Monthly income" else "Period income"

    fun owedLabel(cfg: PeriodConfig): String =
        if (cfg.mode == "calendar") "Left to pay" else "Left this period"
}
