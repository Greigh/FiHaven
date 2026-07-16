package app.fihaven.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.fihaven.core.model.plaidUpdateBalances
import app.fihaven.core.model.plaidUpdatePurchases
import app.fihaven.core.model.plaidBalanceMode
import app.fihaven.core.model.subscriptionDetectMode
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.fihaven.AppViewModel
import app.fihaven.core.Money
import app.fihaven.core.net.PlaidItem
import app.fihaven.core.net.PlaidStatus
import app.fihaven.ui.theme.Ct
import com.plaid.link.OnLoadCallback
import com.plaid.link.OpenPlaidLink
import com.plaid.link.Plaid
import com.plaid.link.PlaidLinkSession
import com.plaid.link.configuration.linkTokenConfiguration
import com.plaid.link.result.LinkError
import com.plaid.link.result.LinkExit
import com.plaid.link.result.LinkSuccess
import kotlinx.coroutines.launch

/// Pro-gated bank linking via Plaid's native Link SDK. Status, balances,
/// and disconnect all run through the existing /api/plaid endpoints; the
/// "Connect" button opens Plaid Link with a server-issued link token and
/// exchanges the resulting public token back to the server.
@Composable
fun BankDialog(vm: AppViewModel, onDone: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var status by remember { mutableStateOf<PlaidStatus?>(null) }
    var msg by remember { mutableStateOf<BankMessage?>(null) }
    var busy by remember { mutableStateOf(false) }
    // Non-null while an update-mode (reconnect) Link session is open, so the
    // success callback marks the item repaired instead of exchanging a token.
    var pendingRepairItemId by remember { mutableStateOf<Int?>(null) }
    // Plaid 6.x preloads a single-use session before opening; held here so the
    // onLoad callback can launch it once it's ready, then retired on any result.
    var session by remember { mutableStateOf<PlaidLinkSession?>(null) }
    // Shown once, right after a bank is linked (see the import-gate note below).
    var showImportPrompt by remember { mutableStateOf(false) }
    var showBalancePrompt by remember { mutableStateOf(false) }

    suspend fun load() { status = runCatching { vm.api.plaidStatus() }.getOrNull() }
    LaunchedEffect(Unit) { load() }

    val launcher = rememberLauncherForActivityResult(OpenPlaidLink()) { result ->
        session = null
        when (result) {
            is LinkSuccess -> {
                val repairId = pendingRepairItemId
                pendingRepairItemId = null
                scope.launch {
                    val ok = if (repairId != null) {
                        msg = BankMessage.info("Reconnecting…")
                        runCatching { vm.api.plaidRepaired(repairId) }.isSuccess
                    } else {
                        msg = BankMessage.info("Linking…")
                        runCatching { vm.api.plaidExchange(result.publicToken) }.isSuccess
                    }
                    msg = BankMessage.result(
                        ok,
                        if (repairId != null) "Bank reconnected." else "Bank linked.",
                        "Could not finish. Please try again.",
                    )
                    // Linking on its own does nothing — both import gates are off
                    // by default. Ask now rather than leaving the user with a
                    // connected bank and an empty Spending tab.
                    if (ok && repairId == null) showImportPrompt = true
                    load()
                }
            }
            is LinkExit -> {
                val repairing = pendingRepairItemId != null
                pendingRepairItemId = null
                // `result.error` is set only when Link itself failed; a plain
                // user close leaves it null. Don't report a failure as a cancel.
                msg = plaidExitMessage(
                    result.error,
                    cancelled = if (repairing) "Reconnect cancelled." else "Linking cancelled.",
                )
            }
        }
    }

    // Plaid 6.x: build a preloading Link session and open it once onLoad signals
    // it's ready. (5.x's FastOpenPlaidLink + Plaid.create(application, …) is gone.)
    fun openPlaidLink(token: String) {
        val config = linkTokenConfiguration {
            this.token = token
            onLoad = OnLoadCallback { session?.let { launcher.launch(it) } }
        }
        session = Plaid.createPlaidLinkSession(context, config)
    }

    fun connect() {
        busy = true
        msg = BankMessage.info("Opening your bank…")
        scope.launch {
            val token = runCatching { vm.api.plaidLinkToken() }.getOrNull()
            busy = false
            if (token == null) {
                msg = BankMessage.error("Could not start linking. Please try again.")
                return@launch
            }
            msg = null
            openPlaidLink(token)
        }
    }

    // Update mode: re-auth an item flagged login_required, or (accountSelection)
    // add newly-available accounts after a NEW_ACCOUNTS_AVAILABLE webhook.
    fun reconnect(id: Int, accountSelection: Boolean = false) {
        busy = true
        msg = BankMessage.info(if (accountSelection) "Opening your bank…" else "Reopening your bank…")
        scope.launch {
            val token = runCatching { vm.api.plaidLinkToken(id, accountSelection) }.getOrNull()
            busy = false
            if (token == null) {
                msg = BankMessage.error("Could not start reconnect. Please try again.")
                return@launch
            }
            msg = null
            pendingRepairItemId = id
            openPlaidLink(token)
        }
    }

    FormDialog("Bank connections", saveEnabled = false, onSave = {}, onDismiss = onDone) {
        Text(
            "Optionally link a bank with Plaid to auto-fetch balances. FiHaven works fully by hand, so a dropped connection never breaks your dashboard.",
            color = Ct.colors.muted, fontSize = 13.sp,
        )
        when (val s = status) {
            null -> Text("Loading…", color = Ct.colors.muted, fontSize = 14.sp)
            else -> when {
                !s.configured -> Text("Bank linking isn’t enabled on the server this app is connected to. Bank linking needs Plaid credentials configured there; manual entry works regardless.", color = Ct.colors.muted, fontSize = 14.sp)
                !s.pro -> Text("Linking your bank is a Pro feature. Upgrade from the Get Pro tab to connect an account.",
                    color = Ct.colors.text, fontSize = 14.sp)
                else -> {
                    if (s.items.isEmpty()) {
                        Text("No banks linked yet.", color = Ct.colors.muted, fontSize = 14.sp)
                    } else {
                        s.items.forEach { item ->
                            BankItemRow(
                                item,
                                onDisconnect = { scope.launch { runCatching { vm.api.plaidRemove(item.id) }; load() } },
                                onReconnect = { accountSelection -> reconnect(item.id, accountSelection) },
                            )
                            HorizontalDivider(color = Ct.colors.border)
                        }
                    }
                    Button(
                        onClick = { connect() }, enabled = !busy, modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent),
                    ) { Text("+ Connect a bank") }
                    Text(
                        "By connecting, you agree to Plaid's End User Privacy Policy. You authenticate with your bank inside Plaid; we never see your bank login.",
                        color = Ct.colors.muted, fontSize = 12.sp,
                    )
                    if (s.items.isNotEmpty()) {
                        TextButton(onClick = {
                            msg = BankMessage.info("Syncing…")
                            scope.launch {
                                // Explicit sync: force past the throttle that keeps
                                // the automatic app-open sync cheap. Pulls purchases
                                // too, not just balances.
                                val items = runCatching { vm.api.plaidRefresh(force = true) }.getOrNull()
                                if (items != null) {
                                    status = PlaidStatus(true, true, items)
                                    msg = BankMessage.info("Synced.")
                                    vm.reload()   // pick up purchases + balance proposals
                                    if (vm.data.value.settings.plaidBalanceMode == "prompt") {
                                        val pending = vm.pendingBalanceProposals()
                                        if (pending.isNotEmpty()) {
                                            showBalancePrompt = true
                                        }
                                    }
                                } else msg = BankMessage.error("Could not sync. Please try again.")
                            }
                        }) { Text("Sync now", color = Ct.colors.accent) }

                        val data by vm.data.collectAsStateWithLifecycle()
                        Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("Let bank suggest card balances", color = Ct.colors.text, fontSize = 14.sp)
                                Text("Off by default — suggestions update Current Balance only after you Accept. Statement Balance stays manual.",
                                    color = Ct.colors.muted, fontSize = 11.sp)
                            }
                            Switch(checked = data.settings.plaidUpdateBalances, onCheckedChange = { on ->
                                vm.setPlaidUpdateBalances(on)
                                if (on) {
                                    msg = BankMessage.info("New balance suggestions will appear for you to Accept or Decline.")
                                    scope.launch {
                                        kotlinx.coroutines.delay(2_500)
                                        vm.reload()
                                    }
                                }
                            })
                        }
                        if (data.settings.plaidUpdateBalances) {
                            Text("How should balance suggestions appear?", color = Ct.colors.text, fontSize = 13.sp,
                                modifier = Modifier.padding(top = 10.dp))
                            Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                androidx.compose.material3.RadioButton(
                                    selected = data.settings.plaidBalanceMode != "prompt",
                                    onClick = { vm.setPlaidBalanceMode("review") },
                                )
                                Text("Review queue", fontSize = 13.sp, color = Ct.colors.text)
                            }
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                androidx.compose.material3.RadioButton(
                                    selected = data.settings.plaidBalanceMode == "prompt",
                                    onClick = { vm.setPlaidBalanceMode("prompt") },
                                )
                                Text("Ask after each sync", fontSize = 13.sp, color = Ct.colors.text)
                            }
                        }
                        Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("Let bank import my purchases", color = Ct.colors.text, fontSize = 14.sp)
                                Text("Off by default — your spending stays manual-entry. When on, outflows from your linked banks are added to Spending (tagged as bank purchases, and never overwrite anything you typed).",
                                    color = Ct.colors.muted, fontSize = 11.sp)
                            }
                            Switch(checked = data.settings.plaidUpdatePurchases, onCheckedChange = { on ->
                                vm.setPlaidUpdatePurchases(on)
                                if (on) {
                                    msg = BankMessage.info("Importing your purchases — check Spending in a moment.")
                                    scope.launch {
                                        kotlinx.coroutines.delay(2_500)
                                        vm.reload()
                                    }
                                }
                            })
                        }
                        Text("Subscriptions from spending", color = Ct.colors.text, fontSize = 13.sp,
                            modifier = Modifier.padding(top = 12.dp))
                        Text("Recurring merchants stay as suggestions until you Accept, Decline, or add them.",
                            color = Ct.colors.muted, fontSize = 11.sp)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            androidx.compose.material3.RadioButton(
                                selected = data.settings.subscriptionDetectMode != "inline",
                                onClick = { vm.setSubscriptionDetectMode("inbox") },
                            )
                            Text("Suggested inbox", fontSize = 13.sp, color = Ct.colors.text)
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            androidx.compose.material3.RadioButton(
                                selected = data.settings.subscriptionDetectMode == "inline",
                                onClick = { vm.setSubscriptionDetectMode("inline") },
                            )
                            Text("Inline with actions", fontSize = 13.sp, color = Ct.colors.text)
                        }
                    }
                }
            }
        }
        msg?.let {
            Text(
                it.text,
                color = if (it.isError) Ct.colors.red else Ct.colors.muted,
                fontSize = 13.sp,
            )
        }
    }

    // Turning a gate on makes the server backfill — the sync cursor is still
    // unset while it's off, so it pulls the full history, not just what happens
    // next. Give it a moment, then adopt the merged copy.
    fun applyImportChoice(purchases: Boolean, balances: Boolean) {
        vm.setPlaidUpdatePurchases(purchases)
        vm.setPlaidUpdateBalances(balances)
        showImportPrompt = false
        if (!purchases && !balances) return
        msg = BankMessage.info(
            if (purchases) "Importing your history — check Spending in a moment."
            else "Updating matching card balances…"
        )
        scope.launch {
            kotlinx.coroutines.delay(2_500)
            vm.reload()
        }
    }

    if (showImportPrompt) {
        AlertDialog(
            onDismissRequest = { showImportPrompt = false },
            title = { Text("Bank linked — what next?") },
            text = {
                Text(
                    "Imported purchases are added to Spending tagged 🏦, and never overwrite " +
                        "anything you typed. You can change this any time on this screen.",
                )
            },
            confirmButton = {
                Column {
                    TextButton(onClick = { applyImportChoice(purchases = true, balances = false) }) {
                        Text("Import my purchases", color = Ct.colors.accent)
                    }
                    TextButton(onClick = { applyImportChoice(purchases = true, balances = true) }) {
                        Text("Purchases + suggest balances", color = Ct.colors.accent)
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { showImportPrompt = false }) {
                    Text("Not now", color = Ct.colors.muted)
                }
            },
            containerColor = Ct.colors.surface,
        )
    }

    if (showBalancePrompt) {
        val pending = vm.pendingBalanceProposals()
        AlertDialog(
            onDismissRequest = { showBalancePrompt = false },
            title = { Text("Accept Current Balance suggestions?") },
            text = {
                Text(
                    "Bank suggested Current Balance updates for ${pending.size} card" +
                        if (pending.size == 1) "" else "s" +
                        ". Statement Balance stays manual. Decline individual items from Cards.",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    pending.forEach { vm.acceptBalanceProposal(it) }
                    showBalancePrompt = false
                    msg = BankMessage.info("Accepted Current Balance suggestions.")
                }) { Text("Accept all", color = Ct.colors.accent) }
            },
            dismissButton = {
                TextButton(onClick = { showBalancePrompt = false }) {
                    Text("Not now", color = Ct.colors.muted)
                }
            },
            containerColor = Ct.colors.surface,
        )
    }
}

@Composable
private fun BankItemRow(item: PlaidItem, onDisconnect: () -> Unit, onReconnect: (Boolean) -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(item.institutionName, color = Ct.colors.text, fontSize = 15.sp,
                fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
            if (item.status == "new_accounts") {
                TextButton(onClick = { onReconnect(true) }) { Text("Add accounts", color = Ct.colors.accent) }
            } else if (item.status != "active") {
                TextButton(onClick = { onReconnect(false) }) { Text("Reconnect", color = Ct.colors.accent) }
            }
            TextButton(onClick = onDisconnect) { Text("Disconnect", color = Ct.colors.red) }
        }
        if (item.status == "new_accounts") {
            Text("New accounts available", color = Ct.colors.muted, fontSize = 11.sp)
        } else if (item.status != "active") {
            Text(
                if (item.status == "login_required") "Reconnect needed" else item.status,
                color = Ct.colors.orange, fontSize = 11.sp,
            )
        }
        item.accounts.forEach { a ->
            Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                Text(
                    (a.name ?: a.subtype ?: "Account") + (a.mask?.let { " ••$it" } ?: ""),
                    color = Ct.colors.muted, fontSize = 13.sp, modifier = Modifier.weight(1f),
                )
                Text(a.currentBalance?.let { Money.fmt(it) } ?: "—",
                    color = Ct.colors.text, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            }
        }
    }
}

/**
 * Status line under the bank list. Failures read red so a real problem never
 * looks like ordinary progress text.
 */
private data class BankMessage(val text: String, val isError: Boolean) {
    companion object {
        fun info(text: String) = BankMessage(text, isError = false)
        fun error(text: String) = BankMessage(text, isError = true)
        fun result(ok: Boolean, good: String, bad: String) = if (ok) info(good) else error(bad)
    }
}

/**
 * Plaid sets [LinkError] only when Link itself failed; a plain user close leaves
 * it null. Reporting both as a cancellation hides real failures.
 */
private fun plaidExitMessage(error: LinkError?, cancelled: String): BankMessage {
    if (error == null) return BankMessage.info(cancelled)
    error.displayMessage?.takeIf { it.isNotBlank() }?.let { return BankMessage.error(it) }
    return BankMessage.error(
        error.errorMessage.takeIf { it.isNotBlank() } ?: "Bank linking failed (${error.errorCode}).",
    )
}
