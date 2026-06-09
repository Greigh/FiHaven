package com.danielhipskind.fihaven.ui

import android.app.Application
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
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
import com.danielhipskind.fihaven.AppViewModel
import com.danielhipskind.fihaven.core.Money
import com.danielhipskind.fihaven.core.net.PlaidItem
import com.danielhipskind.fihaven.core.net.PlaidStatus
import com.danielhipskind.fihaven.ui.theme.Ct
import com.plaid.link.FastOpenPlaidLink
import com.plaid.link.Plaid
import com.plaid.link.linkTokenConfiguration
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
    var msg by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    suspend fun load() { status = runCatching { vm.api.plaidStatus() }.getOrNull() }
    LaunchedEffect(Unit) { load() }

    val launcher = rememberLauncherForActivityResult(FastOpenPlaidLink()) { result ->
        when (result) {
            is LinkSuccess -> {
                msg = "Linking…"
                scope.launch {
                    val ok = runCatching { vm.api.plaidExchange(result.publicToken) }.isSuccess
                    msg = if (ok) "Bank linked." else "Could not finish linking. Please try again."
                    load()
                }
            }
            is LinkExit -> msg = "Linking cancelled."
        }
    }

    fun connect() {
        busy = true
        msg = "Opening your bank…"
        scope.launch {
            val token = runCatching { vm.api.plaidLinkToken() }.getOrNull()
            busy = false
            if (token == null) { msg = "Could not start linking. Please try again."; return@launch }
            msg = null
            val config = linkTokenConfiguration { this.token = token }
            launcher.launch(Plaid.create(context.applicationContext as Application, config))
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
                !s.configured -> Text("Bank linking isn't enabled on this server yet.", color = Ct.colors.muted, fontSize = 14.sp)
                !s.pro -> Text("Linking your bank is a Pro feature. Upgrade from the Get Pro tab to connect an account.",
                    color = Ct.colors.text, fontSize = 14.sp)
                else -> {
                    if (s.items.isEmpty()) {
                        Text("No banks linked yet.", color = Ct.colors.muted, fontSize = 14.sp)
                    } else {
                        s.items.forEach { item ->
                            BankItemRow(item) {
                                scope.launch { runCatching { vm.api.plaidRemove(item.id) }; load() }
                            }
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
                            msg = "Refreshing balances…"
                            scope.launch {
                                val items = runCatching { vm.api.plaidRefresh() }.getOrNull()
                                if (items != null) { status = PlaidStatus(true, true, items); msg = "Balances updated." }
                                else msg = "Could not refresh. Please try again."
                            }
                        }) { Text("Refresh balances", color = Ct.colors.accent) }
                    }
                }
            }
        }
        msg?.let { Text(it, color = Ct.colors.muted, fontSize = 13.sp) }
    }
}

@Composable
private fun BankItemRow(item: PlaidItem, onDisconnect: () -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(item.institutionName, color = Ct.colors.text, fontSize = 15.sp,
                fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
            TextButton(onClick = onDisconnect) { Text("Disconnect", color = Ct.colors.red) }
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
