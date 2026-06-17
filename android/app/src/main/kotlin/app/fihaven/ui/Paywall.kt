package app.fihaven.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Autorenew
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Stars
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.android.billingclient.api.ProductDetails
import app.fihaven.AppViewModel
import app.fihaven.billing.BillingManager
import app.fihaven.ui.theme.Ct
import java.text.DateFormat
import java.util.Date

/** The Play Billing client, provided by MainScaffold; null outside the
 *  signed-in tree. */
val LocalBilling = staticCompositionLocalOf<BillingManager?> { null }

enum class ProFeature(val title: String, val blurb: String, val icon: ImageVector) {
    PAYOFF("Payoff Planner", "See snowball & avalanche plans and your debt-free date.", Icons.AutoMirrored.Filled.ShowChart),
    CALENDAR("Calendar", "View every due date on a monthly calendar.", Icons.Filled.CalendarMonth),
    HISTORY("Payment History", "Browse and search your full payment history.", Icons.Filled.History),
    REWARDS("Rewards Optimizer", "See which card to use for every purchase to earn the most.", Icons.Filled.Stars),
    SUBSCRIPTIONS("Subscription Finder", "Find recurring charges, price hikes, and unused subscriptions.", Icons.Filled.Autorenew),
}

private fun Context.findActivity(): Activity? {
    var c: Context? = this
    while (c is ContextWrapper) {
        if (c is Activity) return c
        c = c.baseContext
    }
    return null
}

/** Gate: show [content] when Pro, otherwise the locked screen. Pass
 *  [onBack] for sub-routes so the locked screen still has a way out. */
@Composable
fun ProGate(
    vm: AppViewModel,
    feature: ProFeature,
    padding: androidx.compose.foundation.layout.PaddingValues,
    onBack: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val ent by vm.entitlement.collectAsStateWithLifecycle()
    if (ent.pro) content() else ProLockedScreen(vm, feature, padding, onBack)
}

@Composable
fun ProBadge() {
    Surface(shape = RoundedCornerShape(50), color = Ct.colors.accentBg) {
        Text(
            "PRO", color = Ct.colors.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold,
            letterSpacing = 1.sp, modifier = Modifier.padding(horizontal = 9.dp, vertical = 3.dp),
        )
    }
}

@Composable
private fun ProLockedScreen(
    vm: AppViewModel,
    feature: ProFeature,
    padding: androidx.compose.foundation.layout.PaddingValues,
    onBack: (() -> Unit)?,
) {
    var showPaywall by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        if (onBack != null) ScreenHeader(feature.title, onBack = onBack)
        Column(
            Modifier.fillMaxWidth().weight(1f).padding(28.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(feature.icon, null, tint = Ct.colors.accent, modifier = Modifier.size(44.dp))
            Spacer(Modifier.height(12.dp))
            ProBadge()
            Spacer(Modifier.height(10.dp))
            Text(feature.title, color = Ct.colors.text, fontSize = 24.sp, fontWeight = FontWeight.ExtraBold)
            Spacer(Modifier.height(8.dp))
            Text(feature.blurb, color = Ct.colors.muted, fontSize = 15.sp, textAlign = TextAlign.Center)
            Spacer(Modifier.height(18.dp))
            Button(
                onClick = { showPaywall = true },
                colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent),
            ) { Text("Unlock FiHaven Pro") }
        }
    }
    if (showPaywall) PaywallDialog(vm) { showPaywall = false }
}

private val perks = listOf(
    "Payoff planner — snowball & avalanche plans + your debt-free date",
    "Due-date calendar — every bill and card on a monthly view",
    "Payment history — search and review everything you've paid",
    "Rewards optimizer — pick the best card for each purchase",
    "Subscription finder — spot recurring charges and price hikes",
    "Category budgets — set limits and track spending by category",
    "Bank linking — auto-fetch balances via Plaid (optional)",
    "Autopay mark — auto-mark autopay items paid on their due date",
    "Data export — download your full account any time",
)

@Composable
fun PaywallDialog(vm: AppViewModel, onDismiss: () -> Unit) {
    val ent by vm.entitlement.collectAsStateWithLifecycle()
    val billing = LocalBilling.current
    val products: List<ProductDetails> =
        if (billing != null) billing.products.collectAsStateWithLifecycle().value else emptyList()
    val activity = LocalContext.current.findActivity()
    var showRedeem by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = Ct.colors.bg,
            modifier = Modifier.fillMaxWidth(0.95f).fillMaxHeight(0.92f),
        ) {
            Column(Modifier.fillMaxSize()) {
                Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick = onDismiss) { Text("Close", color = Ct.colors.muted) }
                }
                Column(
                    Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(18.dp),
                ) {
                    Wordmark(28)
                    ProBadge()
                    Text(
                        "Unlock the planning tools that turn your bills into a payoff plan.",
                        color = Ct.colors.muted, fontSize = 15.sp, textAlign = TextAlign.Center,
                    )
                    CtCard {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            perks.forEach { p ->
                                Row {
                                    Text("•  ", color = Ct.colors.accent, fontWeight = FontWeight.Bold)
                                    Text(p, color = Ct.colors.text, fontSize = 14.sp)
                                }
                            }
                        }
                    }

                    if (ent.pro) {
                        ActiveCard(ent)
                    } else if (products.isEmpty()) {
                        Text(
                            "Subscriptions aren’t available right now. You can still redeem a code below.",
                            color = Ct.colors.muted, fontSize = 13.sp, textAlign = TextAlign.Center,
                        )
                    } else {
                        products.forEach { product ->
                            OutlinedButton(
                                onClick = { activity?.let { billing?.launchPurchase(it, product) } },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text(BillingManager.period(product) ?: product.name,
                                    color = Ct.colors.text, modifier = Modifier.weight(1f))
                                Text(BillingManager.formattedPrice(product) ?: "",
                                    color = Ct.colors.text, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }

                    TextButton(onClick = { showRedeem = true }) {
                        Text("Have a promo code?", color = Ct.colors.accent, fontWeight = FontWeight.SemiBold)
                    }
                    TextButton(onClick = { vm.restore() }) {
                        Text("Restore purchases", color = Ct.colors.muted)
                    }
                    Text(
                        "Subscriptions renew automatically until cancelled. Manage in Google Play.",
                        color = Ct.colors.muted, fontSize = 11.sp, textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(8.dp))
                }
            }
        }
    }

    if (showRedeem) RedeemCodeDialog(vm) { showRedeem = false }
}

@Composable
private fun ActiveCard(ent: app.fihaven.core.model.Entitlement) {
    CtCard {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Filled.CheckCircle, null, tint = Ct.colors.green, modifier = Modifier.size(32.dp))
            Spacer(Modifier.height(6.dp))
            Text("You’re on FiHaven Pro", color = Ct.colors.text, fontWeight = FontWeight.SemiBold)
            val expiresAt = ent.expiresAt
            val line = when {
                expiresAt != null -> {
                    val d = DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(expiresAt))
                    val verb = if (ent.autoRenew == true) "Renews " else "Expires "
                    verb + d
                }
                ent.source == "promo" -> "Granted by promo code."
                else -> null
            }
            if (line != null) {
                Spacer(Modifier.height(4.dp))
                Text(line, color = Ct.colors.muted, fontSize = 13.sp)
            }
        }
    }
}

@Composable
fun RedeemCodeDialog(vm: AppViewModel, onDismiss: () -> Unit) {
    var code by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var success by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(shape = RoundedCornerShape(20.dp), color = Ct.colors.surface,
            modifier = Modifier.fillMaxWidth(0.92f)) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Redeem a code", color = Ct.colors.text, fontSize = 18.sp,
                        fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    TextButton(onClick = onDismiss) { Text("Close", color = Ct.colors.muted) }
                }
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it.uppercase() },
                    label = { Text("Promo code") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(
                    onClick = {
                        busy = true; error = null; success = null
                        vm.redeemPromo(code) { result, err ->
                            busy = false
                            when {
                                err != null -> error = err
                                result?.kind == "store_offer" -> success = "Open Google Play to apply your offer."
                                result?.entitlement?.pro == true -> success = "You’re now on FiHaven Pro 🎉"
                            }
                        }
                    },
                    enabled = !busy && code.isNotBlank(),
                    colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (busy) CircularProgressIndicator(Modifier.size(18.dp), color = androidx.compose.ui.graphics.Color.White)
                    else Text("Redeem")
                }
                success?.let { Text(it, color = Ct.colors.green, fontSize = 14.sp) }
                error?.let { Text(it, color = Ct.colors.red, fontSize = 14.sp) }
            }
        }
    }
}
