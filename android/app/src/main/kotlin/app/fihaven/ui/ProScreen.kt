package app.fihaven.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.fihaven.AppViewModel
import app.fihaven.ui.theme.Ct
import java.text.DateFormat
import java.util.Date

/** "FiHaven Pro" — a standalone More screen for subscription status,
 *  upgrade/manage, and promo redemption (lifted out of Settings). */
@Composable
fun ProScreen(vm: AppViewModel, padding: PaddingValues, onBack: (() -> Unit)? = null) {
    val ent by vm.entitlement.collectAsStateWithLifecycle()
    var showPaywall by remember { mutableStateOf(false) }
    var showRedeem by remember { mutableStateOf(false) }

    val status = when {
        !ent.pro -> "Free"
        ent.source == "promo" -> "Pro · Promo"
        ent.plan == "monthly" -> "Pro · Monthly"
        ent.plan == "yearly" -> "Pro · Yearly"
        ent.plan == "three_month" -> "Pro · 3 months"
        ent.plan == "trial" -> "Pro · Trial"
        else -> "Pro"
    }

    val provider = when (ent.source) {
        "stripe" -> "Stripe"
        "apple" -> "App Store"
        "google" -> "Play Store"
        "promo" -> "Promo Code"
        null -> null
        else -> ent.source?.replaceFirstChar { it.uppercase() }
    }

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        ScreenHeader("FiHaven Pro", onBack = onBack)
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Wordmark(30)
            ProBadge()
            Text(
                "Unlock the payoff planner, calendar, and payment history.",
                color = Ct.colors.muted, fontSize = 14.sp, textAlign = TextAlign.Center,
            )
            CtCard {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text("Status", color = Ct.colors.muted, modifier = Modifier.weight(1f))
                        Text(status, color = if (ent.pro) Ct.colors.green else Ct.colors.text,
                            fontWeight = FontWeight.SemiBold)
                    }
                    if (ent.pro && provider != null) {
                        Row(Modifier.fillMaxWidth()) {
                            Text("Provider", color = Ct.colors.muted, fontSize = 13.sp, modifier = Modifier.weight(1f))
                            Text(provider, color = Ct.colors.text, fontSize = 13.sp)
                        }
                    }
                    val exp = ent.expiresAt
                    if (ent.pro && exp != null) {
                        Row(Modifier.fillMaxWidth()) {
                            Text(if (ent.autoRenew == true) "Renews" else "Expires",
                                color = Ct.colors.muted, fontSize = 13.sp, modifier = Modifier.weight(1f))
                            Text(DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(exp)),
                                color = Ct.colors.muted, fontSize = 13.sp)
                        }
                    }
                }
            }
            Button(
                onClick = { showPaywall = true },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent),
            ) { Text(if (ent.pro) "Manage Pro" else "Upgrade to Pro") }
            TextButton(onClick = { showRedeem = true }) {
                Text("Redeem a code", color = Ct.colors.accent, fontWeight = FontWeight.SemiBold)
            }
        }
    }

    if (showPaywall) PaywallDialog(vm) { showPaywall = false }
    if (showRedeem) RedeemCodeDialog(vm) { showRedeem = false }
}
