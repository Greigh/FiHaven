package app.fihaven.core.model

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

/// Budget-period mode: "calendar" | "startDay" | "rolling" (see Period).
val JsonObject.periodMode: String? get() = prim("periodMode")?.contentOrNull
/// Day-of-month a "startDay" period begins on (1–28).
val JsonObject.periodStartDay: Int? get() = prim("periodStartDay")?.doubleOrNull?.toInt()
/// Length in days of a "rolling" period (7–90).
val JsonObject.periodLength: Int? get() = prim("periodLength")?.doubleOrNull?.toInt()
/// Optional "YYYY-MM-DD" date a "rolling" period's buckets begin on
/// (empty/absent falls back to the stable epoch).
val JsonObject.periodAnchor: String?
    get() = prim("periodAnchor")?.contentOrNull?.takeIf { Regex("""^\d{4}-\d{2}-\d{2}$""").matches(it) }

/// ISO 4217 display currency (e.g. "USD"). Drives Money formatting.
val JsonObject.currency: String? get() = prim("currency")?.contentOrNull

/// Which view the app opens to ("dashboard" | "bills" | "cards" | …).
val JsonObject.landingView: String? get() = prim("landingView")?.contentOrNull

/// Ordered tab ids shown in the bottom bar; tabs not listed live under
/// "More". null = the app's default layout. Synced across devices.
val JsonObject.tabBar: List<String>?
    get() = (this["tabs"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }

/// Opt-in email reminders / monthly summary (server scheduler).
val JsonObject.billReminders: Boolean get() = prim("billReminders")?.booleanOrNull ?: false
val JsonObject.monthlySummary: Boolean get() = prim("monthlySummary")?.booleanOrNull ?: false

/// Days before a bill's due date to remind (0–14, default 3). Drives both the
/// server email scheduler and on-device local notifications.
val JsonObject.reminderLeadDays: Int
    get() = (prim("reminderLeadDays")?.doubleOrNull?.toInt() ?: 3).coerceIn(0, 14)
/// Local hour (0–23, default 8) reminders/digest/summary are sent.
val JsonObject.notifyHour: Int
    get() = (prim("notifyHour")?.doubleOrNull?.toInt() ?: 8).coerceIn(0, 23)
/// Opt-in: also remind on the day a bill is actually due.
val JsonObject.remindOnDueDay: Boolean get() = prim("remindOnDueDay")?.booleanOrNull ?: false
/// Opt-in: weekly digest email (Monday) of upcoming bills + balances.
val JsonObject.weeklyDigest: Boolean get() = prim("weeklyDigest")?.booleanOrNull ?: false
/// Opt-in: schedule bill reminders as on-device local notifications. Synced so
/// the preference follows the user, but scheduling is per-device.
val JsonObject.localNotifications: Boolean get() = prim("localNotifications")?.booleanOrNull ?: false
/// Opt-in (Pro): remind before an activated card-linked offer expires.
val JsonObject.offerReminders: Boolean get() = prim("offerReminders")?.booleanOrNull ?: false
/// Opt-in: let a synced bank balance update a matching card. Off by default —
/// FiHaven never overrides a typed balance unless this is on.
val JsonObject.plaidUpdateBalances: Boolean get() = prim("plaidUpdateBalances")?.booleanOrNull ?: false

/** When true (default), fully paid items are hidden from the dashboard upcoming list. */
val JsonObject.hidePaidOnDashboard: Boolean get() = prim("hidePaidOnDashboard")?.booleanOrNull ?: true

/** Dashboard layout: "classic" (fixed) or "widgets" (customizable order). */
val JsonObject.dashboardLayout: String get() = prim("dashboardLayout")?.contentOrNull ?: "classic"

/** Budget rule lens: "off" | "50-30-20" | "custom". */
val JsonObject.budgetRule: String get() = prim("budgetRule")?.contentOrNull ?: "off"

data class BudgetRuleSplits(val needs: Int, val wants: Int, val save: Int)

/** Custom needs/wants/save percentages (normalized in BudgetRules.splits). */
val JsonObject.budgetRuleSplits: BudgetRuleSplits
    get() {
        val o = this["budgetRuleSplits"] as? JsonObject ?: return BudgetRuleSplits(50, 30, 20)
        fun pct(k: String, d: Int) = ((o[k] as? JsonPrimitive)?.doubleOrNull?.toInt() ?: d).coerceIn(0, 100)
        return BudgetRuleSplits(pct("needs", 50), pct("wants", 30), pct("save", 20))
    }

/** Planned extra monthly debt payment (debt-focus lens). */
val JsonObject.debtFocusExtra: Double
    get() = (prim("debtFocusExtra")?.doubleOrNull ?: 0.0).coerceAtLeast(0.0)

/** Ordered enabled dashboard widget ids (Widgets mode). Empty = default set. */
val JsonObject.dashboardWidgets: List<String>
    get() = (this["dashboardWidgets"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull } ?: emptyList()

/// Opt-in: auto-mark autopay bills/cards paid on their due date, and the
/// local hour (0–23) the server runs it.
val JsonObject.autopayMark: Boolean get() = prim("autopayMark")?.booleanOrNull ?: false
val JsonObject.autopayMarkHour: Int get() = prim("autopayMarkHour")?.doubleOrNull?.toInt() ?: 9

/// Per-calendar-month memory of which items autopay has already marked
/// ("YYYY-MM" → ["bill:1", "card:2"]). Membership (not a payment amount)
/// gates a second mark, so an undo sticks and $0 items behave. Shared with
/// autopay.js and the server scheduler.
val JsonObject.autopayDone: Map<String, List<String>>
    get() {
        val o = this["autopayDone"] as? JsonObject ?: return emptyMap()
        return o.mapNotNull { (k, v) ->
            (v as? JsonArray)?.let { arr -> k to arr.mapNotNull { (it as? JsonPrimitive)?.contentOrNull } }
        }.toMap()
    }

fun JsonObject.withAutopayDone(done: Map<String, List<String>>): JsonObject = buildJsonObject {
    this@withAutopayDone.forEach { (k, v) -> if (k != "autopayDone") put(k, v) }
    put("autopayDone", buildJsonObject {
        done.forEach { (k, list) -> put(k, buildJsonArray { list.forEach { add(it) } }) }
    })
}

/**
 * Per-cycle card-perk usage: "<cardId>:<perkId>:<cycleKey>" → dollars used
 * this cycle. Shared with perks.js and Perks.swift/Perks.kt.
 */
val JsonObject.perkUsage: Map<String, Double>
    get() {
        val o = this["perkUsage"] as? JsonObject ?: return emptyMap()
        return o.mapNotNull { (k, v) -> (v as? JsonPrimitive)?.doubleOrNull?.let { k to it } }.toMap()
    }

fun JsonObject.withPerkUsage(usage: Map<String, Double>): JsonObject = buildJsonObject {
    this@withPerkUsage.forEach { (k, v) -> if (k != "perkUsage") put(k, v) }
    put("perkUsage", buildJsonObject { usage.forEach { (k, v) -> put(k, v) } })
}

/// Spending categories used for transactions + budgets.
val SPENDING_CATEGORIES = listOf(
    "Groceries", "Dining", "Shopping", "Transport", "Entertainment", "Health", "Bills", "Other",
)

/// Per-category monthly spending budgets (category → amount).
val JsonObject.categoryBudgets: Map<String, Double>
    get() {
        val o = this["categoryBudgets"] as? JsonObject ?: return emptyMap()
        return o.mapNotNull { (k, v) -> (v as? JsonPrimitive)?.doubleOrNull?.let { k to it } }.toMap()
    }

fun JsonObject.withCategoryBudget(category: String, amount: Double): JsonObject = buildJsonObject {
    this@withCategoryBudget.forEach { (k, v) -> if (k != "categoryBudgets") put(k, v) }
    val existing = this@withCategoryBudget.categoryBudgets.toMutableMap()
    if (amount > 0) existing[category] = amount else existing.remove(category)
    put("categoryBudgets", buildJsonObject { existing.forEach { (k, v) -> put(k, v) } })
}

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
                    hoursPerWeek = o.prim("hoursPerWeek")?.doubleOrNull ?: 0.0,
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
                if (src.frequency == "hourly") put("hoursPerWeek", src.hoursPerWeek)
            })
        }
    })
}

/// One-off / recurring per-period income adjustments.
val JsonObject.incomeAdjustments: List<IncomeAdjustment>
    get() {
        val arr = this["incomeAdjustments"] as? JsonArray ?: return emptyList()
        return arr.mapNotNull { el ->
            (el as? JsonObject)?.let { o ->
                IncomeAdjustment(
                    id = o.prim("id")?.contentOrNull ?: "",
                    label = o.prim("label")?.contentOrNull ?: "",
                    amount = o.prim("amount")?.doubleOrNull ?: 0.0,
                    kind = if (o.prim("kind")?.contentOrNull == "recurring") "recurring" else "once",
                    monthKey = o.prim("monthKey")?.contentOrNull ?: "",
                    startMonth = o.prim("startMonth")?.contentOrNull ?: "",
                    endMonth = o.prim("endMonth")?.contentOrNull ?: "",
                )
            }
        }
    }

/// Return a copy with the income-adjustments list replaced.
fun JsonObject.withIncomeAdjustments(list: List<IncomeAdjustment>): JsonObject = buildJsonObject {
    this@withIncomeAdjustments.forEach { (k, v) -> if (k != "incomeAdjustments") put(k, v) }
    put("incomeAdjustments", buildJsonArray {
        list.forEach { adj ->
            add(buildJsonObject {
                put("id", adj.id)
                put("label", adj.label)
                put("amount", adj.amount)
                put("kind", adj.kind)
                put("monthKey", adj.monthKey)
                put("startMonth", adj.startMonth)
                put("endMonth", adj.endMonth)
            })
        }
    })
}
