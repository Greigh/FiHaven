package app.fihaven.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Autorenew
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Stars
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.fihaven.AppViewModel
import app.fihaven.billing.BillingManager
import app.fihaven.ui.theme.Ct

/** What a new user wants from FiHaven. Each goal surfaces its tabs in the
 *  bottom bar so people land on the features they actually came for. */
private enum class Goal(val title: String, val blurb: String, val icon: ImageVector, val tabs: List<TabId>) {
    BILLS("Stay on top of bills", "Bills + calendar up front", Icons.AutoMirrored.Filled.ReceiptLong, listOf(TabId.BILLS, TabId.CALENDAR)),
    DEBT("Pay off credit cards & debt", "Cards + payoff planner", Icons.Filled.CreditCard, listOf(TabId.CARDS, TabId.PAYOFF)),
    BUDGET("Budget each month", "Budget + spending", Icons.Filled.PieChart, listOf(TabId.BUDGET, TabId.SPENDING)),
    REWARDS("Maximize card rewards", "Rewards picker", Icons.Filled.Stars, listOf(TabId.REWARDS)),
    SUBSCRIPTIONS("Track subscriptions", "Subscription finder", Icons.Filled.Autorenew, listOf(TabId.SUBSCRIPTIONS)),
}

private val proHighlights = listOf(
    Icons.AutoMirrored.Filled.TrendingUp to "Payoff planner & debt-free date",
    Icons.Filled.People to "Family sharing for your household",
    Icons.Filled.CalendarMonth to "Due-date calendar & full history",
    Icons.Filled.Stars to "Rewards & subscription finder",
    Icons.Filled.PieChart to "Category budgets & bank linking",
)

private enum class OnboardStep { Goals, Plan, Security, Pro }

/// First-run onboarding after email confirm (`user.onboarded`). Goals tailor
/// the tab bar; Back lets you revise choices; Free CTA only appears after
/// you've looked at Premium (or tapped “Not now”).
@Composable
fun OnboardingScreen(vm: AppViewModel) {
    var step by remember { mutableStateOf(OnboardStep.Goals) }
    var finishing by remember { mutableStateOf(false) }
    var selectedGoals by remember { mutableStateOf(setOf<Goal>()) }
    var budgetDetailed by remember { mutableStateOf(true) }
    var archiveInstead by remember { mutableStateOf(true) }
    var freeUnlocked by remember { mutableStateOf(false) }
    var showPaywall by remember { mutableStateOf(false) }

    val steps = OnboardStep.entries
    val stepIndex = steps.indexOf(step)
    val last = step == OnboardStep.Pro

    val appContext = LocalContext.current.applicationContext
    val billing = remember {
        BillingManager(appContext) { productId, token -> vm.verifyGooglePurchase(productId, token) }
    }
    DisposableEffect(Unit) {
        billing.connect()
        onDispose { billing.endConnection() }
    }

    fun applyGoalTabs() {
        if (selectedGoals.isEmpty()) return
        val ordered = mutableListOf(TabId.DASHBOARD)
        Goal.entries.filter { it in selectedGoals }.forEach { g ->
            g.tabs.forEach { if (it !in ordered) ordered.add(it) }
        }
        // Only the preferred bottom slots — everything else stays under More.
        vm.setTabs(ordered.take(MAX_BOTTOM_TABS).map { it.id })
        if (Goal.BUDGET in selectedGoals) {
            vm.setBudgetRule(if (budgetDetailed) "off" else "50-30-20")
        }
    }

    fun finish() {
        if (finishing) return
        finishing = true
        applyGoalTabs()
        vm.setArchiveInsteadOfDelete(archiveInstead)
        vm.completeOnboarding()
    }

    fun goBack() {
        val i = steps.indexOf(step)
        if (i > 0) step = steps[i - 1]
    }

    fun goNext() {
        val i = steps.indexOf(step)
        if (i < steps.lastIndex) step = steps[i + 1]
    }

    Column(Modifier.authScreen().padding(horizontal = 24.dp)) {
        Row(
            Modifier.fillMaxWidth().padding(top = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (stepIndex > 0) {
                IconButton(onClick = { goBack() }, enabled = !finishing) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Ct.colors.text)
                }
            } else {
                Spacer(Modifier.width(48.dp))
            }
            Spacer(Modifier.weight(1f))
            Spacer(Modifier.width(48.dp))
        }

        Column(
            Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            when (step) {
                OnboardStep.Goals -> GoalsStep(
                    selected = selectedGoals,
                    budgetDetailed = budgetDetailed,
                    onToggle = { g ->
                        selectedGoals = if (g in selectedGoals) selectedGoals - g else selectedGoals + g
                    },
                    onBudgetDetailed = { budgetDetailed = it },
                )
                OnboardStep.Plan -> PlanStep(
                    selected = selectedGoals,
                    budgetDetailed = budgetDetailed,
                    archiveInstead = archiveInstead,
                    onArchiveInstead = { archiveInstead = it },
                    onEditGoals = { step = OnboardStep.Goals },
                )
                OnboardStep.Security -> SecurityStep()
                OnboardStep.Pro -> ProStep()
            }
        }

        Row(
            Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 8.dp),
            horizontalArrangement = Arrangement.Center,
        ) {
            steps.forEachIndexed { i, s ->
                Box(
                    Modifier
                        .padding(horizontal = 4.dp)
                        .width(if (i == stepIndex) 22.dp else 8.dp)
                        .height(8.dp)
                        .clip(RoundedCornerShape(50))
                        .background(if (i == stepIndex) Ct.colors.accent else Ct.colors.border)
                        .then(
                            if (i < stepIndex && !finishing) Modifier.clickable { step = s }
                            else Modifier,
                        ),
                )
            }
        }

        Column(
            Modifier.fillMaxWidth().padding(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            when {
                last && freeUnlocked -> {
                    Button(
                        onClick = { showPaywall = true },
                        enabled = !finishing,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent),
                    ) { Text("See Premium plans") }
                    TextButton(
                        onClick = { finish() },
                        enabled = !finishing,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            if (finishing) "Getting started…" else "Continue with Free",
                            color = Ct.colors.muted,
                        )
                    }
                }
                last -> {
                    Button(
                        onClick = { showPaywall = true },
                        enabled = !finishing,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent),
                    ) { Text("See Premium plans") }
                    TextButton(
                        onClick = { freeUnlocked = true },
                        enabled = !finishing,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Not now", color = Ct.colors.muted) }
                }
                else -> {
                    Button(
                        onClick = { goNext() },
                        enabled = !finishing,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent),
                    ) {
                        Text(
                            when (step) {
                                OnboardStep.Goals -> if (selectedGoals.isEmpty()) "Skip for now" else "Continue"
                                OnboardStep.Plan -> "Looks good"
                                else -> "Next"
                            },
                        )
                    }
                }
            }
        }
    }

    if (showPaywall) {
        CompositionLocalProvider(LocalBilling provides billing) {
            PaywallDialog(vm) {
                showPaywall = false
                freeUnlocked = true
            }
        }
    }
}

@Composable
private fun GoalsStep(
    selected: Set<Goal>,
    budgetDetailed: Boolean,
    onToggle: (Goal) -> Unit,
    onBudgetDetailed: (Boolean) -> Unit,
) {
    Text(
        "What brings you to FiHaven?",
        color = Ct.colors.text, fontSize = 26.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center,
    )
    Spacer(Modifier.height(10.dp))
    Text(
        "Pick one or more — we’ll put those tabs front and center. You can change this anytime.",
        color = Ct.colors.muted, fontSize = 15.sp, textAlign = TextAlign.Center,
    )
    Spacer(Modifier.height(20.dp))
    Goal.entries.forEach { goal ->
        val on = goal in selected
        Row(
            Modifier.fillMaxWidth().padding(vertical = 5.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(if (on) Ct.colors.accentBg else Ct.colors.surface)
                .border(1.dp, if (on) Ct.colors.accent else Ct.colors.border, RoundedCornerShape(14.dp))
                .clickable { onToggle(goal) }
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(goal.icon, null, tint = if (on) Ct.colors.accent else Ct.colors.muted, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(goal.title, color = Ct.colors.text, fontSize = 16.sp, fontWeight = FontWeight.Medium)
                Text(goal.blurb, color = Ct.colors.muted, fontSize = 12.sp)
            }
            Icon(
                if (on) Icons.Filled.CheckCircle else Icons.Filled.RadioButtonUnchecked,
                null,
                tint = if (on) Ct.colors.accent else Ct.colors.border,
                modifier = Modifier.size(22.dp),
            )
        }
    }
    if (Goal.BUDGET in selected) {
        Spacer(Modifier.height(16.dp))
        Text(
            "How do you like to budget?",
            color = Ct.colors.text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))
        BudgetChoice("Detailed — I’ll track categories myself", budgetDetailed) { onBudgetDetailed(true) }
        Spacer(Modifier.height(8.dp))
        BudgetChoice("Simple — use the 50/30/20 rule", !budgetDetailed) { onBudgetDetailed(false) }
    }
}

@Composable
private fun BudgetChoice(label: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) Ct.colors.accentBg else Ct.colors.surface)
            .border(1.dp, if (selected) Ct.colors.accent else Ct.colors.border, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            if (selected) Icons.Filled.CheckCircle else Icons.Filled.RadioButtonUnchecked,
            null,
            tint = if (selected) Ct.colors.accent else Ct.colors.border,
            modifier = Modifier.size(20.dp),
        )
        Spacer(Modifier.width(10.dp))
        Text(label, color = Ct.colors.text, fontSize = 14.sp)
    }
}

@Composable
private fun PlanStep(
    selected: Set<Goal>,
    budgetDetailed: Boolean,
    archiveInstead: Boolean,
    onArchiveInstead: (Boolean) -> Unit,
    onEditGoals: () -> Unit,
) {
    Text("Your FiHaven home", color = Ct.colors.text, fontSize = 26.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
    Spacer(Modifier.height(10.dp))
    Text(
        if (selected.isEmpty()) {
            "We’ll start you on the dashboard. You can pin features later in Settings → Customize tabs."
        } else {
            "Based on what you picked, these will sit in your bottom bar. Change anytime."
        },
        color = Ct.colors.muted, fontSize = 15.sp, textAlign = TextAlign.Center,
    )
    Spacer(Modifier.height(20.dp))
    Column(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Ct.colors.surface)
            .border(1.dp, Ct.colors.border, RoundedCornerShape(14.dp))
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Home", color = Ct.colors.muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        Text("Dashboard", color = Ct.colors.text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
        if (selected.isEmpty()) {
            Text("Default tabs — Bills, Cards, Spending, More", color = Ct.colors.muted, fontSize = 13.sp)
        } else {
            selected.forEach { g ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(g.icon, null, tint = Ct.colors.accent, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(10.dp))
                    Column {
                        Text(g.title, color = Ct.colors.text, fontSize = 15.sp)
                        Text(g.blurb, color = Ct.colors.muted, fontSize = 12.sp)
                    }
                }
            }
            if (Goal.BUDGET in selected) {
                Text(
                    if (budgetDetailed) "Budget style: detailed categories" else "Budget style: 50/30/20",
                    color = Ct.colors.muted, fontSize = 13.sp,
                )
            }
        }
    }
    Spacer(Modifier.height(12.dp))
    TextButton(onClick = onEditGoals, modifier = Modifier.fillMaxWidth()) {
        Text("Change goals", color = Ct.colors.accent)
    }
    Spacer(Modifier.height(12.dp))
    Row(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Ct.colors.surface)
            .border(1.dp, if (archiveInstead) Ct.colors.accent else Ct.colors.border, RoundedCornerShape(14.dp))
            .clickable { onArchiveInstead(!archiveInstead) }
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            if (archiveInstead) Icons.Filled.CheckCircle else Icons.Filled.RadioButtonUnchecked,
            null,
            tint = if (archiveInstead) Ct.colors.accent else Ct.colors.border,
            modifier = Modifier.size(22.dp),
        )
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text("Archive instead of delete", color = Ct.colors.text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
            Text(
                "Retire a bill, card, or loan without losing its history. Restore anytime.",
                color = Ct.colors.muted, fontSize = 12.sp,
            )
        }
    }
    Spacer(Modifier.height(8.dp))
    Column(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Ct.colors.accentBg)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("After this", color = Ct.colors.accent, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        checklistLine("Add a few bills or cards from those tabs")
        checklistLine("Mark what’s paid this month from Home")
        if (Goal.DEBT in selected) checklistLine("Open Payoff to see a debt-free date")
        if (Goal.REWARDS in selected) checklistLine("Ask Rewards which card to use")
    }
}

@Composable
private fun checklistLine(text: String) {
    Row(verticalAlignment = Alignment.Top) {
        Text("•", color = Ct.colors.accent, fontSize = 15.sp, modifier = Modifier.padding(end = 8.dp))
        Text(text, color = Ct.colors.text, fontSize = 14.sp)
    }
}

@Composable
private fun SecurityStep() {
    Box(
        Modifier.size(100.dp).clip(RoundedCornerShape(50)).background(Ct.colors.accent.copy(alpha = 0.12f)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Filled.Lock, null, tint = Ct.colors.accent, modifier = Modifier.size(44.dp))
    }
    Spacer(Modifier.height(20.dp))
    Text("Lock it down", color = Ct.colors.text, fontSize = 26.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
    Spacer(Modifier.height(12.dp))
    Text(
        "Your money data stays on your account. Turn on an authenticator, passkey, or biometric unlock anytime from Settings → Security — it takes about a minute.",
        color = Ct.colors.muted, fontSize = 16.sp, textAlign = TextAlign.Center,
    )
    Spacer(Modifier.height(20.dp))
    Column(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Ct.colors.surface)
            .border(1.dp, Ct.colors.border, RoundedCornerShape(14.dp))
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        securityRow("Authenticator app", "Codes that rotate every 30 seconds")
        securityRow("Passkeys", "Sign in with Face / fingerprint")
        securityRow("App lock", "Require biometrics when you leave FiHaven")
    }
}

@Composable
private fun securityRow(title: String, body: String) {
    Column {
        Text(title, color = Ct.colors.text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
        Text(body, color = Ct.colors.muted, fontSize = 13.sp)
    }
}

@Composable
private fun ProStep() {
    Box(
        Modifier.size(100.dp).clip(RoundedCornerShape(50)).background(Ct.colors.accent.copy(alpha = 0.12f)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Filled.WorkspacePremium, null, tint = Ct.colors.accent, modifier = Modifier.size(44.dp))
    }
    Spacer(Modifier.height(20.dp))
    Text("FiHaven Pro", color = Ct.colors.text, fontSize = 26.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
    Spacer(Modifier.height(12.dp))
    Text(
        "Free covers the basics. Pro unlocks planning tools that keep working across web, iOS, and Android.",
        color = Ct.colors.muted, fontSize = 16.sp, textAlign = TextAlign.Center,
    )
    Spacer(Modifier.height(20.dp))
    Column(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Ct.colors.surface)
            .border(1.dp, Ct.colors.border, RoundedCornerShape(14.dp))
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        proHighlights.forEach { (icon, text) ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, null, tint = Ct.colors.accent, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(12.dp))
                Text(text, color = Ct.colors.text, fontSize = 15.sp)
            }
        }
    }
}
