package com.danielhipskind.fihaven.core.model

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/// Typed accessors over the open-ended `settings` JsonObject, mirroring
/// the Swift `Settings` accessors.
private fun JsonObject.prim(key: String): JsonPrimitive? = this[key] as? JsonPrimitive

val JsonObject.income: Double get() = prim("income")?.doubleOrNull ?: 0.0
val JsonObject.lastVisitKey: String? get() = prim("lastVisitKey")?.contentOrNull
val JsonObject.timezoneSetting: String? get() = prim("timezone")?.contentOrNull
val JsonObject.theme: String? get() = prim("theme")?.contentOrNull

/// "minimum" | "recommended" | "full" — how much must be paid before a
/// bill/card counts as fully paid. Parse via PaidGoalPolicy.from.
val JsonObject.paidGoal: String? get() = prim("paidGoal")?.contentOrNull

/// ISO 4217 display currency (e.g. "USD"). Drives Money formatting.
val JsonObject.currency: String? get() = prim("currency")?.contentOrNull

/// Which view the app opens to ("dashboard" | "bills" | "cards" | …).
val JsonObject.landingView: String? get() = prim("landingView")?.contentOrNull

/// Opt-in email reminders / monthly summary (server scheduler).
val JsonObject.billReminders: Boolean get() = prim("billReminders")?.booleanOrNull ?: false
val JsonObject.monthlySummary: Boolean get() = prim("monthlySummary")?.booleanOrNull ?: false

val JsonObject.incomes: List<IncomeSource>
    get() {
        val arr = this["incomes"] as? JsonArray ?: return emptyList()
        return arr.mapNotNull { el ->
            (el as? JsonObject)?.let { o ->
                IncomeSource(
                    id = o.prim("id")?.contentOrNull ?: "",
                    label = o.prim("label")?.contentOrNull ?: "",
                    amount = o.prim("amount")?.doubleOrNull ?: 0.0,
                    frequency = o.prim("frequency")?.contentOrNull ?: "monthly",
                )
            }
        }
    }

/// Return a copy of the settings object with `timezone` set/cleared.
fun JsonObject.withTimezone(tz: String?): JsonObject = buildJsonObject {
    this@withTimezone.forEach { (k, v) -> if (k != "timezone") put(k, v) }
    if (tz != null) put("timezone", tz)
}

/// Return a copy with the fully-paid policy ("minimum"|"recommended"|"full") set.
fun JsonObject.withPaidGoal(policy: String): JsonObject = buildJsonObject {
    this@withPaidGoal.forEach { (k, v) -> if (k != "paidGoal") put(k, v) }
    put("paidGoal", policy)
}

/// Return a copy with one arbitrary setting key set (used for currency,
/// landingView, billReminders, monthlySummary).
fun JsonObject.withSetting(key: String, value: JsonElement): JsonObject = buildJsonObject {
    this@withSetting.forEach { (k, v) -> if (k != key) put(k, v) }
    put(key, value)
}

/// Return a copy with the income list replaced.
fun JsonObject.withIncomes(incomes: List<IncomeSource>): JsonObject = buildJsonObject {
    this@withIncomes.forEach { (k, v) -> if (k != "incomes") put(k, v) }
    put("incomes", buildJsonArray {
        incomes.forEach { src ->
            add(buildJsonObject {
                put("id", src.id)
                put("label", src.label)
                put("amount", src.amount)
                put("frequency", src.frequency)
            })
        }
    })
}
