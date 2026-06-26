package app.fihaven.ui

import app.fihaven.ui.theme.PlexMono

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.fihaven.AppViewModel
import app.fihaven.core.Money
import app.fihaven.core.logic.SubscriptionsFinder
import app.fihaven.ui.theme.Ct

@Composable
fun SubscriptionsScreen(vm: AppViewModel, padding: PaddingValues, onBack: (() -> Unit)? = null) {
    val data by vm.data.collectAsStateWithLifecycle()
    val zone = vm.zone()
    val subs = SubscriptionsFinder.build(data.bills, data.transactions, zone)

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
                                "Flag a bill as a Subscription, or log transactions — any merchant that recurs across 2+ months shows up here.",
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

@Composable
private fun SubscriptionsCard(subs: List<SubscriptionsFinder.Item>) {
    val uriHandler = LocalUriHandler.current
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
                    Row(verticalAlignment = Alignment.Top, modifier = Modifier.padding(vertical = 5.dp)) {
                        Text(if (s.source == "bill") "📄" else "🔁", fontSize = 15.sp,
                            modifier = Modifier.padding(end = 10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(s.name, color = Ct.colors.text, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            Text(subDetailLine(s), color = subDetailColor(s), fontSize = 11.sp)
                            s.manageUrl?.let { url ->
                                Text(
                                    "Manage / cancel ↗",
                                    color = Ct.colors.accent,
                                    fontSize = 11.sp,
                                    textDecoration = TextDecoration.Underline,
                                    modifier = Modifier.padding(top = 2.dp).clickable { uriHandler.openUri(url) },
                                )
                            }
                        }
                        Text("${Money.fmt(s.monthly)}/mo", color = Ct.colors.text, fontSize = 13.sp, fontFamily = PlexMono)
                    }
                }
            }
        }
    }
}

private fun subDetailLine(s: SubscriptionsFinder.Item): String = when {
    s.duplicate -> "⚡ possible duplicate"
    s.trialSoon && s.trialDaysLeft != null -> "⏳ trial ends in ${s.trialDaysLeft}d"
    s.trialDaysLeft != null && s.trialDaysLeft < 0 -> "Trial ended"
    s.priceUp != null -> "▲ was ${Money.fmt(s.priceUp)}"
    s.stale -> "⚠ unused 60d+"
    s.nextDue != null -> "Next: ${subFriendlyDate(s.nextDue)}"
    s.source == "bill" -> "Tracked bill"
    else -> "Recurring charge"
}

private fun subDetailColor(s: SubscriptionsFinder.Item) = when {
    s.duplicate -> Ct.colors.orange
    s.trialSoon -> Ct.colors.accent
    s.priceUp != null -> Ct.colors.orange
    s.stale -> Ct.colors.red
    else -> Ct.colors.muted
}

private fun subFriendlyDate(d: java.time.LocalDate): String =
    d.month.name.lowercase().replaceFirstChar { it.uppercase() }.take(3) + " ${d.dayOfMonth}"
