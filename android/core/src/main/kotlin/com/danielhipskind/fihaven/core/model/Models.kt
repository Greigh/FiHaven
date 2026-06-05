package com.danielhipskind.fihaven.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/// Shared JSON config: tolerant on read, full on write. Mirrors the
/// leniency of the Swift core (docs/native-contract.md §6). Note: like a
/// strict decoder, a *string* in a numeric field isn't coerced — the web
/// always writes numbers, so this matches real data.
val FiHavenJson: Json = Json {
    ignoreUnknownKeys = true
    isLenient = true
    coerceInputValues = true
    encodeDefaults = true
    explicitNulls = false
}

@Serializable
data class Bill(
    val id: Int = 0,
    val name: String = "",
    val category: String = "Other",
    val amount: Double = 0.0,
    val dueDay: Int? = null,
    val frequency: String = "Monthly",
    val autopay: Boolean = false,
    val notes: String = "",
)

@Serializable
data class Card(
    val id: Int = 0,
    val name: String = "",
    val balance: Double = 0.0,
    val limit: Double = 0.0,
    val minPayment: Double = 0.0,
    val recommendedPayment: Double? = null,   // optional override for the "recommended" payment
    val regularAPR: Double = 0.0,
    val hasPromo: Boolean = false,
    val promoAPR: Double? = null,
    val promoEndDate: String? = null,   // "YYYY-MM-DD"
    val promoBalance: Double? = null,
    val dueDay: Int? = null,
    val autopay: Boolean = false,
    val notes: String = "",
)

@Serializable
data class Payment(
    val id: Long = 0,
    val type: String = "",              // "bill" | "card"
    val refId: String = "",
    val name: String = "",
    val amount: Double = 0.0,
    val date: String = "",              // ISO date
    val monthKey: String = "",          // "YYYY-MM"
    val note: String = "",
)

@Serializable
data class IncomeSource(
    val id: String = "",
    val label: String = "",
    val amount: Double = 0.0,
    val frequency: String = "monthly",
)

/// Full per-user blob. `settings` stays a raw JsonObject so unknown
/// (web-only) keys survive a round-trip.
@Serializable
data class AppData(
    val email: String? = null,
    val bills: List<Bill> = emptyList(),
    val cards: List<Card> = emptyList(),
    val payments: List<Payment> = emptyList(),
    val settings: JsonObject = JsonObject(emptyMap()),
    // Present on read only (`GET /api/data`): effective Pro entitlement.
    val entitlement: Entitlement? = null,
) {
    val isEmpty: Boolean get() = bills.isEmpty() && cards.isEmpty() && payments.isEmpty()
}
