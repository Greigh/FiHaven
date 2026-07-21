package app.fihaven.ui

import app.fihaven.ui.theme.PlexMono

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
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
import androidx.compose.material.icons.filled.AccountBalanceWallet
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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.runtime.mutableStateMapOf
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
import androidx.compose.runtime.mutableIntStateOf
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
import app.fihaven.core.model.Bill
import app.fihaven.core.model.Card
import app.fihaven.core.model.dashboardLayout
import app.fihaven.core.model.dashboardWidgets
import app.fihaven.core.model.landingView
import app.fihaven.core.model.tabBar
import app.fihaven.AppViewModel
import app.fihaven.SyncState
import app.fihaven.billing.BillingManager
import androidx.compose.foundation.clickable
import app.fihaven.core.Money
import app.fihaven.core.logic.BillSchedule
import app.fihaven.core.logic.BudgetRules
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
    // Short nav labels — Material bottom bars with 4–5 slots wrap long words
    // awkwardly ("Subscriptio / ns"). Full names stay in contentDescription.
    SUBSCRIPTIONS("subscriptions", "Subs", Icons.Filled.Autorenew),
    CALENDAR("calendar", "Calendar", Icons.Filled.CalendarMonth),
    HISTORY("history", "History", Icons.Filled.History),
    NETWORTH("networth", "Worth", Icons.Filled.AccountBalanceWallet),
    ;
    val a11yLabel: String get() = when (this) {
        SUBSCRIPTIONS -> "Subscriptions"
        NETWORTH -> "Net Worth"
        else -> label
    }
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
    // Incremented when the user re-taps More while already on More — pops any
    // nested More route back to the More home menu.
    var morePopToRoot by remember { mutableIntStateOf(0) }

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
        val sync by vm.syncState.collectAsStateWithLifecycle()
        var offlineDismissed by remember { mutableStateOf(false) }
        LaunchedEffect(sync) {
            if (sync != SyncState.Offline) offlineDismissed = false
        }
        Scaffold(
            containerColor = Ct.colors.bg,
            topBar = {
                if (sync == SyncState.Offline && !offlineDismissed) {
                    SyncOfflineBanner(onDismiss = { offlineDismissed = true })
                }
            },
            bottomBar = {
                NavigationBar(containerColor = Ct.colors.surface) {
                    shownBottom.forEach { t ->
                        NavBarItem(selected == t.id, t.label, t.a11yLabel, t.icon) { selected = t.id }
                    }
                    if (!isPro) {
                        NavBarItem(selected == "getpro", "Get Pro", "Get Pro", Icons.Filled.WorkspacePremium) {
                            selected = "getpro"
                        }
                    }
                    NavBarItem(selected == "more", "More", "More", Icons.Filled.MoreHoriz) {
                        if (selected == "more") morePopToRoot++
                        selected = "more"
                    }
                }
            },
        ) { padding ->
            when (val sel = selected) {
                "getpro" -> ProScreen(vm, padding)
                "more" -> MoreScreen(vm, user, padding, initialRoute, moreItems, morePopToRoot)
                else -> {
                    val tab = TabId.from(sel)
                    if (tab != null) TabContent(tab, vm, padding)
                    else MoreScreen(vm, user, padding, initialRoute, moreItems, morePopToRoot)
                }
            }
        }

        val presetUpdate by vm.presetUpdatePrompt.collectAsStateWithLifecycle()
        presetUpdate?.let { prompt ->
            val label = listOfNotNull(prompt.card.issuer, prompt.card.name)
                .filter { it.isNotBlank() }
                .joinToString(" ")
                .ifBlank { "Card" }
            val catalog = "${prompt.preset.issuer} ${prompt.preset.name}"
            val diff = app.fihaven.core.logic.Rewards.formatRateDiff(prompt.card, prompt.preset)
                .ifBlank { "Rates changed in the shared catalog." }
            AlertDialog(
                onDismissRequest = { vm.declinePresetUpdate() },
                title = { Text("Update rates for \"$label\"?") },
                text = {
                    Text(
                        "The FiHaven catalog for $catalog has newer rates.\n\n$diff\n\n" +
                            "Update applies catalog rates to this card. Keep mine leaves your numbers alone.",
                    )
                },
                confirmButton = {
                    TextButton(onClick = { vm.acceptPresetUpdate() }) { Text("Update rates") }
                },
                dismissButton = {
                    TextButton(onClick = { vm.declinePresetUpdate() }) { Text("Keep mine") }
                },
                containerColor = Ct.colors.surface,
            )
        }
    }
}

@Composable
private fun SyncOfflineBanner(onDismiss: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(Ct.colors.surface)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("☁", fontSize = 14.sp)
        Text(
            "You're offline — changes save on this device, not the cloud.",
            color = Ct.colors.text,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(1f),
        )
        Text(
            "Dismiss",
            color = Ct.colors.muted,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .clickable(onClick = onDismiss)
                .padding(horizontal = 8.dp, vertical = 4.dp),
        )
    }
}

@Composable
private fun RowScope.NavBarItem(
    selected: Boolean,
    label: String,
    contentDescription: String,
    icon: ImageVector,
    onClick: () -> Unit,
) {
    NavigationBarItem(
        selected = selected,
        onClick = onClick,
        icon = { Icon(icon, contentDescription = contentDescription) },
        label = {
            Text(
                label,
                maxLines = 1,
                softWrap = false,
                fontSize = 11.sp,
            )
        },
        alwaysShowLabel = true,
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
/// so nested destinations show a back arrow; primary bottom-bar tabs leave it null.
@Composable
internal fun TabContent(tab: TabId, vm: AppViewModel, padding: PaddingValues, onBack: (() -> Unit)? = null) {
    when (tab) {
        TabId.DASHBOARD -> DashboardScreen(vm, padding, onBack)
        TabId.BILLS -> BillsScreen(vm, padding, onBack)
        TabId.CARDS -> CardsScreen(vm, padding, kind = "card", onBack = onBack)
        TabId.LOANS -> CardsScreen(vm, padding, kind = "loan", onBack = onBack)
        TabId.PAYOFF -> ProGate(vm, ProFeature.PAYOFF, padding, onBack) { PayoffScreen(vm, padding, onBack) }
        TabId.REWARDS -> ProGate(vm, ProFeature.REWARDS, padding, onBack) { RewardsScreen(vm, padding, onBack) }
        TabId.BUDGET -> BudgetScreen(vm, padding, onBack)
        TabId.SPENDING -> SpendingScreen(vm, padding, onBack)
        TabId.SUBSCRIPTIONS -> ProGate(vm, ProFeature.SUBSCRIPTIONS, padding, onBack) { SubscriptionsScreen(vm, padding, onBack) }
        TabId.CALENDAR -> ProGate(vm, ProFeature.CALENDAR, padding, onBack) { CalendarScreen(vm, padding, onBack) }
        TabId.HISTORY -> ProGate(vm, ProFeature.HISTORY, padding, onBack) { HistoryScreen(vm, padding, onBack) }
        TabId.NETWORTH -> NetWorthScreen(vm, padding, onBack)
    }
}

@Composable
private fun DashboardScreen(vm: AppViewModel, padding: PaddingValues, onBack: (() -> Unit)? = null) {
    val data by vm.data.collectAsStateWithLifecycle()
    val ent by vm.entitlement.collectAsStateWithLifecycle()
    val isPro = ent.pro
    val zone = DateLogic.zone(data.settings.timezoneSetting)
    val periodBounds = vm.currentBounds()
    val periodLabel = Period.label(periodBounds, vm.periodConfig())
    val cfg = vm.periodConfig()
    val income = Income.periodIncome(data.settings, periodBounds)
    val upcoming = Schedule.buildUpcomingItems(
        data.bills,
        data.activeCards,
        zone,
        data.payments,
        periodBounds,
        vm.paidGoalPolicy(),
    )
    val obligations = vm.periodObligationItems(upcoming)
    val visible = vm.dashboardUpcoming(upcoming)
    // "Left to pay" = sum of each obligation's remaining-to-goal, so partial
    // payments shrink it and fully-paid items drop to zero.
    val remaining = obligations.sumOf { vm.remainingFor(it) }
    var paying by remember { mutableStateOf<UpcomingItem?>(null) }
    // A pending "skip a card you still owe on" confirmation.
    var skipConfirm by remember { mutableStateOf<Pair<UpcomingItem, String>?>(null) }
    var editingBill by remember { mutableStateOf<Bill?>(null) }
    var editingCard by remember { mutableStateOf<Card?>(null) }
    var rolloverReview by remember { mutableStateOf(false) }
    val rolloverPrompt by vm.rolloverPrompt.collectAsStateWithLifecycle()

    // Skip an upcoming item — but for a card you still owe on, confirm first.
    val requestSkip: (UpcomingItem) -> Unit = { item ->
        val warning = if (item.type == "card") vm.cardSkipWarning(item.refId, item.name) else null
        if (warning != null) skipConfirm = item to warning
        else vm.skipMonth(item.type, item.refId, item.name)
    }

    // Net worth / debt / spending for the optional widgets.
    val debt = data.activeCards.sumOf { it.balance }
    val netWorth = data.accounts.sumOf { it.balance } - debt
    val spent = data.transactions
        .filter { it.date.isNotEmpty() && it.date >= periodBounds.startKey && it.date < periodBounds.endKey }
        .sumOf { it.amount }
    val paidThisPeriod = data.payments
        .filter { !it.skipped && it.date.isNotEmpty() && it.date >= periodBounds.startKey && it.date < periodBounds.endKey }
        .sumOf { it.amount }
    // 0% promo / overdue alerts — mirrors the web dashboard alert logic.
    val utilAlerts = data.activeCards.filter { it.type != "loan" && it.limit > 0 }.mapNotNull { c ->
        val util = ((c.balance / c.limit) * 100).toInt()
        when {
            util >= 90 -> "💳 ${c.name} — $util% credit utilization (${Money.fmt(c.balance)} of ${Money.fmt(c.limit)})."
            util >= 80 -> "💳 ${c.name} — $util% credit utilization (${Money.fmt(c.balance)} of ${Money.fmt(c.limit)})."
            else -> null
        }
    }
    val trialAlerts = data.bills.filter { !it.trialEnds.isNullOrBlank() }.mapNotNull { b ->
        val end = DateLogic.parseDate(b.trialEnds!!) ?: return@mapNotNull null
        val left = java.time.temporal.ChronoUnit.DAYS.between(java.time.LocalDate.now(zone), end)
        if (left < 0 || left > 3) return@mapNotNull null
        val dayWord = when (left) { 0L -> "today"; 1L -> "tomorrow"; else -> "in $left days" }
        "⏳ ${b.name} — free trial ends $dayWord."
    }
    val promoAlerts = data.activeCards.filter { it.hasPromo && !it.promoEndDate.isNullOrEmpty() }.mapNotNull { c ->
        val mo = DateLogic.monthsUntil(c.promoEndDate, zone)
        val bal = c.promoBalance ?: c.balance
        if (bal <= 0) return@mapNotNull null
        val need = maxOf(c.minPayment, Schedule.promoNeeded(c, zone))
        when {
            mo <= 0 -> "🚨 ${c.name} — 0% promo expired. ${Money.fmt(bal)} is accruing ${c.regularAPR.toInt()}% APR."
            mo <= 2 -> "🔥 ${c.name} — 0% promo ends in ~$mo mo. Pay ${Money.fmt(need)}/mo to avoid interest."
            mo <= 4 -> "⚠️ ${c.name} — 0% promo ends in ~$mo mo. Need ${Money.fmt(need)}/mo to clear ${Money.fmt(bal)}."
            else -> null
        }
    }
    val dashboardAlerts = utilAlerts + trialAlerts + promoAlerts
    // Subscriptions: bills flagged Subscriptions + merchants recurring across 2+ months.
    fun monthlyOfBill(b: app.fihaven.core.model.Bill) = when (b.frequency) {
        "Weekly" -> b.amount * 52 / 12; "Bi-weekly" -> b.amount * 26 / 12
        "Quarterly" -> b.amount / 3; "Annually" -> b.amount / 12; else -> b.amount
    }
    val subs = buildList {
        data.bills.filter { it.category == "Subscriptions" && !DateLogic.billEnded(it, zone) }
            .forEach { add((it.name.ifBlank { "Subscription" }) to monthlyOfBill(it)) }
        data.transactions.filter { it.merchant.isNotBlank() }
            .groupBy { it.merchant.trim().lowercase() }
            .forEach { (_, list) ->
                if (list.map { it.date.take(7) }.toSet().size >= 2) {
                    list.maxByOrNull { it.date }?.let { add(it.merchant to it.amount) }
                }
            }
    }.sortedByDescending { it.second }

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        // Branded top bar (FiHaven mark + period label), matching iOS and the
        // other Android screens.
        ScreenHeader(periodLabel, onBack = onBack, branded = true)
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            rolloverPrompt?.let { rp ->
                item {
                    RolloverPromptCard(
                        prompt = rp,
                        onReview = { rolloverReview = true },
                        onDismiss = { vm.dismissRolloverPrompt() },
                    )
                }
            }
            val widgetIds = if (data.settings.dashboardLayout == "widgets")
                DashboardWidgets.enabled(data.settings) else listOf("stats", "upcoming")
            widgetIds.forEach { id ->
                when (id) {
                    "stats" -> item {
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            StatCard(Income.incomeLabel(cfg), Money.fmt(income), Ct.colors.green, Modifier.weight(1f))
                            StatCard(Income.owedLabel(cfg), Money.fmt(remaining), Ct.colors.accent, Modifier.weight(1f))
                        }
                    }
                    "cashflow" -> if (paidThisPeriod + remaining > 0) item {
                        CashflowWidget(paidThisPeriod, remaining)
                    }
                    "alerts" -> if (dashboardAlerts.isNotEmpty()) item {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            dashboardAlerts.forEach { msg ->
                                CtCard { Text(msg, color = Ct.colors.text, fontSize = 13.sp) }
                            }
                        }
                    }
                    "goals" -> if (data.goals.isNotEmpty()) item { GoalsWidget(data.goals) }
                    "subscriptions" -> if (subs.isNotEmpty()) item { SubscriptionsWidget(subs) }
                    "incomeHistory" -> item { IncomeHistoryWidget(data.settings, zone) }
                    "budgetStatus" -> item {
                        BudgetStatusWidget(data, income, remaining, isPro, zone, periodBounds)
                    }
                    "networth" -> item {
                        StatCard("Net worth", Money.fmt(netWorth),
                            if (netWorth >= 0) Ct.colors.green else Ct.colors.red, Modifier.fillMaxWidth())
                    }
                    "debt" -> item {
                        StatCard("Card debt", Money.fmt(debt),
                            if (debt > 0) Ct.colors.accent else Ct.colors.green, Modifier.fillMaxWidth())
                    }
                    "spending" -> item {
                        StatCard("Spent this period", Money.fmt(spent), Ct.colors.accent, Modifier.fillMaxWidth())
                    }
                    "upcoming" -> {
                        item {
                            Text("UPCOMING", color = Ct.colors.muted, fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold, letterSpacing = 0.5.sp)
                        }
                        if (visible.isEmpty()) {
                            item { CtCard { Text("Nothing scheduled — add a bill or card.", color = Ct.colors.muted) } }
                        } else {
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
                                                periodNoun = vm.periodNoun(item),
                                                onPay = { paying = item },
                                                onSkip = { requestSkip(item) },
                                                onUnskip = { vm.unskip(item.type, item.refId) },
                                                onEdit = {
                                                    if (item.type == "bill")
                                                        editingBill = data.bills.firstOrNull { it.id.toString() == item.refId }
                                                    else
                                                        editingCard = data.cards.firstOrNull { it.id.toString() == item.refId }
                                                },
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    paying?.let { PayDialog(vm, it.type, it.refId, it.name) { paying = null } }
    editingBill?.let { BillEditorDialog(it, vm, onDismiss = { editingBill = null }) }
    editingCard?.let { CardEditorDialog(it, vm, onDismiss = { editingCard = null }) }
    if (rolloverReview) RolloverReviewDialog(vm, onDismiss = { rolloverReview = false })

    skipConfirm?.let { (item, warning) ->
        AlertDialog(
            onDismissRequest = { skipConfirm = null },
            title = { Text("Skip this ${vm.periodNoun(item)}?") },
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

// ── Parity dashboard widgets (Widgets layout) ────────────────────────
@Composable
private fun ProgressBar(pct: Double) {
    Box(Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)).background(Ct.colors.surface2)) {
        Box(Modifier.fillMaxWidth(pct.coerceIn(0.0, 1.0).toFloat()).height(8.dp)
            .clip(RoundedCornerShape(4.dp)).background(Ct.colors.accent))
    }
}

@Composable
private fun CashflowWidget(paid: Double, remaining: Double) {
    val budgeted = paid + remaining
    val pct = if (budgeted > 0) paid / budgeted else 0.0
    CtCard {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            FieldLabel("This period's payments")
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("${Money.fmt(paid)} paid", color = Ct.colors.green, fontSize = 13.sp)
                Text("${(pct * 100).toInt()}%", color = Ct.colors.muted, fontSize = 13.sp)
            }
            ProgressBar(pct)
            Text("${Money.fmt(remaining)} remaining of ${Money.fmt(budgeted)}",
                color = Ct.colors.muted, fontSize = 12.sp)
        }
    }
}

@Composable
private fun BudgetStatusWidget(
    data: app.fihaven.core.model.AppData,
    income: Double,
    remaining: Double,
    isPro: Boolean,
    zone: java.time.ZoneId,
    bounds: app.fihaven.core.logic.PeriodBounds,
) {
    val lens = BudgetRules.lens(
        settings = data.settings,
        income = income,
        bills = data.bills,
        cards = data.activeCards,
        transactions = data.transactions,
        goals = data.goals,
        bounds = bounds,
        billDueInPeriod = { BillSchedule.dueInPeriod(it, bounds, zone) },
        isPro = isPro,
        zone = zone,
    )
    val headline = lens?.headline
    if (headline != null) {
        CtCard {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                FieldLabel(lens.title)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(headline.label, color = Ct.colors.muted, fontSize = 13.sp)
                    Text(
                        Money.fmt(headline.amount),
                        color = if (headline.status == "ok") Ct.colors.green else Ct.colors.red,
                        fontSize = 20.sp, fontWeight = FontWeight.SemiBold, fontFamily = PlexMono,
                    )
                }
            }
        }
    } else if (income > 0) {
        val cushion = income - remaining
        CtCard {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                FieldLabel("Cushion after bills")
                Text(
                    Money.fmt(cushion),
                    color = if (cushion >= 0) Ct.colors.green else Ct.colors.red,
                    fontSize = 20.sp, fontWeight = FontWeight.SemiBold, fontFamily = PlexMono,
                )
            }
        }
    }
}

@Composable
private fun GoalsWidget(goals: List<app.fihaven.core.model.SavingsGoal>) {
    CtCard {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            FieldLabel("Savings goals")
            goals.forEach { g ->
                val pct = if (g.target > 0) g.saved / g.target else 0.0
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(g.name.ifBlank { "Goal" }, color = Ct.colors.text, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        Text("${Money.fmt(g.saved)} / ${Money.fmt(g.target)}", color = Ct.colors.muted, fontSize = 12.sp, fontFamily = PlexMono)
                    }
                    ProgressBar(pct)
                }
            }
        }
    }
}

@Composable
private fun SubscriptionsWidget(subs: List<Pair<String, Double>>) {
    CtCard {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                FieldLabel("Subscriptions")
                Text("${Money.fmt(subs.sumOf { it.second })}/mo", color = Ct.colors.text, fontSize = 13.sp, fontFamily = PlexMono)
            }
            subs.take(5).forEach { (name, m) ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(name, color = Ct.colors.text, fontSize = 13.sp, maxLines = 1)
                    Text("${Money.fmt(m)}/mo", color = Ct.colors.muted, fontSize = 12.sp, fontFamily = PlexMono)
                }
            }
        }
    }
}

@Composable
private fun IncomeHistoryWidget(settings: kotlinx.serialization.json.JsonObject, zone: java.time.ZoneId) {
    val months = (0 until 6).map { i ->
        Income.monthlyIncome(settings, DateLogic.monthKey(java.time.LocalDate.now(zone).minusMonths(i.toLong())))
    }
    val base = Income.monthlyIncome(settings)
    if (base <= 0.0 && months.none { it > 0.0 }) return
    val avg = months.sum() / months.size
    CtCard {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            FieldLabel("Income history")
            Text(Money.fmt(avg), color = Ct.colors.text, fontSize = 20.sp,
                fontWeight = FontWeight.SemiBold, fontFamily = PlexMono)
            Text("Avg / mo incl. bonuses · last 6 months", color = Ct.colors.muted, fontSize = 12.sp)
        }
    }
}

/** Dashboard widget catalog for the "Widgets" layout. Order + enabled set
 *  live in settings.dashboardWidgets (shared with web/iOS); each platform
 *  renders the ids it supports and ignores the rest. */
object DashboardWidgets {
    val catalog = listOf(
        "stats" to "Overview tiles",
        "cashflow" to "This period's payments",
        "alerts" to "Alerts",
        "upcoming" to "Upcoming payments",
        "networth" to "Net worth",
        "spending" to "Spending",
        "goals" to "Savings goals",
        "subscriptions" to "Subscriptions",
        "incomeHistory" to "Income history",
        "budgetStatus" to "Budget / safe-to-spend",
    )
    val allIds = catalog.map { it.first }
    val defaults = listOf("stats", "cashflow", "alerts", "upcoming")
    fun label(id: String) = catalog.firstOrNull { it.first == id }?.second ?: id
    fun enabled(settings: kotlinx.serialization.json.JsonObject): List<String> {
        val src = settings.dashboardWidgets.ifEmpty { defaults }
        val valid = allIds.toSet(); val seen = mutableSetOf<String>()
        return src.filter { it in valid && seen.add(it) }
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
    periodNoun: String = "month",
    onPay: () -> Unit,
    onSkip: () -> Unit,
    onUnskip: () -> Unit,
    onEdit: () -> Unit,
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
        PaidState.FULL -> "Paid this $periodNoun"
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
            // Who it's actually paid to — the name above is often a nickname.
            if (item.business.isNotBlank()) {
                Text(item.business, color = c.muted, fontSize = 12.sp, maxLines = 1)
            }
            Text(label, color = dueTint, fontSize = 12.sp)
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(Money.fmt(if (state == PaidState.FULL) goal else remaining), color = Ct.colors.text,
                fontSize = 15.sp, fontWeight = FontWeight.Medium, fontFamily = PlexMono)
            if (item.autopay) Text("autopay", color = Ct.colors.muted, fontSize = 9.sp, fontFamily = PlexMono)
        }
        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            DropdownMenuItem(text = { Text("Pay") }, onClick = { menuOpen = false; onPay() })
            DropdownMenuItem(text = { Text("Edit") }, onClick = { menuOpen = false; onEdit() })
            if (skipped) {
                DropdownMenuItem(text = { Text("Un-skip $periodNoun") }, onClick = { menuOpen = false; onUnskip() })
            } else {
                DropdownMenuItem(text = { Text("Skip this $periodNoun") }, onClick = { menuOpen = false; onSkip() })
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
    // Derive the date from `days` rather than reusing `nextDue`. `nextDue` is the
    // next *forward* occurrence, so an overdue item paired it with next period's
    // date — a Jul 12 due date read as "Overdue · Aug 12".
    if (item.nextDue == null) return base
    val due = java.time.LocalDate.now().plusDays(item.days.toLong())
    return "$base · ${shortDate.format(due)}"
}

// ── Monthly rollover ────────────────────────────────────────────────
@Composable
private fun RolloverPromptCard(
    prompt: AppViewModel.RolloverPrompt,
    onReview: () -> Unit,
    onDismiss: () -> Unit,
) {
    CtCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("🗓", fontSize = 22.sp, modifier = Modifier.padding(end = 10.dp))
            Column(Modifier.weight(1f)) {
                Text("Welcome to ${prompt.currLabel}!", color = Ct.colors.text,
                    fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                val missedText = if (prompt.missedNames.isEmpty()) {
                    "Everything from ${prompt.prevLabel} was marked paid. Great work!"
                } else {
                    val shown = prompt.missedNames.take(6).joinToString(", ")
                    val more = if (prompt.missedNames.size > 6) " and ${prompt.missedNames.size - 6} more" else ""
                    "${prompt.missedNames.size} from ${prompt.prevLabel} never marked paid: $shown$more."
                }
                Text(missedText, color = Ct.colors.muted, fontSize = 12.sp)
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(top = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onDismiss) { Text("Dismiss", color = Ct.colors.muted) }
            Button(onClick = onReview, colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent)) {
                Text("Set ${prompt.currLabel.substringBefore(' ')} amounts")
            }
        }
    }
}

@Composable
private fun RolloverReviewDialog(vm: AppViewModel, onDismiss: () -> Unit) {
    val bills = remember { vm.rolloverBills() }
    val amounts = remember {
        mutableStateMapOf<String, String>().apply {
            bills.forEach { b ->
                val pre = vm.rolloverPrefillAmount(b)
                put(b.id, if (pre > 0) String.format(Locale.US, "%.2f", pre) else "")
            }
        }
    }
    FormDialog(
        title = "Review this month's bills",
        saveLabel = "Save amounts",
        onSave = {
            val map = bills.mapNotNull { b ->
                amounts[b.id]?.trim()?.takeIf { it.isNotEmpty() }?.toDoubleOrNull()?.let { b.id to it }
            }.toMap()
            vm.applyRolloverAmounts(map)
            onDismiss()
        },
        onDismiss = onDismiss,
    ) {
        Text(
            "Pre-filled from your rollover setting. Adjust any that changed — leave a field blank to keep that bill as-is.",
            color = Ct.colors.muted, fontSize = 13.sp,
        )
        if (bills.isEmpty()) {
            Text("No active bills to review.", color = Ct.colors.muted, fontSize = 14.sp)
        } else {
            bills.forEach { b ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(b.name, color = Ct.colors.text, fontSize = 15.sp, modifier = Modifier.weight(1f))
                    OutlinedTextField(
                        value = amounts[b.id] ?: "",
                        onValueChange = { v -> amounts[b.id] = v.filter { it.isDigit() || it == '.' } },
                        prefix = { Text("$") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.width(130.dp),
                    )
                }
            }
        }
    }
}
