package com.danielhipskind.fihaven.ui

import com.danielhipskind.fihaven.ui.theme.PlexMono

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.danielhipskind.fihaven.AppViewModel
import com.danielhipskind.fihaven.core.Money
import com.danielhipskind.fihaven.core.logic.BillSchedule
import com.danielhipskind.fihaven.core.logic.DateLogic
import com.danielhipskind.fihaven.core.model.Bill
import com.danielhipskind.fihaven.core.model.SpendTransaction
import com.danielhipskind.fihaven.ui.theme.Ct

/// Subscription finder (Rocket-Money style): bills flagged as Subscriptions
/// plus merchants recurring across ≥2 months in transactions. Flags price
/// increases and stale (long-unused) subscriptions. Its own Pro tab.
@Composable
fun SubscriptionsScreen(vm: AppViewModel, padding: PaddingValues, onBack: (() -> Unit)? = null) {
    val data by vm.data.collectAsStateWithLifecycle()
    val zone = vm.zone()
    val subs = detectSubscriptions(data.bills, data.transactions, zone)

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        ScreenHeader("Subscriptions", onBack = onBack, branded = true)
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (subs.isEmpty()) {
                item {
                    CtCard(padding = 24) {
                        Column(
                            Modifier.fillMaxWidth(),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text("🔁", fontSize = 40.sp)
                            Text("No subscriptions detected yet", color = Ct.colors.text,
                                fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                            Text(
                                "Flag a bill as a Subscription, or log transactions — any merchant that recurs across 2+ months shows up here, with price-increase and stale-subscription flags.",
                                color = Ct.colors.muted, fontSize = 13.sp, textAlign = TextAlign.Center,
                            )
                        }
                    }
                }
            } else {
                item { SubscriptionsCard(subs) }
            }
        }
    }
}

private data class SubItem(
    val id: String, val name: String, val monthly: Double,
    val source: String, val priceUp: Double?, val stale: Boolean,
    val nextDue: java.time.LocalDate? = null,
)

private fun monthlyOfBill(b: Bill): Double = when (b.frequency) {
    "Weekly" -> b.amount * 52 / 12
    "Bi-weekly" -> b.amount * 26 / 12
    "Quarterly" -> b.amount / 3
    "Annually" -> b.amount / 12
    else -> b.amount
}

private fun detectSubscriptions(
    bills: List<Bill>,
    txs: List<SpendTransaction>,
    zone: java.time.ZoneId,
): List<SubItem> {
    val out = mutableListOf<SubItem>()
    bills.filter { it.category == "Subscriptions" && !DateLogic.billEnded(it, zone) }.forEach { b ->
        out.add(SubItem("bill-${b.id}", b.name.ifBlank { "Subscription" }, monthlyOfBill(b), "bill", null, false,
            BillSchedule.nextDueDate(b, zone)))
    }
    txs.filter { it.merchant.trim().isNotEmpty() }
        .groupBy { it.merchant.trim().lowercase() }
        .forEach { (_, list) ->
            if (list.map { it.date.take(7) }.toSet().size < 2) return@forEach
            val latest = list.sortedBy { it.date }.last()
            val minAmt = list.minOf { it.amount }
            val days = DateLogic.parseDate(latest.date)?.let {
                java.time.temporal.ChronoUnit.DAYS.between(it, DateLogic.today(zone))
            } ?: 0L
            out.add(SubItem("tx-${latest.merchant}", latest.merchant, latest.amount, "tx",
                if (latest.amount > minAmt + 0.005) minAmt else null, days > 60))
        }
    return out.sortedByDescending { it.monthly }
}

@Composable
private fun SubscriptionsCard(subs: List<SubItem>) {
    val total = subs.sumOf { it.monthly }
    CtCard(padding = 14) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("SUBSCRIPTIONS", color = Ct.colors.muted, fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Text("${Money.fmt(total)}/mo · ${subs.size}", color = Ct.colors.muted,
                    fontSize = 12.sp, fontFamily = PlexMono)
            }
            Column(Modifier.padding(top = 6.dp)) {
                subs.forEach { s ->
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 5.dp)) {
                        Text(if (s.source == "bill") "📄" else "🔁", fontSize = 15.sp,
                            modifier = Modifier.padding(end = 10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(s.name, color = Ct.colors.text, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            Text(
                                when {
                                    s.priceUp != null -> "▲ was ${Money.fmt(s.priceUp)}"
                                    s.stale -> "⚠ unused 60d+"
                                    s.nextDue != null -> "Next: ${subFriendlyDate(s.nextDue)}"
                                    s.source == "bill" -> "Tracked bill"
                                    else -> "Recurring charge"
                                },
                                color = when {
                                    s.priceUp != null -> Ct.colors.orange
                                    s.stale -> Ct.colors.red
                                    else -> Ct.colors.muted
                                },
                                fontSize = 11.sp,
                            )
                        }
                        Text("${Money.fmt(s.monthly)}/mo", color = Ct.colors.text, fontSize = 13.sp, fontFamily = PlexMono)
                    }
                }
            }
        }
    }
}

private fun subFriendlyDate(d: java.time.LocalDate): String {
    val fmt = if (d.year == java.time.LocalDate.now().year) "MMM d" else "MMM d, yyyy"
    return d.format(java.time.format.DateTimeFormatter.ofPattern(fmt, java.util.Locale.US))
}
