package com.danielhipskind.fihaven.core.logic

import com.danielhipskind.fihaven.core.model.IncomeSource
import com.danielhipskind.fihaven.core.model.income
import com.danielhipskind.fihaven.core.model.incomes
import kotlinx.serialization.json.JsonObject

/// Income-frequency normalization, ported from income.js.
object Income {
    data class Frequency(val key: String, val label: String, val perMonth: Double)

    val frequencies: List<Frequency> = listOf(
        Frequency("weekly", "Weekly", 52.0 / 12.0),
        Frequency("biweekly", "Bi-weekly", 26.0 / 12.0),
        Frequency("semimonthly", "Semi-monthly", 2.0),
        Frequency("monthly", "Monthly", 1.0),
        Frequency("annual", "Annual", 1.0 / 12.0),
    )

    fun factor(frequency: String): Double =
        frequencies.firstOrNull { it.key == frequency }?.perMonth ?: 1.0

    fun monthly(source: IncomeSource): Double = source.amount * factor(source.frequency)

    fun monthlyIncome(settings: JsonObject): Double {
        val sources = settings.incomes
        return if (sources.isNotEmpty()) sources.sumOf { monthly(it) } else settings.income
    }
}
