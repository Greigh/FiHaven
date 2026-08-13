package app.fihaven.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
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
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
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
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
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

/** Plan pill — "PRO" or "FAMILY". Two tiers gate different things. */
@Composable
fun PlanBadge(text: String) {
    Surface(shape = RoundedCornerShape(50), color = Ct.colors.accentBg) {
        Text(
            text, color = Ct.colors.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold,
            letterSpacing = 1.sp, modifier = Modifier.padding(horizontal = 9.dp, vertical = 3.dp),
        )
    }
}

@Composable
fun ProBadge() = PlanBadge("PRO")

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

// The three perks that carry the pitch. Nine bullets above the price meant a
// wall to scroll past before learning what Pro costs, so the rest moved behind
// "See everything in Pro".
//
// Family sharing is deliberately absent from both lists: creating a household
// needs the separate Family subscription (billing.js: HOUSEHOLD_MAX_PRO is 0),
// so it gets its own card below rather than a bullet here.
private val topPerks = listOf(
    "Payoff planner — snowball & avalanche plans + your debt-free date",
    "Rewards optimizer — pick the best card for each purchase",
    "Subscription finder — spot recurring charges and price hikes",
)

private val morePerks = listOf(
    "Due-date calendar — every bill and card on a monthly view",
    "Payment history — search and review everything you've paid",
    "Category budgets — set limits and track spending by category",
    "Bank linking — auto-fetch balances via Plaid (optional)",
    "Autopay mark — auto-mark autopay items paid on their due date",
    "Data export — download your full account any time",
)

@Composable
fun PaywallDialog(vm: AppViewModel, onDismiss: () -> Unit) {
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
                PaywallContent(
                    vm,
                    Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
                )
            }
        }
    }
}

/**
 * The paywall itself, with no presentation chrome of its own — so the same
 * perks, plans, and legal footer can be a dialog over a locked feature *or*
 * the body of the Pro screen, where putting them behind an "Upgrade" button
 * only added a tap. The caller supplies the scrolling [modifier].
 */
@Composable
fun PaywallContent(vm: AppViewModel, modifier: Modifier = Modifier) {
    val ent by vm.entitlement.collectAsStateWithLifecycle()
    // Collected so the Manage button re-renders once billing status lands;
    // manageButtonLabel is what actually reads it.
    @Suppress("UNUSED_VARIABLE")
    val billingPortal by vm.billingPortal.collectAsStateWithLifecycle()
    val billing = LocalBilling.current
    val products: List<ProductDetails> =
        if (billing != null) billing.products.collectAsStateWithLifecycle().value else emptyList()
    val activity = LocalContext.current.findActivity()
    val context = LocalContext.current
    val billingNote = vm.billingNote(ent)
    val manageLabel = vm.manageButtonLabel(ent)
    // Null means "nothing tapped yet", which resolves to yearly below — so the
    // preselection survives products arriving late from Play without an effect
    // to re-seed it.
    var selectedId by remember { mutableStateOf<String?>(null) }
    var showAllPerks by remember { mutableStateOf(false) }

    Column(
        modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Wordmark(28)
        ProBadge()
        // The promise, at title weight. This used to be muted 15sp body copy,
        // which read as a caption under the wordmark rather than as the reason
        // to keep scrolling.
        Text(
            "Turn your bills into a payoff plan.",
            color = Ct.colors.text, fontSize = 24.sp, fontWeight = FontWeight.ExtraBold,
            textAlign = TextAlign.Center,
        )
        Text(
            "Every planning tool FiHaven has, on web, iOS and Android.",
            color = Ct.colors.muted, fontSize = 15.sp, textAlign = TextAlign.Center,
        )
        CtCard {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                topPerks.forEach { PerkRow(it) }
                if (showAllPerks) morePerks.forEach { PerkRow(it) }
                TextButton(
                    onClick = { showAllPerks = !showAllPerks },
                    contentPadding = PaddingValues(0.dp),
                ) {
                    Text(
                        if (showAllPerks) "Show less" else "See everything in Pro",
                        color = Ct.colors.accent, fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }

        // Family is a separate subscription, not a Pro tier — so it
        // gets its own card rather than sitting in the plan list.
        val familyProduct = products.firstOrNull { it.productId == BillingManager.FAMILY }
        val proProducts = products.filter { it.productId != BillingManager.FAMILY }
        val onFamily = ent.plan == "family"
        val buy = { p: ProductDetails -> activity?.let { billing?.launchPurchase(it, p) }; Unit }

        if (ent.pro) {
            ActiveCard(ent)
            billingNote?.let {
                Text(it, color = Ct.colors.muted, fontSize = 13.sp, textAlign = TextAlign.Center)
            }
            // An existing solo-Pro subscriber had no way to reach Family.
            // Play treats this as a plan change (see BillingManager).
            if (!onFamily && familyProduct != null) {
                FamilyOption(familyProduct, isUpgrade = true) { buy(familyProduct) }
            }
            manageLabel?.let { label ->
                OutlinedButton(
                    onClick = { vm.manageSubscription(context) },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(label, color = Ct.colors.text) }
            }
        } else if (products.isEmpty()) {
            Text(
                "Subscriptions aren’t available right now. Please check your connection and try again.",
                color = Ct.colors.muted, fontSize = 13.sp, textAlign = TextAlign.Center,
            )
        } else {
            // Best value first, and preselected: yearly leads unless this
            // storefront carries no yearly SKU.
            val sorted = proProducts.sortedByDescending { BillingManager.intervalRank(it) }
            val monthly = sorted.firstOrNull { BillingManager.intervalRank(it) == 2 }
            val selected = sorted.firstOrNull { it.productId == selectedId }
                ?: sorted.firstOrNull { BillingManager.isYearly(it) }
                ?: sorted.firstOrNull()
            sorted.forEach { product ->
                PlanRow(
                    product = product,
                    selected = product.productId == selected?.productId,
                    savings = monthly?.let { BillingManager.savingsPercent(product, it) },
                    onClick = { selectedId = product.productId },
                )
            }
            selected?.let { product -> PurchaseCta(product) { buy(product) } }
            familyProduct?.let { p ->
                FamilyOption(p, isUpgrade = false) { buy(p) }
            }
        }

        // Restore, the store's terms and the required links are one block: the
        // 18dp that separates the cards above read as dead space between three
        // lines of fine print.
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            // Re-present Play's own purchases to the server before re-reading
            // the entitlement — the server only knows what it's been told, so
            // asking it alone restores nothing after a reinstall.
            TextButton(onClick = { billing?.replayPurchases(); vm.restore() }) {
                Text("Restore purchases", color = Ct.colors.muted)
            }
            vm.storeTerms(ent)?.let { terms ->
                Text(terms, color = Ct.colors.muted, fontSize = 11.sp, textAlign = TextAlign.Center)
            }
            val uriHandler = LocalUriHandler.current
            Row(horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { uriHandler.openUri("https://fihaven.app/privacy") }) {
                    Text("Privacy Policy", color = Ct.colors.accent, fontSize = 12.sp)
                }
                Text("·", color = Ct.colors.muted, fontSize = 12.sp)
                TextButton(onClick = { uriHandler.openUri("https://fihaven.app/terms") }) {
                    Text("Terms of Use (EULA)", color = Ct.colors.accent, fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
private fun PerkRow(text: String) {
    Row {
        Text("•  ", color = Ct.colors.accent, fontWeight = FontWeight.Bold)
        Text(text, color = Ct.colors.text, fontSize = 14.sp)
    }
}

/**
 * "Save 37%". Green rather than accent-coloured: it sits on a plan row that
 * turns accent-tinted when selected, where another accent pill would vanish —
 * and it reads as a saving, not as a tier like PRO / FAMILY.
 */
@Composable
private fun SavingsBadge(percent: Int) {
    Surface(shape = RoundedCornerShape(50), color = Ct.colors.greenBg) {
        Text(
            "Save $percent%",
            color = Ct.colors.green, fontSize = 11.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
        )
    }
}

/**
 * A plan row now *selects* rather than buying. Tapping a row used to launch the
 * Play purchase flow immediately, which made a mis-tap a purchase attempt and
 * left no way to compare the plans first.
 */
@Composable
private fun PlanRow(
    product: ProductDetails,
    selected: Boolean,
    savings: Int?,
    onClick: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = if (selected) Ct.colors.accentBg else Ct.colors.surface,
        border = BorderStroke(
            if (selected) 2.dp else 1.dp,
            if (selected) Ct.colors.accent else Ct.colors.accent.copy(alpha = 0.25f),
        ),
        modifier = Modifier
            .fillMaxWidth()
            .selectable(selected = selected, role = Role.RadioButton, onClick = onClick),
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            // The row itself carries the click and the selection semantics, so
            // the button is decorative — a second tap target reading out its own
            // "selected" state would be announced twice.
            RadioButton(
                selected = selected,
                onClick = null,
                colors = RadioButtonDefaults.colors(
                    selectedColor = Ct.colors.accent,
                    unselectedColor = Ct.colors.muted,
                ),
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        BillingManager.planTitle(product),
                        color = Ct.colors.text,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (savings != null) {
                        Spacer(Modifier.width(6.dp))
                        SavingsBadge(savings)
                    }
                }
                // Play's subscription policy, like Apple's Guideline 3.1.2,
                // wants the length and price of every plan visible — on every
                // row, not only the selected one.
                BillingManager.period(product)?.let { len ->
                    Text(len, color = Ct.colors.muted, fontSize = 12.sp)
                }
                BillingManager.perMonthLabel(product)?.let { per ->
                    Text(per, color = Ct.colors.muted, fontSize = 12.sp)
                }
                // The trial has to be stated, not just silently applied at
                // purchase time.
                BillingManager.introOffer(product)?.let { intro ->
                    Text(
                        intro,
                        color = Ct.colors.green,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
            Spacer(Modifier.width(8.dp))
            Text(
                BillingManager.formattedPrice(product) ?: "",
                color = Ct.colors.text,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

/**
 * The one primary button, plus the exact terms of whatever is selected.
 *
 * The button never names a price the purchase won't actually charge: when a
 * free trial applies it says so and the line below spells out what it renews
 * into. An introductory figure on the button with the real one out of sight is
 * the pattern Play's subscription policy exists to stop.
 */
@Composable
private fun PurchaseCta(product: ProductDetails, onBuy: () -> Unit) {
    Column(
        Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        val trial = BillingManager.freeTrialLength(product)
        Button(
            onClick = onBuy,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent),
        ) { Text(if (trial != null) "Start $trial free" else "Subscribe") }
        val terms = BillingManager.introOffer(product)?.let { "$it. Cancel before it renews." }
            ?: BillingManager.periodUnit(product)?.let { unit ->
                "${BillingManager.formattedPrice(product)}/$unit, auto-renewing."
            }
        terms?.let {
            Text(it, color = Ct.colors.muted, fontSize = 12.sp, textAlign = TextAlign.Center)
        }
        Text(
            "Cancel anytime · Your data is never sold",
            color = Ct.colors.muted, fontSize = 12.sp, textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun ActiveCard(ent: app.fihaven.core.model.Entitlement) {
    CtCard {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Filled.CheckCircle, null, tint = Ct.colors.green, modifier = Modifier.size(32.dp))
            Spacer(Modifier.height(6.dp))
            Text(
                if (ent.plan == "family") "You’re on FiHaven Family" else "You’re on FiHaven Pro",
                color = Ct.colors.text, fontWeight = FontWeight.SemiBold,
            )
            ent.source?.let { source ->
                val label = when (source) {
                    "paddle" -> "FiHaven.app"
                    "stripe" -> "Stripe"
                    "google" -> "Play Store"
                    "promo" -> "Promo Code"
                    "comp" -> "Complimentary"
                    else -> source.replaceFirstChar { it.uppercase() }
                }
                Spacer(Modifier.height(4.dp))
                Text("Provider: $label", color = Ct.colors.muted, fontSize = 13.sp)
            }
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

/**
 * The Family subscription, presented as its own option rather than a Pro perk.
 * It is a separate SKU (`app.fihaven.pro.family.yearly` on Play) and the only
 * plan the server grants a shared household to — see `billing.js`
 * `householdMaxFor`.
 *
 * [isUpgrade] is true when the user already has solo Pro, in which case Play
 * runs a plan change (BillingManager passes the old purchase token).
 */
@Composable
private fun FamilyOption(product: ProductDetails, isUpgrade: Boolean, onClick: () -> Unit) {
    CtCard {
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    PlanBadge("FAMILY")
                    Spacer(Modifier.height(6.dp))
                    Text(
                        BillingManager.planTitle(product),
                        color = Ct.colors.text,
                        fontWeight = FontWeight.SemiBold,
                    )
                    BillingManager.period(product)?.let { len ->
                        Text(len, color = Ct.colors.muted, fontSize = 12.sp)
                    }
                }
                Text(
                    BillingManager.formattedPrice(product) ?: "",
                    color = Ct.colors.text,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Text(
                "Everything in Pro, plus a shared household — share bills, cards & goals " +
                    "with up to 3 people. Joining a household is always free.",
                color = Ct.colors.muted, fontSize = 13.sp,
            )
            Button(
                onClick = onClick,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent),
            ) { Text(if (isUpgrade) "Upgrade to Family" else "Get the Family plan") }
        }
    }
}
