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
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.danielhipskind.fihaven.core.model.landingView
import com.danielhipskind.fihaven.AppViewModel
import com.danielhipskind.fihaven.billing.BillingManager
import com.danielhipskind.fihaven.core.Money
import androidx.compose.foundation.clickable
import com.danielhipskind.fihaven.core.logic.DateLogic
import com.danielhipskind.fihaven.core.logic.Income
import com.danielhipskind.fihaven.core.logic.PaidState
import com.danielhipskind.fihaven.core.logic.Schedule
import com.danielhipskind.fihaven.core.logic.UpcomingItem
import com.danielhipskind.fihaven.core.model.timezoneSetting
import com.danielhipskind.fihaven.core.net.User
import com.danielhipskind.fihaven.ui.theme.Ct
import java.time.format.DateTimeFormatter
import java.util.Locale

private enum class Tab(val label: String, val icon: ImageVector) {
    HOME("Home", Icons.Filled.Home),
    BILLS("Bills", Icons.AutoMirrored.Filled.ReceiptLong),
    CARDS("Cards", Icons.Filled.CreditCard),
    PAYOFF("Payoff", Icons.AutoMirrored.Filled.ShowChart),
    MORE("More", Icons.Filled.MoreHoriz),
}

@Composable
fun MainScaffold(vm: AppViewModel, user: User, initialTab: String? = null, initialRoute: String? = null) {
    var tab by remember { mutableStateOf(tabFor(initialTab)) }

    // Open to the user's saved default view, once the data has loaded.
    val scaffoldData by vm.data.collectAsStateWithLifecycle()
    var appliedLanding by remember { mutableStateOf(false) }
    LaunchedEffect(scaffoldData.settings.landingView) {
        if (!appliedLanding && initialTab == null && scaffoldData.settings.landingView != null) {
            appliedLanding = true
            tab = tabFor(scaffoldData.settings.landingView)
        }
    }

    // Play Billing client, scoped to the signed-in session. Provided to
    // the subtree so the paywall can list products / launch purchases.
    val appContext = LocalContext.current.applicationContext
    val billing = remember {
        BillingManager(appContext) { productId, token -> vm.verifyGooglePurchase(productId, token) }
    }
    DisposableEffect(Unit) {
        billing.connect()
        onDispose { billing.endConnection() }
    }

    CompositionLocalProvider(LocalBilling provides billing) {
        Scaffold(
            containerColor = Ct.colors.bg,
            bottomBar = {
                NavigationBar(containerColor = Ct.colors.surface) {
                    Tab.entries.forEach { t ->
                        NavigationBarItem(
                            selected = tab == t,
                            onClick = { tab = t },
                            icon = { Icon(t.icon, contentDescription = t.label) },
                            label = { Text(t.label) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = Ct.colors.accent,
                                selectedTextColor = Ct.colors.accent,
                                indicatorColor = Ct.colors.accentBg,
                                unselectedIconColor = Ct.colors.muted,
                                unselectedTextColor = Ct.colors.muted,
                            ),
                        )
                    }
                }
            },
        ) { padding ->
            when (tab) {
                Tab.HOME -> DashboardScreen(vm, padding)
                Tab.BILLS -> BillsScreen(vm, padding)
                Tab.CARDS -> CardsScreen(vm, padding)
                Tab.PAYOFF -> ProGate(vm, ProFeature.PAYOFF, padding) { PayoffScreen(vm, padding) }
                Tab.MORE -> MoreScreen(vm, user, padding, initialRoute)
            }
        }
    }
}

private fun tabFor(name: String?): Tab = when (name) {
    "bills" -> Tab.BILLS
    "cards" -> Tab.CARDS
    "payoff" -> Tab.PAYOFF
    "more" -> Tab.MORE
    else -> Tab.HOME
}

@Composable
private fun DashboardScreen(vm: AppViewModel, padding: PaddingValues) {
    val data by vm.data.collectAsStateWithLifecycle()
    val zone = DateLogic.zone(data.settings.timezoneSetting)
    val monthKey = DateLogic.currentMonthKey(zone)
    val income = Income.monthlyIncome(data.settings)
    val upcoming = Schedule.buildUpcomingItems(data.bills, data.cards, zone)
    // "Left to pay" = sum of each item's remaining-to-goal, so partial
    // payments shrink it and fully-paid items drop to zero.
    val remaining = upcoming.sumOf { vm.remainingFor(it) }
    var paying by remember { mutableStateOf<UpcomingItem?>(null) }

    LazyColumn(
        Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Text(DateLogic.monthKeyLabel(monthKey), color = Ct.colors.text,
                fontSize = 28.sp, fontWeight = FontWeight.ExtraBold)
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard("Monthly income", Money.fmt(income), Ct.colors.green, Modifier.weight(1f))
                StatCard("Left to pay", Money.fmt(remaining), Ct.colors.accent, Modifier.weight(1f))
            }
        }
        item {
            Text("UPCOMING", color = Ct.colors.muted, fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold, letterSpacing = 0.5.sp)
        }
        if (upcoming.isEmpty()) {
            item { CtCard { Text("Nothing scheduled — add a bill or card.", color = Ct.colors.muted) } }
        } else {
            items(upcoming, key = { "${it.type}-${it.refId}" }) { item ->
                UpcomingRow(
                    item = item,
                    state = vm.paidState(item),
                    paidSoFar = vm.paidAmountFor(item),
                    goal = vm.goalAmount(item),
                    remaining = vm.remainingFor(item),
                    onPay = { paying = item },
                )
            }
        }
    }

    paying?.let { PayDialog(vm, it.type, it.refId, it.name) { paying = null } }
}

@Composable
private fun StatCard(label: String, value: String, color: androidx.compose.ui.graphics.Color, modifier: Modifier) {
    CtCard(modifier) {
        Column {
            FieldLabel(label)
            Text(value, color = color, fontSize = 22.sp,
                fontWeight = FontWeight.SemiBold, fontFamily = PlexMono)
        }
    }
}

@Composable
private fun UpcomingRow(
    item: UpcomingItem,
    state: PaidState,
    paidSoFar: Double,
    goal: Double,
    remaining: Double,
    onPay: () -> Unit,
) {
    val c = Ct.colors
    val dueTint = when {
        state == PaidState.FULL -> c.green
        state == PaidState.PARTIAL -> c.orange
        item.days < 0 -> c.red
        item.days <= 3 -> c.orange
        else -> c.muted
    }
    val label = when (state) {
        PaidState.FULL -> "Paid this month"
        PaidState.PARTIAL -> "Paid ${Money.fmt(paidSoFar)} of ${Money.fmt(goal)}"
        PaidState.UNPAID -> dueLabel(item, false)
    }
    CtCard(padding = 14) {
        Row(Modifier.clickable(onClick = onPay), verticalAlignment = Alignment.CenterVertically) {
            Text(item.icon, fontSize = 22.sp, modifier = Modifier.padding(end = 12.dp))
            Column(Modifier.weight(1f)) {
                Text(item.name, color = c.text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                Text(label, color = dueTint, fontSize = 12.sp)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(Money.fmt(if (state == PaidState.FULL) goal else remaining), color = Ct.colors.text,
                    fontSize = 15.sp, fontWeight = FontWeight.Medium, fontFamily = PlexMono)
                if (item.autopay) Text("autopay", color = Ct.colors.muted, fontSize = 9.sp, fontFamily = PlexMono)
            }
        }
    }
}

private val shortDate = DateTimeFormatter.ofPattern("MMM d", Locale.US)

private fun dueLabel(item: UpcomingItem, paid: Boolean): String {
    if (paid) return "Paid this month"
    val base = when {
        item.days < 0 -> "Overdue"
        item.days == 0 -> "Due today"
        item.days == 1 -> "Due tomorrow"
        else -> "Due in ${item.days} days"
    }
    return item.nextDue?.let { "$base · ${shortDate.format(it)}" } ?: base
}
