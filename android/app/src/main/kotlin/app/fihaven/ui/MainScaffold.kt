package app.fihaven.ui

import app.fihaven.ui.theme.PlexMono

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Autorenew
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Stars
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import app.fihaven.core.model.landingView
import app.fihaven.core.model.tabBar
import app.fihaven.AppViewModel
import app.fihaven.billing.BillingManager
import app.fihaven.core.Money
import app.fihaven.core.logic.DateLogic
import app.fihaven.core.logic.Period
import app.fihaven.core.logic.Income
import app.fihaven.core.logic.PaidState
import app.fihaven.core.logic.Schedule
import app.fihaven.core.logic.UpcomingItem
import app.fihaven.core.model.timezoneSetting
import app.fihaven.core.net.User
import app.fihaven.ui.theme.Ct
import java.time.format.DateTimeFormatter
import java.util.Locale

/// The customizable app tabs (everything except the fixed "More" overflow
/// and the Free-only "Get Pro" slot). Declaration order is the default order.
enum class TabId(val id: String, val label: String, val icon: ImageVector) {
    DASHBOARD("dashboard", "Home", Icons.Filled.Home),
    BILLS("bills", "Bills", Icons.AutoMirrored.Filled.ReceiptLong),
    CARDS("cards", "Cards", Icons.Filled.CreditCard),
    LOANS("loans", "Loans", Icons.Filled.AccountBalance),
    PAYOFF("payoff", "Payoff", Icons.AutoMirrored.Filled.ShowChart),
    REWARDS("rewards", "Rewards", Icons.Filled.Stars),
    BUDGET("budget", "Budget", Icons.Filled.PieChart),
    SPENDING("spending", "Spending", Icons.Filled.Payments),
    SUBSCRIPTIONS("subscriptions", "Subscriptions", Icons.Filled.Autorenew),
    CALENDAR("calendar", "Calendar", Icons.Filled.CalendarMonth),
    HISTORY("history", "History", Icons.Filled.History),
    ;
    companion object { fun from(id: String?): TabId? = entries.find { it.id == id } }
}

private val defaultBottomTabs = listOf(TabId.DASHBOARD, TabId.BILLS, TabId.CARDS, TabId.PAYOFF)
const val MAX_BOTTOM_TABS = 4

/// Resolve the saved tab order into (bottom-bar, overflow) lists. Unknown
/// ids are dropped; tabs not listed fall into overflow in catalog order.
fun resolveTabs(saved: List<String>?): Pair<List<TabId>, List<TabId>> {
    val savedItems = saved?.mapNotNull { TabId.from(it) } ?: defaultBottomTabs
    val bottom = savedItems.distinct()
    val overflow = TabId.entries.filter { it !in bottom }
    return bottom to overflow
}

@Composable
fun MainScaffold(vm: AppViewModel, user: User, initialTab: String? = null, initialRoute: String? = null) {
    val scaffoldData by vm.data.collectAsStateWithLifecycle()
    val ent by vm.entitlement.collectAsStateWithLifecycle()
    val isPro = ent.pro

    val (bottomAll, overflowAll) = resolveTabs(scaffoldData.settings.tabBar)
    // Free users give up one bottom slot to the always-present Get Pro tab.
    val bottomCount = if (isPro) MAX_BOTTOM_TABS else MAX_BOTTOM_TABS - 1
    val shownBottom = bottomAll.take(bottomCount)
    val moreItems = bottomAll.drop(bottomCount) + overflowAll

    var selected by remember { mutableStateOf(initialTab ?: shownBottom.firstOrNull()?.id ?: "dashboard") }

    // Open to the user's saved default view, once the data has loaded.
    var appliedLanding by remember { mutableStateOf(false) }
    LaunchedEffect(scaffoldData.settings.landingView) {
        val lv = scaffoldData.settings.landingView
        if (!appliedLanding && initialTab == null && lv != null) {
            appliedLanding = true
            val item = TabId.from(lv)
            selected = if (item != null && shownBottom.contains(item)) item.id else "more"
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
                    shownBottom.forEach { t ->
                        NavBarItem(selected == t.id, t.label, t.icon) { selected = t.id }
                    }
                    if (!isPro) {
                        NavBarItem(selected == "getpro", "Get Pro", Icons.Filled.WorkspacePremium) { selected = "getpro" }
                    }
                    NavBarItem(selected == "more", "More", Icons.Filled.MoreHoriz) { selected = "more" }
                }
            },
        ) { padding ->
            when (val sel = selected) {
                "getpro" -> ProScreen(vm, padding)
                "more" -> MoreScreen(vm, user, padding, initialRoute, moreItems)
                else -> {
                    val tab = TabId.from(sel)
                    if (tab != null) TabContent(tab, vm, padding)
                    else MoreScreen(vm, user, padding, initialRoute, moreItems)
                }
            }
        }
    }
}

@Composable
private fun RowScope.NavBarItem(selected: Boolean, label: String, icon: ImageVector, onClick: () -> Unit) {
    NavigationBarItem(
        selected = selected,
        onClick = onClick,
        icon = { Icon(icon, contentDescription = label) },
        label = { Text(label) },
        colors = NavigationBarItemDefaults.colors(
            selectedIconColor = Ct.colors.accent,
            selectedTextColor = Ct.colors.accent,
            indicatorColor = Ct.colors.accentBg,
            unselectedIconColor = Ct.colors.muted,
            unselectedTextColor = Ct.colors.muted,
        ),
    )
}

/// Render a tab's content. `onBack` is supplied when shown from "More"
/// (overflow) so the back-aware screens show an arrow; the primary screens
/// without one rely on the caller's BackHandler.
@Composable
internal fun TabContent(tab: TabId, vm: AppViewModel, padding: PaddingValues, onBack: (() -> Unit)? = null) {
    when (tab) {
        TabId.DASHBOARD -> DashboardScreen(vm, padding)
        TabId.BILLS -> BillsScreen(vm, padding)
        TabId.CARDS -> CardsScreen(vm, padding)
        TabId.LOANS -> CardsScreen(vm, padding, kind = "loan")
        TabId.PAYOFF -> ProGate(vm, ProFeature.PAYOFF, padding, onBack) { PayoffScreen(vm, padding) }
        TabId.REWARDS -> ProGate(vm, ProFeature.REWARDS, padding, onBack) { RewardsScreen(vm, padding) }
        TabId.BUDGET -> BudgetScreen(vm, padding, onBack)
        TabId.SPENDING -> SpendingScreen(vm, padding, onBack)
        TabId.SUBSCRIPTIONS -> ProGate(vm, ProFeature.SUBSCRIPTIONS, padding, onBack) { SubscriptionsScreen(vm, padding, onBack) }
        TabId.CALENDAR -> ProGate(vm, ProFeature.CALENDAR, padding, onBack) { CalendarScreen(vm, padding, onBack) }
        TabId.HISTORY -> ProGate(vm, ProFeature.HISTORY, padding, onBack) { HistoryScreen(vm, padding, onBack) }
    }
}

@Composable
private fun DashboardScreen(vm: AppViewModel, padding: PaddingValues) {
    val data by vm.data.collectAsStateWithLifecycle()
    val zone = DateLogic.zone(data.settings.timezoneSetting)
    val periodBounds = vm.currentBounds()
    val periodLabel = Period.label(periodBounds, vm.periodConfig())
    val cfg = vm.periodConfig()
    val income = Income.periodIncome(data.settings, periodBounds)
    val upcoming = Schedule.buildUpcomingItems(data.bills, data.cards, zone)
    val obligations = vm.periodObligationItems(upcoming)
    val visible = vm.dashboardUpcoming(upcoming)
    // "Left to pay" = sum of each obligation's remaining-to-goal, so partial
    // payments shrink it and fully-paid items drop to zero.
    val remaining = obligations.sumOf { vm.remainingFor(it) }
    var paying by remember { mutableStateOf<UpcomingItem?>(null) }
    // A pending "skip a card you still owe on" confirmation.
    var skipConfirm by remember { mutableStateOf<Pair<UpcomingItem, String>?>(null) }

    // Skip an upcoming item — but for a card you still owe on, confirm first.
    val requestSkip: (UpcomingItem) -> Unit = { item ->
        val warning = if (item.type == "card") vm.cardSkipWarning(item.refId, item.name) else null
        if (warning != null) skipConfirm = item to warning
        else vm.skipMonth(item.type, item.refId, item.name)
    }

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        // Branded top bar (FiHaven mark + period label), matching iOS and the
        // other Android screens.
        ScreenHeader(periodLabel, branded = true)
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatCard(Income.incomeLabel(cfg), Money.fmt(income), Ct.colors.green, Modifier.weight(1f))
                    StatCard(Income.owedLabel(cfg), Money.fmt(remaining), Ct.colors.accent, Modifier.weight(1f))
                }
            }
            item {
                Text("UPCOMING", color = Ct.colors.muted, fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold, letterSpacing = 0.5.sp)
            }
            if (visible.isEmpty()) {
                item { CtCard { Text("Nothing scheduled — add a bill or card.", color = Ct.colors.muted) } }
            } else {
                // One card holding all rows, divided — mirrors iOS's
                // .ctCard(padding: 0) { VStack with Divider() }.
                item {
                    CtCard(padding = 0) {
                        Column {
                            visible.forEachIndexed { i, item ->
                                if (i > 0) HorizontalDivider(color = Ct.colors.border, thickness = 1.dp)
                                UpcomingRow(
                                    item = item,
                                    state = vm.paidState(item),
                                    paidSoFar = vm.paidAmountFor(item),
                                    goal = vm.goalAmount(item),
                                    remaining = vm.remainingFor(item),
                                    skipped = vm.isSkipped(item),
                                    onPay = { paying = item },
                                    onSkip = { requestSkip(item) },
                                    onUnskip = { vm.unskip(item.type, item.refId) },
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    paying?.let { PayDialog(vm, it.type, it.refId, it.name) { paying = null } }

    skipConfirm?.let { (item, warning) ->
        AlertDialog(
            onDismissRequest = { skipConfirm = null },
            title = { Text("Skip this month?") },
            text = { Text(warning) },
            confirmButton = {
                TextButton(onClick = {
                    vm.skipMonth(item.type, item.refId, item.name)
                    skipConfirm = null
                }) { Text("Skip anyway", color = Ct.colors.red) }
            },
            dismissButton = {
                TextButton(onClick = { skipConfirm = null }) { Text("Cancel") }
            },
            containerColor = Ct.colors.surface,
        )
    }
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

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun UpcomingRow(
    item: UpcomingItem,
    state: PaidState,
    paidSoFar: Double,
    goal: Double,
    remaining: Double,
    skipped: Boolean,
    onPay: () -> Unit,
    onSkip: () -> Unit,
    onUnskip: () -> Unit,
) {
    val c = Ct.colors
    var menuOpen by remember { mutableStateOf(false) }
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
    // No own card — the dashboard wraps the whole list in one CtCard with
    // dividers (iOS parity). Internal padding matches iOS's row insets.
    Row(
        Modifier.fillMaxWidth()
            .combinedClickable(onClick = onPay, onLongClick = { menuOpen = true })
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
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
        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            DropdownMenuItem(text = { Text("Pay") }, onClick = { menuOpen = false; onPay() })
            if (skipped) {
                DropdownMenuItem(text = { Text("Un-skip month") }, onClick = { menuOpen = false; onUnskip() })
            } else {
                DropdownMenuItem(text = { Text("Skip this month") }, onClick = { menuOpen = false; onSkip() })
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
