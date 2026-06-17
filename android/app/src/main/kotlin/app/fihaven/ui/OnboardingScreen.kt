package app.fihaven.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.Autorenew
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Stars
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.fihaven.AppViewModel
import app.fihaven.ui.theme.Ct

private data class OnbPage(val icon: ImageVector, val title: String, val body: String)

/** What a new user wants from FiHaven. Each goal surfaces its tabs in the
 *  bottom bar so people land on the features they actually came for. */
private enum class Goal(val title: String, val icon: ImageVector, val tabs: List<TabId>) {
    BILLS("Stay on top of bills", Icons.AutoMirrored.Filled.ReceiptLong, listOf(TabId.BILLS, TabId.CALENDAR)),
    DEBT("Pay off credit cards & debt", Icons.Filled.CreditCard, listOf(TabId.CARDS, TabId.PAYOFF)),
    BUDGET("Budget each month", Icons.Filled.PieChart, listOf(TabId.BUDGET, TabId.SPENDING)),
    REWARDS("Maximize card rewards", Icons.Filled.Stars, listOf(TabId.REWARDS)),
    SUBSCRIPTIONS("Track subscriptions", Icons.Filled.Autorenew, listOf(TabId.SUBSCRIPTIONS)),
}

/// First-run onboarding, shown once after a new account confirms its email
/// (gated on `user.onboarded`). A goals question tailors the tab bar, then a
/// short tour. Mirrors the web /welcome flow.
@Composable
fun OnboardingScreen(vm: AppViewModel) {
    var step by remember { mutableIntStateOf(0) }
    var finishing by remember { mutableStateOf(false) }
    var selectedGoals by remember { mutableStateOf(setOf<Goal>()) }
    val pages = remember {
        listOf(
            OnbPage(Icons.Filled.Lock, "Secure your account",
                "Add two-factor authentication anytime from Settings → Security for an extra layer of protection."),
            OnbPage(Icons.AutoMirrored.Filled.ReceiptLong, "Track bills & cards",
                "Add recurring bills and credit cards — including 0% promo periods — from the Bills and Cards tabs."),
            OnbPage(Icons.Filled.WorkspacePremium, "FiHaven Pro",
                "Unlock the payoff planner, calendar, and full history. One subscription works across web, iOS, and Android."),
        )
    }
    // Step 0 is the goals question; steps 1..pages.size are the tour.
    val totalSteps = pages.size + 1
    val goalsStep = step == 0
    val last = step == totalSteps - 1

    fun applyGoalTabs() {
        if (selectedGoals.isEmpty()) return
        val ordered = mutableListOf(TabId.DASHBOARD)
        Goal.entries.filter { it in selectedGoals }.forEach { g ->
            g.tabs.forEach { if (it !in ordered) ordered.add(it) }
        }
        TabId.entries.forEach { if (it !in ordered) ordered.add(it) }
        vm.setTabs(ordered.map { it.id })
    }

    fun finish() {
        if (!finishing) {
            finishing = true
            applyGoalTabs()
            vm.completeOnboarding()
        }
    }

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(horizontal = 24.dp)) {
        Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = { finish() }, enabled = !finishing) {
                Text("Skip", color = Ct.colors.muted)
            }
        }
        Spacer(Modifier.weight(1f))

        if (goalsStep) {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("What brings you to FiHaven?", color = Ct.colors.text, fontSize = 26.sp,
                    fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                Spacer(Modifier.height(10.dp))
                Text("Pick what matters — we'll put those features front and center. You can change this anytime in Settings.",
                    color = Ct.colors.muted, fontSize = 15.sp, textAlign = TextAlign.Center)
                Spacer(Modifier.height(20.dp))
                Goal.entries.forEach { goal ->
                    val selected = goal in selectedGoals
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 5.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(if (selected) Ct.colors.accentBg else Ct.colors.surface)
                            .border(1.dp, if (selected) Ct.colors.accent else Ct.colors.border, RoundedCornerShape(14.dp))
                            .clickable {
                                selectedGoals = if (selected) selectedGoals - goal else selectedGoals + goal
                            }
                            .padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(goal.icon, contentDescription = null,
                            tint = if (selected) Ct.colors.accent else Ct.colors.muted,
                            modifier = Modifier.size(22.dp))
                        Spacer(Modifier.width(12.dp))
                        Text(goal.title, color = Ct.colors.text, fontSize = 16.sp,
                            fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                        Icon(
                            if (selected) Icons.Filled.CheckCircle else Icons.Filled.RadioButtonUnchecked,
                            contentDescription = null,
                            tint = if (selected) Ct.colors.accent else Ct.colors.border,
                            modifier = Modifier.size(22.dp),
                        )
                    }
                }
            }
        } else {
            val page = pages[step - 1]
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    Modifier.size(120.dp).clip(RoundedCornerShape(50))
                        .background(Ct.colors.accent.copy(alpha = 0.12f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(page.icon, contentDescription = null, tint = Ct.colors.accent, modifier = Modifier.size(50.dp))
                }
                Spacer(Modifier.height(20.dp))
                Text(page.title, color = Ct.colors.text, fontSize = 26.sp,
                    fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                Spacer(Modifier.height(12.dp))
                Text(page.body, color = Ct.colors.muted, fontSize = 16.sp, textAlign = TextAlign.Center)
            }
        }

        Spacer(Modifier.weight(1f))
        Row(Modifier.fillMaxWidth().padding(bottom = 20.dp), horizontalArrangement = Arrangement.Center) {
            repeat(totalSteps) { i ->
                Box(
                    Modifier.padding(horizontal = 4.dp)
                        .width(if (i == step) 22.dp else 8.dp).height(8.dp)
                        .clip(RoundedCornerShape(50))
                        .background(if (i == step) Ct.colors.accent else Ct.colors.border),
                )
            }
        }
        Button(
            onClick = { if (!last) step++ else finish() },
            enabled = !finishing,
            modifier = Modifier.fillMaxWidth().padding(bottom = 30.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent),
        ) {
            Text(
                when {
                    goalsStep -> if (selectedGoals.isEmpty()) "Skip for now" else "Continue"
                    !last -> "Next"
                    finishing -> "Getting started…"
                    else -> "Get started"
                },
            )
        }
    }
}
