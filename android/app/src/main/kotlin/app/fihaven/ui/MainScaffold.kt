package app.fihaven.ui

import app.fihaven.ui.theme.MonoNumerals

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Autorenew
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Paid
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Savings
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
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import app.fihaven.core.model.categoryIcons
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
import app.fihaven.core.logic.Snoozes
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
    INCOME("income", "Income", Icons.Filled.Paid),
    BUDGET("budget", "Budget", Icons.Filled.PieChart),
    SPENDING("spending", "Spending", Icons.Filled.Payments),
    // Short nav labels — Material bottom bars with 4–5 slots wrap long words
    // awkwardly ("Subscriptio / ns"). Full names stay in contentDescription.
    SUBSCRIPTIONS("subscriptions", "Subs", Icons.Filled.Autorenew),
    CALENDAR("calendar", "Calendar", Icons.Filled.CalendarMonth),
    HISTORY("history", "History", Icons.Filled.History),
    NETWORTH("networth", "Worth", Icons.Filled.AccountBalanceWallet),
    BALANCES("balances", "Balances", Icons.Filled.Savings),
    ;
    /** The unabbreviated name — used for contentDescription and as the title
     *  in the More list, which is full-width and can afford it. */
    val a11yLabel: String get() = when (this) {
        SUBSCRIPTIONS -> "Subscriptions"
        NETWORTH -> "Net Worth"
        BALANCES -> "Account Balances"
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
            // Scaffold doesn't inset a plain composable used as `topBar` (only
            // TopAppBar applies its own), so the banner drew under the status
            // bar and collided with the clock.
            .statusBarsPadding()
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("☁", fontSize = 14.sp)
        Text(
            // Every edit is written to the device before the network is
            // attempted, so this can now say it's safe — and it no longer has
            // to ask the user to keep the app open, because an unsent snapshot
            // is replayed on the next launch.
            "Offline — your changes are saved on this device and will sync when you’re back online.",
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
        TabId.INCOME -> IncomeScreen(vm, padding, onBack)
        TabId.BUDGET -> BudgetScreen(vm, padding, onBack)
        TabId.SPENDING -> SpendingScreen(vm, padding, onBack)
        TabId.SUBSCRIPTIONS -> ProGate(vm, ProFeature.SUBSCRIPTIONS, padding, onBack) { SubscriptionsScreen(vm, padding, onBack) }
        TabId.CALENDAR -> ProGate(vm, ProFeature.CALENDAR, padding, onBack) { CalendarScreen(vm, padding, onBack) }
        TabId.HISTORY -> ProGate(vm, ProFeature.HISTORY, padding, onBack) { HistoryScreen(vm, padding, onBack) }
        TabId.NETWORTH -> NetWorthScreen(vm, padding, onBack)
        TabId.BALANCES -> BalancesScreen(vm, padding, onBack)
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
        data.settings.categoryIcons,
    )
    val obligations = vm.periodObligationItems(upcoming)
    // Snoozed rows drop off the list until tomorrow. The queue is per-device
    // (never synced) and lives in the view model — see SnoozePrefs.
    val snoozes by vm.snoozes.collectAsStateWithLifecycle()
    val visible = vm.dashboardUpcoming(upcoming)
        .filterNot { Snoozes.isSnoozed(snoozes, it.type, it.refId) }
    // Snoozed rows worth offering back. One that has since been paid stays
    // gone — un-snoozing it would only put a settled row on the list.
    val snoozed = upcoming.filter {
        Snoozes.isSnoozed(snoozes, it.type, it.refId) && !vm.isFullyPaid(it.type, it.refId)
    }
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
    // Card debt is revolving credit only — loans live in the same list and
    // would put a mortgage in the card total. Net worth is the opposite case:
    // every liability counts, loans included.
    // Live balance, like the Cards tab and web: a card charged since its
    // statement closed still counts toward what's owed. Net worth stays on the
    // statement balance, which is what web's Net Worth panel reports.
    val cardDebt = Schedule.cardDebt(data.cards)
    val netWorth = data.accounts.sumOf { it.balance } - data.activeCards.sumOf { it.balance }
    val spent = data.transactions
        .filter { it.date.isNotEmpty() && it.date >= periodBounds.startKey && it.date < periodBounds.endKey }
        .sumOf { it.amount }
    val paidThisPeriod = data.payments
        .filter { !it.skipped && it.date.isNotEmpty() && it.date >= periodBounds.startKey && it.date < periodBounds.endKey }
        .sumOf { it.amount }
    // 0% promo / overdue alerts — mirrors the web dashboard alert logic.
    // Schedule.utilization, so the alert can't disagree with the percentage the
    // card's own row shows.
    val utilAlerts = data.activeCards.mapNotNull { c ->
        val ratio = Schedule.utilization(c) ?: return@mapNotNull null
        val util = (ratio * 100).toInt()
        if (util < 80) return@mapNotNull null
        val bal = Schedule.liveBalance(c)
        "💳 ${c.name} — $util% credit utilization (${Money.fmt(bal)} of ${Money.fmt(c.limit)})."
    }
    // activeBills, not bills: an archived subscription is meant to be gone from
    // every list and total, but its trial kept alerting on the dashboard (iOS
    // reads activeBills here).
    val trialAlerts = data.activeBills.filter { !it.trialEnds.isNullOrBlank() }.mapNotNull { b ->
        val end = DateLogic.parseDate(b.trialEnds!!) ?: return@mapNotNull null
        val left = java.time.temporal.ChronoUnit.DAYS.between(java.time.LocalDate.now(zone), end)
        if (left < 0 || left > 3) return@mapNotNull null
        val dayWord = when (left) { 0L -> "today"; 1L -> "tomorrow"; else -> "in $left days" }
        "⏳ ${b.name} — free trial ends $dayWord."
    }
    val promoAlerts = data.activeCreditCards.filter { it.hasPromo && !it.promoEndDate.isNullOrEmpty() }.mapNotNull { c ->
        val mo = DateLogic.monthsUntil(c.promoEndDate, zone)
        val bal = c.promoBalance ?: c.balance
        if (bal <= 0) return@mapNotNull null
        val need = maxOf(c.minPaymentOrZero, Schedule.promoNeeded(c, zone))
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
        "Weekly" -> b.amountOrZero * 52 / 12; "Bi-weekly" -> b.amountOrZero * 26 / 12
        "Quarterly" -> b.amountOrZero / 3; "Annually" -> b.amountOrZero / 12; else -> b.amountOrZero
    }
    val subs = buildList {
        // Same archived gate SubscriptionsFinder applies, so the widget's
        // "$X/mo" total matches the Subscriptions tab instead of quietly
        // counting bills the user archived.
        data.activeBills.filter { it.category == "Subscriptions" && !DateLogic.billEnded(it, zone) }
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
                    // Overview tiles. Card debt rides along here as well as
                    // being its own widget, so Classic shows it too — web's
                    // overview strip has carried it all along.
                    "stats" -> item {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                StatCard(Income.incomeLabel(cfg), Money.fmt(income), Ct.colors.green, Modifier.weight(1f))
                                StatCard(Income.owedLabel(cfg), Money.fmt(remaining), Ct.colors.accent, Modifier.weight(1f))
                            }
                            StatCard(
                                "Card debt", Money.fmt(cardDebt),
                                if (cardDebt > 0) Ct.colors.accent else Ct.colors.green,
                                Modifier.fillMaxWidth(),
                            )
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
                        StatCard("Card debt", Money.fmt(cardDebt),
                            if (cardDebt > 0) Ct.colors.accent else Ct.colors.green, Modifier.fillMaxWidth())
                    }
                    "spending" -> item {
                        StatCard("Spent this period", Money.fmt(spent), Ct.colors.accent, Modifier.fillMaxWidth())
                    }
                    "upcoming" -> {
                        item {
                            Text("UPCOMING", color = Ct.colors.muted, fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold, letterSpacing = 0.5.sp)
                        }
                        if (visible.isEmpty() && snoozed.isEmpty()) {
                            item { CtCard { Text("Nothing scheduled — add a bill or card.", color = Ct.colors.muted) } }
                        } else if (visible.isEmpty()) {
                            // Everything left is snoozed: say so, rather than
                            // claiming nothing is scheduled (web parity).
                            item {
                                CtCard {
                                    val n = snoozed.size
                                    Text(
                                        "Nothing on deck — $n item${if (n == 1) "" else "s"} snoozed for today.",
                                        color = Ct.colors.muted,
                                    )
                                }
                            }
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
                                                needsAmount = vm.needsAmount(item),
                                                nothingDue = vm.nothingDue(item),
                                                zone = zone,
                                                periodNoun = vm.periodNoun(item),
                                                onPay = { paying = item },
                                                onSkip = { requestSkip(item) },
                                                onUnskip = { vm.unskip(item.type, item.refId) },
                                                onUnmark = {
                                                    vm.setPaid(item.type, item.refId, item.name,
                                                        vm.goalAmount(item), false)
                                                },
                                                onConfirmZero = { vm.confirmZeroAmount(item.type, item.refId) },
                                                onSnooze = { vm.snooze(item.type, item.refId) },
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
                        if (snoozed.isNotEmpty()) {
                            item { SnoozedBlock(snoozed, vm) }
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
                fontWeight = FontWeight.SemiBold, style = MonoNumerals)
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
                        fontSize = 20.sp, fontWeight = FontWeight.SemiBold, style = MonoNumerals,
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
                    fontSize = 20.sp, fontWeight = FontWeight.SemiBold, style = MonoNumerals,
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
                        Text("${Money.fmt(g.saved)} / ${Money.fmt(g.target)}", color = Ct.colors.muted, fontSize = 12.sp, style = MonoNumerals)
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
                Text("${Money.fmt(subs.sumOf { it.second })}/mo", color = Ct.colors.text, fontSize = 13.sp, style = MonoNumerals)
            }
            subs.take(5).forEach { (name, m) ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(name, color = Ct.colors.text, fontSize = 13.sp, maxLines = 1)
                    Text("${Money.fmt(m)}/mo", color = Ct.colors.muted, fontSize = 12.sp, style = MonoNumerals)
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
                fontWeight = FontWeight.SemiBold, style = MonoNumerals)
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
        "debt" to "Card debt",
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

/** The snoozed queue, offered back one tap at a time. Web shows the same list
 *  as chips under Upcoming; full-width rows read better on a phone. */
@Composable
private fun SnoozedBlock(snoozed: List<UpcomingItem>, vm: AppViewModel) {
    val c = Ct.colors
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("💤 Snoozed until tomorrow", color = c.muted, fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Text("${snoozed.size}", color = c.muted, fontSize = 12.sp, style = MonoNumerals)
        }
        CtCard(padding = 0) {
            Column {
                snoozed.forEachIndexed { i, item ->
                    if (i > 0) HorizontalDivider(color = c.border, thickness = 1.dp)
                    Row(
                        Modifier.fillMaxWidth()
                            .clickable { vm.unsnooze(item.type, item.refId) }
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        IconMark(icon = item.icon, size = 18.dp, modifier = Modifier.padding(end = 12.dp))
                        Text(item.name, color = c.text, fontSize = 14.sp,
                            maxLines = 1, modifier = Modifier.weight(1f))
                        Text(Money.fmt(vm.remainingFor(item)), color = c.muted,
                            fontSize = 13.sp, style = MonoNumerals,
                            modifier = Modifier.padding(end = 12.dp))
                        Text("Un-snooze", color = c.accent, fontSize = 12.sp,
                            fontWeight = FontWeight.Medium)
                    }
                }
            }
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
    skipped: Boolean,
    needsAmount: Boolean,
    nothingDue: Boolean,
    zone: java.time.ZoneId,
    periodNoun: String = "month",
    onPay: () -> Unit,
    onSkip: () -> Unit,
    onUnskip: () -> Unit,
    onUnmark: () -> Unit,
    onConfirmZero: () -> Unit,
    onSnooze: () -> Unit = {},
    onEdit: () -> Unit,
) {
    val c = Ct.colors
    val dueTint = when {
        needsAmount -> c.orange
        // Settled because nothing is owed, not because a payment landed — the
        // paid-green would claim credit for a payment that never happened.
        nothingDue -> c.muted
        state == PaidState.FULL -> c.green
        state == PaidState.PARTIAL -> c.orange
        item.days < 0 -> c.red
        item.days <= 3 -> c.orange
        else -> c.muted
    }
    val label = when {
        // An item with no amount can't be measured against anything, so say that
        // rather than showing a due countdown against $0.
        needsAmount -> "No amount set · tap to add one"
        nothingDue -> "Nothing due this $periodNoun"
        state == PaidState.FULL -> "Paid this $periodNoun"
        state == PaidState.PARTIAL -> "Paid ${Money.fmt(paidSoFar)} of ${Money.fmt(goal)}"
        else -> dueLabel(item, false, zone)
    }
    // No own card — the dashboard wraps the whole list in one CtCard with
    // dividers (iOS parity). Internal padding matches iOS's row insets.
    //
    // Every action is spelled out as its own button (Bills-tab idiom, and web
    // parity). Tapping the row body used to *pay* the item outright, with the
    // full amount pre-filled — testers reaching for the pay sheet's "Note
    // (optional)" field marked bills paid by accident, and with
    // `hidePaidOnDashboard` on by default they then vanished from Upcoming.
    // The body now opens the editor, which is the harmless of the two.
    Column(
        Modifier.fillMaxWidth()
            .clickable(onClick = onEdit)
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconMark(icon = item.icon, size = 22.dp, modifier = Modifier.padding(end = 12.dp))
            Column(Modifier.weight(1f)) {
                Text(item.name, color = c.text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                // Who it's actually paid to — the name above is often a nickname.
                if (item.business.isNotBlank()) {
                    Text(item.business, color = c.muted, fontSize = 12.sp, maxLines = 1)
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(Money.fmt(if (state == PaidState.FULL) goal else remaining), color = Ct.colors.text,
                    fontSize = 15.sp, fontWeight = FontWeight.Medium, style = MonoNumerals)
                if (item.autopay) Text("autopay", color = Ct.colors.muted, fontSize = 9.sp, style = MonoNumerals)
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 2.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                if (skipped) "⏭ Skipped this $periodNoun" else label,
                color = if (skipped) c.muted else dueTint,
                fontSize = 12.sp,
                modifier = Modifier.weight(1f),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                when {
                    skipped -> QuickAction("Undo skip", c.accent, onUnskip)
                    // A $0 row is settled with no payment behind it: Undo deletes
                    // a payment record and would find none, leaving a button that
                    // does nothing. There is also nothing to pay.
                    nothingDue -> Unit
                    state == PaidState.FULL -> QuickAction("Undo", c.muted, onUnmark)
                    // Skip is meaningless on a row with no amount — it would hide
                    // the row for one period and leave the real gap unanswered.
                    // "It's $0" settles it for good, in a tap.
                    needsAmount -> {
                        QuickAction("It's $0", c.muted, onConfirmZero)
                        QuickAction("Snooze", c.muted, onSnooze)
                        QuickAction("Pay", c.accent, onPay)
                    }
                    else -> {
                        QuickAction("Skip", c.muted, onSkip)
                        // Hide the row until tomorrow — a "seen it, not today"
                        // gesture, kept on this device only (web parity).
                        QuickAction("Snooze", c.muted, onSnooze)
                        QuickAction("Pay", c.accent, onPay)
                    }
                }
            }
        }
    }
}

private val shortDate = DateTimeFormatter.ofPattern("MMM d", Locale.US)

private fun dueLabel(item: UpcomingItem, paid: Boolean, zone: java.time.ZoneId): String {
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
    // `days` is counted in the user's time zone, so the day it's added to has to
    // be too — LocalDate.now() reads the device's, which put the printed date a
    // day out of step with "Due today" for anyone who set a zone.
    val due = DateLogic.today(zone).plusDays(item.days.toLong())
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
    val data by vm.data.collectAsStateWithLifecycle()
    // Re-derived on data change so an edit made from a row shows up here.
    val bills = remember(data) { vm.rolloverBills() }
    val amounts = remember {
        mutableStateMapOf<String, String>().apply {
            vm.rolloverBills().forEach { b -> put(b.id, vm.rolloverPrefillText(b)) }
        }
    }
    var editing by remember { mutableStateOf<Bill?>(null) }
    // Scanning the schedule per row is too much to redo on every keystroke.
    val dueLabels = remember(bills) {
        bills.associate { it.id to (rolloverDueLabel(vm, it) to vm.rolloverIsLate(it)) }
    }

    editing?.let { bill ->
        BillEditorDialog(bill, vm) {
            // The edited row re-prefills from the bill's new amount rather than
            // the stale value that was sitting in the field.
            vm.rolloverBills().firstOrNull { it.id == bill.id }
                ?.let { amounts[it.id] = vm.rolloverPrefillText(it) }
            editing = null
        }
        return
    }

    FormDialog(
        title = "Review this month's bills",
        saveLabel = "Save amounts",
        onSave = {
            val map = bills.mapNotNull { b ->
                amounts[b.id]?.trim()?.takeIf { it.isNotEmpty() }?.toDoubleOrNull()?.let { b.id to it }
            }.toMap()
            vm.applyRolloverAmounts(map)
            // The review is the whole point of the new-month card, so retire it
            // once amounts are in rather than making the user dismiss it too.
            vm.dismissRolloverPrompt()
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
            Text(
                "${bills.size} bill${if (bills.size == 1) "" else "s"} · scroll for all",
                color = Ct.colors.muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
            )
            bills.forEach { b ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(b.name, color = Ct.colors.text, fontSize = 15.sp)
                        dueLabels[b.id]?.let { (label, late) ->
                            if (label != null) Text(
                                label,
                                color = if (late) Ct.colors.red else Ct.colors.muted,
                                fontSize = 12.sp,
                            )
                        }
                    }
                    OutlinedTextField(
                        value = amounts[b.id] ?: "",
                        onValueChange = { v -> amounts[b.id] = v.filter { it.isDigit() || it == '.' } },
                        prefix = { Text("$") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.width(120.dp),
                    )
                    IconButton(onClick = { editing = b }) {
                        Icon(Icons.Filled.Edit, contentDescription = "Edit ${b.name}", tint = Ct.colors.accent)
                    }
                }
            }
        }
    }
}

/** "Due Aug 5" / "Autopays Aug 5" for the month being reviewed. */
private fun rolloverDueLabel(vm: AppViewModel, bill: Bill): String? {
    val due = vm.rolloverDueDate(bill) ?: return null
    return "${if (bill.autopay) "Autopays" else "Due"} ${shortDate.format(due)}"
}
