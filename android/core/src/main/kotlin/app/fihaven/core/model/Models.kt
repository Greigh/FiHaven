package app.fihaven.core.model

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
    val business: String? = null,
    val category: String = "Other",
    val amount: Double = 0.0,
    val dueDay: Int? = null,
    val frequency: String = "Monthly",
    val autopay: Boolean = false,
    val autopayDay: Int? = null,        // "Autopay day" — day money is pulled; null falls back to dueDay
    val notes: String = "",
    val cardId: String? = null,         // "Charged to" — id of the card this bill is paid on
    val startDate: String? = null,      // "First bill due on" — "YYYY-MM-DD"; gates when it begins
    val endDate: String? = null,        // "Stops on" — "YYYY-MM-DD"; bill is retired after this
    val trialEnds: String? = null,      // Free trial end — "YYYY-MM-DD"; subscription panel + reminders
)

@Serializable
data class Card(
    val id: Int = 0,
    val name: String = "",
    val type: String = "card", // "card" | "loan"
    val issuer: String? = null,
    val currentBalance: Double? = null,
    val lastDigits: String? = null,
    val network: String? = null,        // "Visa" | "Mastercard" | "Amex" | "Discover" | …
    val balance: Double = 0.0, // Statement Balance (Credit Card) or Remaining Principal (Loan)
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
    val autopayDay: Int? = null,        // "Autopay day" — day money is pulled; null falls back to dueDay
    val notes: String = "",
    val rewardBase: Double = 0.0,                       // flat reward % on everything
    val rewardCategories: Map<String, Double> = emptyMap(),  // per-category reward % overrides
    val rotatingPool: List<String>? = null,   // categories that can earn the elevated rotating rate
    val rotatingRate: Double? = null,         // elevated rate those categories earn when active
    val pointValue: Double? = null,           // cents per point/mile (null → 1 = cash back)
    val perks: List<CardPerk> = emptyList(),  // recurring statement credits tracked per cycle
    val annualFee: Double? = null,            // annual fee — powers the "is it worth it?" check
    val feeMonth: Int? = null,                // month (1–12) the fee renews; null if unknown
    val offers: List<CardOffer> = emptyList(), // card-linked offers (manual tracker)
)

/**
 * A card-linked offer (Amex/Chase/BofA deal) the user has activated. FiHaven
 * can't auto-activate (issuer APIs are private); this just keeps the expiry in
 * front of you. `used` is toggled from the Rewards tab. Mirrors web `Card.offers`.
 */
@Serializable
data class CardOffer(
    val id: String = "",
    val merchant: String = "",
    val detail: String = "",
    val expires: String = "",   // "YYYY-MM-DD" or "" for no expiry
    val used: Boolean = false,
)

/**
 * A recurring statement credit on a card (e.g. "$10 Uber Cash" monthly).
 * `frequency` ∈ monthly|quarterly|semiannual|annual. Usage is tracked per
 * cycle in settings.perkUsage. Mirrors the web `Card.perks` shape.
 */
@Serializable
data class CardPerk(
    val id: String = "",
    val label: String = "",
    val amount: Double = 0.0,
    val frequency: String = "monthly",
)

@Serializable
data class Payment(
    // String to match the web's canonical id format (base36 timestamp +
    // random). A Long here fails to decode web-created payments (string ids).
    val id: String = "",
    val type: String = "",              // "bill" | "card"
    val refId: String = "",
    val name: String = "",
    val amount: Double = 0.0,
    val date: String = "",              // ISO date
    val monthKey: String = "",          // "YYYY-MM"
    val note: String = "",
    // A "skip" marker (amount 0): the item owes nothing this month but it
    // isn't a real payment. Excluded from totals and history.
    val skipped: Boolean = false,
)

@Serializable
data class IncomeSource(
    val id: String = "",
    val label: String = "",
    val amount: Double = 0.0,
    val frequency: String = "monthly",
    // For `hourly`: amount is the hourly rate, hoursPerWeek the weekly hours.
    val hoursPerWeek: Double = 0.0,
)

/// A one-off or recurring change to a single period's income (bonus,
/// unpaid time off, raise). `amount` is signed. Mirrors income.js.
@Serializable
data class IncomeAdjustment(
    val id: String = "",
    val label: String = "",
    val amount: Double = 0.0,            // signed: + adds, − subtracts
    val kind: String = "once",           // "once" | "recurring"
    val monthKey: String = "",           // "once" → the single month it applies
    val startMonth: String = "",         // "recurring" → first month (inclusive)
    val endMonth: String = "",           // "recurring" → last month ("" = ongoing)
) {
    /// True if this adjustment affects the period [mk] ("YYYY-MM").
    fun appliesTo(mk: String): Boolean {
        if (mk.isEmpty()) return false
        if (kind == "recurring") {
            if (startMonth.isNotEmpty() && mk < startMonth) return false
            if (endMonth.isNotEmpty() && mk > endMonth) return false
            return true
        }
        return monthKey == mk
    }
}

/// An asset account (what you own) — checking, savings, investments,
/// property, cash. Paired with the debts in `cards` for net worth.
@Serializable
data class Account(
    val id: Int = 0,
    val name: String = "",
    val type: String = "checking", // checking|savings|investment|property|cash|other
    val balance: Double = 0.0,
    val notes: String = "",
)

/// A savings goal: a target, how much is saved, and an optional target
/// date used to suggest a monthly contribution.
@Serializable
data class SavingsGoal(
    val id: Int = 0,
    val name: String = "",
    val target: Double = 0.0,
    val saved: Double = 0.0,
    val targetDate: String = "",   // "YYYY-MM-DD" or ""
    val notes: String = "",
)

/// A spending transaction (manual). `amount` is the spent amount (positive).
@Serializable
data class SpendTransaction(
    val id: String = "",
    val date: String = "",      // "YYYY-MM-DD"
    val amount: Double = 0.0,
    val category: String = "Other",
    val merchant: String = "",
    val note: String = "",
    // Provenance: "manual" (default) or "plaid" (bank-synced helper). Bank rows
    // are additive and preserved on re-encode so a native write keeps the tags.
    val source: String = "manual",
    val plaidId: String? = null,
    val pending: Boolean = false,
) {
    val isBank: Boolean get() = source == "plaid"
}

/// Full per-user blob. `settings` stays a raw JsonObject so unknown
/// (web-only) keys survive a round-trip.
@Serializable
data class AppData(
    val email: String? = null,
    val bills: List<Bill> = emptyList(),
    val cards: List<Card> = emptyList(),
    val payments: List<Payment> = emptyList(),
    val accounts: List<Account> = emptyList(),
    val goals: List<SavingsGoal> = emptyList(),
    val transactions: List<SpendTransaction> = emptyList(),
    val settings: JsonObject = JsonObject(emptyMap()),
    // Present on read only (`GET /api/data`): effective Pro entitlement.
    val entitlement: Entitlement? = null,
) {
    val isEmpty: Boolean get() = bills.isEmpty() && cards.isEmpty() && payments.isEmpty()
}
