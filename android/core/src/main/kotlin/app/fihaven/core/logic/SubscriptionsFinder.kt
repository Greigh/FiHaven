package app.fihaven.core.logic

import app.fihaven.core.model.Bill
import app.fihaven.core.model.SpendTransaction
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/// Subscription finder logic — port of subscriptionsFinder.js + subscriptionLinks.js.
object SubscriptionsFinder {
    const val STALE_DAYS = 60L
    const val TRIAL_REMINDER_DAYS = 3L
    const val AMOUNT_SIMILARITY = 0.15

    data class Item(
        val id: String,
        val billId: String?,
        val merchantKey: String,
        val name: String,
        val monthly: Double,
        val amount: Double,
        val source: String,
        val lastDate: String?,
        val priceUp: Double?,
        val stale: Boolean,
        val nextDue: LocalDate?,
        val manageUrl: String?,
        val trialEnds: String?,
        val trialDaysLeft: Long?,
        val trialSoon: Boolean,
        val duplicate: Boolean,
    )

    fun monthlyOfBill(b: Bill): Double = when (b.frequency) {
        "Weekly" -> b.amount * 52 / 12
        "Bi-weekly" -> b.amount * 26 / 12
        "Quarterly" -> b.amount / 3
        "Annually" -> b.amount / 12
        else -> b.amount
    }

    /** True when amounts are within [AMOUNT_SIMILARITY] of each other (relative to max). */
    fun amountsSimilar(amts: List<Double>): Boolean {
        if (amts.size < 2) return true
        val min = amts.minOf { kotlin.math.abs(it) }
        val max = amts.maxOf { kotlin.math.abs(it) }
        if (max < 0.005) return true
        return (max - min) / max <= AMOUNT_SIMILARITY
    }

    fun build(
        bills: List<Bill>,
        transactions: List<SpendTransaction>,
        zone: ZoneId,
        declined: List<String> = emptyList(),
    ): List<Item> {
        val declinedSet = declined.map { it.lowercase() }.filter { it.isNotBlank() }.toSet()
        val trackedKeys = mutableSetOf<String>()
        val out = mutableListOf<Item>()

        bills.filter { it.category == "Subscriptions" && !it.archived && !DateLogic.billEnded(it, zone) }
            .forEach { b ->
                val trial = b.trialEnds
                val left = trialDaysLeft(trial, zone)
                val name = b.name.ifBlank { "Subscription" }
                val mk = SubscriptionLinks.normalizeKey(name)
                if (mk.isNotBlank()) trackedKeys += mk
                out += Item(
                    id = "bill-${b.id}",
                    billId = b.id,
                    merchantKey = mk,
                    name = name,
                    monthly = monthlyOfBill(b),
                    amount = b.amount,
                    source = "bill",
                    lastDate = null,
                    priceUp = null,
                    stale = false,
                    nextDue = BillSchedule.nextDueDate(b, zone),
                    manageUrl = SubscriptionLinks.manageUrl(b),
                    trialEnds = trial,
                    trialDaysLeft = left,
                    trialSoon = left != null && left in 0..TRIAL_REMINDER_DAYS,
                    duplicate = false,
                )
            }

        transactions.filter { it.merchant.trim().isNotEmpty() }
            .groupBy { it.merchant.trim().lowercase() }
            .forEach { (_, list) ->
                val months = list.map { it.date.take(7) }.toSet()
                if (months.size < 2 || list.size < 2) return@forEach
                if (months.size < 3 && !amountsSimilar(list.map { it.amount })) return@forEach

                val sorted = list.sortedBy { it.date }
                val latest = sorted.last()
                val minAmt = list.minOf { it.amount }
                val days = DateLogic.parseDate(latest.date)?.let {
                    ChronoUnit.DAYS.between(it, DateLogic.today(zone))
                } ?: 0L
                val mk = SubscriptionLinks.normalizeKey(latest.merchant)
                if (mk.isNotBlank() && (declinedSet.contains(mk) || trackedKeys.contains(mk))) return@forEach

                out += Item(
                    id = "tx-${latest.merchant}",
                    billId = null,
                    merchantKey = mk,
                    name = latest.merchant,
                    monthly = latest.amount,
                    amount = latest.amount,
                    source = "tx",
                    lastDate = latest.date,
                    priceUp = if (latest.amount > minAmt + 0.005) minAmt else null,
                    stale = days > STALE_DAYS,
                    nextDue = null,
                    manageUrl = SubscriptionLinks.manageUrl(Bill(name = latest.merchant, business = latest.merchant)),
                    trialEnds = null,
                    trialDaysLeft = null,
                    trialSoon = false,
                    duplicate = false,
                )
            }

        val dupes = duplicateKeys(out)
        return out.map { it.copy(duplicate = dupes.contains(it.id)) }.sortedByDescending { it.monthly }
    }

    private fun duplicateKeys(items: List<Item>): Set<String> {
        val byKey = items.groupBy { SubscriptionLinks.normalizeKey(it.name) }
        return byKey.filter { it.key.isNotBlank() && it.value.size > 1 }
            .flatMap { it.value.map { i -> i.id } }
            .toSet()
    }

    private fun trialDaysLeft(trialEnds: String?, zone: ZoneId): Long? {
        if (trialEnds.isNullOrBlank() || !trialEnds.matches(Regex("""^\d{4}-\d{2}-\d{2}$"""))) return null
        val end = DateLogic.parseDate(trialEnds) ?: return null
        val today = DateLogic.today(zone)
        return ChronoUnit.DAYS.between(today, end)
    }
}

object SubscriptionLinks {
    private val urls = mapOf(
        "netflix" to "https://www.netflix.com/cancelplan",
        "spotify" to "https://www.spotify.com/account/subscription/",
        "hulu" to "https://secure.hulu.com/account",
        "disneyplus" to "https://www.disneyplus.com/account",
        "max" to "https://www.max.com/account",
        "amazon" to "https://www.amazon.com/gp/mprimecentral",
        "prime" to "https://www.amazon.com/gp/mprimecentral",
        "youtube" to "https://www.youtube.com/paid_memberships",
        "adobe" to "https://account.adobe.com/plans",
    )

    fun normalizeKey(name: String): String =
        name.lowercase().replace(Regex("[^a-z0-9]+"), "")

    fun manageUrl(bill: Bill): String? {
        extractUrl(bill.notes)?.let { return it }
        listOf(bill.business, bill.name).mapNotNull { it?.trim() }.filter { it.isNotEmpty() }.forEach { n ->
            val key = normalizeKey(n)
            urls[key]?.let { return it }
            urls.keys.firstOrNull { key.contains(it) || it.contains(key) }?.let { return urls[it] }
        }
        return null
    }

    private fun extractUrl(notes: String): String? {
        val m = Regex("""https?://[^\s]+""").find(notes) ?: return null
        return m.value.trimEnd(',', '.', ')')
    }
}
