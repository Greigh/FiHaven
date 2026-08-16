package app.fihaven.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.fihaven.AppViewModel
import app.fihaven.core.Money
import app.fihaven.core.logic.BalanceReview
import app.fihaven.core.model.Account
import app.fihaven.ui.theme.Ct
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Balances tab ("Account Balances" in More) — the home for `accounts`, the
 * assets you own, as opposed to the `cards` you owe.
 *
 * Editing these used to live on Net Worth, which is now purely the
 * assets-minus-debts rollup. Manual-first as ever: a linked bank never writes a
 * balance on its own — with `plaidUpdateBalances` on, sync files proposals the
 * user Accepts or Declines here.
 *
 * Mirrors the web BalancesView.svelte and the iOS BalancesView.
 */
private val BALANCE_TYPES = mapOf(
    "checking" to ("Checking" to "🏦"),
    "savings" to ("Savings" to "💰"),
    "investment" to ("Investments" to "📈"),
    "property" to ("Property" to "🏠"),
    "cash" to ("Cash" to "💵"),
    "other" to ("Other" to "📦"),
)

/** What you could actually reach this week. Property and investments are real
 *  money but not spendable money, so they're counted apart. */
private val LIQUID_TYPES = setOf("checking", "savings", "cash")

private fun balTypeLabel(t: String) = BALANCE_TYPES[t]?.first ?: "Other"
private fun balTypeIcon(t: String) = BALANCE_TYPES[t]?.second ?: "📦"

/** What a linked bank last reported for one account. [asOf] is the item's last
 *  sync in epoch millis — the figure is cached as of then, so it is always
 *  shown dated rather than as a live number. */
private data class BankFigure(val label: String, val balance: Double?, val asOf: Long?)

/** Plaid account types that are things you own rather than owe. Kept in sync
 *  with ASSET_PLAID_TYPES in server/plaidBalances.js. */
private val ASSET_PLAID_TYPES = listOf("depository", "investment", "brokerage")

private val ASOF_FMT = DateTimeFormatter.ofPattern("MMM d", Locale.getDefault())

@Composable
fun BalancesScreen(vm: AppViewModel, padding: PaddingValues, onBack: (() -> Unit)? = null) {
    val data by vm.data.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<Account?>(null) }
    var creating by remember { mutableStateOf(false) }

    // Depository/investment accounts across every linked bank, by account id.
    // Empty for Free users, for anyone with no bank linked, and whenever the
    // status call fails — in each case the rows simply read as manual.
    val bankFigures = remember { mutableStateMapOf<String, BankFigure>() }
    LaunchedEffect(Unit) {
        val status = runCatching { vm.api.plaidStatus() }.getOrNull() ?: return@LaunchedEffect
        bankFigures.clear()
        status.items.forEach { item ->
            item.accounts
                .filter { (it.type ?: "").lowercase() in ASSET_PLAID_TYPES }
                .forEach { a ->
                    val label = buildString {
                        append(item.institutionName)
                        a.name?.takeIf { it.isNotBlank() }?.let { append(" · ").append(it) }
                        a.mask?.takeIf { it.isNotBlank() }?.let { append(" ····").append(it) }
                    }
                    bankFigures[a.accountId] = BankFigure(label, a.currentBalance, item.lastSyncAt)
                }
        }
    }

    val total = data.accounts.sumOf { it.balance }
    val liquid = data.accounts.filter { it.type in LIQUID_TYPES }.sumOf { it.balance }
    val proposals = vm.pendingAccountProposals()

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        ScreenHeader("Balances", onAdd = { creating = true }, onBack = onBack, branded = true)
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                CtCard {
                    Text("TOTAL BALANCES", color = Ct.colors.muted, fontSize = 10.sp,
                        fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        Money.fmt(total),
                        color = if (total >= 0) Ct.colors.green else Ct.colors.red,
                        fontSize = 28.sp, fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(12.dp))
                    Row(Modifier.fillMaxWidth()) {
                        Column(Modifier.weight(1f)) {
                            Text("Liquid", color = Ct.colors.muted, fontSize = 11.sp)
                            Text(Money.fmt(liquid), color = Ct.colors.text,
                                fontSize = 15.sp, fontWeight = FontWeight.Medium)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text("Other assets", color = Ct.colors.muted, fontSize = 11.sp)
                            Text(Money.fmt(total - liquid), color = Ct.colors.text,
                                fontSize = 15.sp, fontWeight = FontWeight.Medium)
                        }
                    }
                }
            }

            if (proposals.isNotEmpty()) {
                item {
                    Text("BANK SYNC REVIEW", color = Ct.colors.muted, fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold, letterSpacing = 0.5.sp)
                }
                items(proposals, key = { it.fingerprint }) { p ->
                    ProposalCard(p, onAccept = { vm.acceptAccountProposal(p) },
                        onDecline = { vm.declineAccountProposal(p) })
                }
            }

            if (data.accounts.isEmpty()) {
                item {
                    CtCard {
                        Text(
                            "No accounts yet. Tap + to add checking, savings, investments, or property.",
                            color = Ct.colors.muted,
                        )
                    }
                }
            } else {
                items(data.accounts, key = { it.id }) { account ->
                    val pid = account.plaidAccountId
                    val linked = !pid.isNullOrBlank() && pid != Account.NO_PLAID_LINK
                    val bank = if (linked) bankFigures[pid] else null
                    CtCard(modifier = Modifier.clickable { editing = account }) {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Text(balTypeIcon(account.type), fontSize = 18.sp,
                                modifier = Modifier.padding(end = 12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(
                                    account.name.ifBlank { balTypeLabel(account.type) },
                                    color = Ct.colors.text, fontSize = 15.sp,
                                    fontWeight = FontWeight.SemiBold, maxLines = 1,
                                )
                                // The 🏦 marks a row a bank is following, the same
                                // way bank-sourced rows are marked on Spending.
                                Text(
                                    balTypeLabel(account.type) + if (linked) " · 🏦" else "",
                                    color = Ct.colors.muted, fontSize = 12.sp,
                                )
                            }
                            Text(Money.fmt(account.balance), color = Ct.colors.text,
                                fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        }
                        // Dated, never presented as live: these come from
                        // /accounts/get, cached as of the item's last sync.
                        val figure = bank?.balance
                        if (figure != null) {
                            Spacer(Modifier.height(4.dp))
                            Text(bankLine(figure, bank.asOf), color = Ct.colors.muted, fontSize = 11.sp)
                        }
                    }
                }
            }
        }
    }

    if (creating) AccountEditorDialog(null, vm, onDismiss = { creating = false })
    editing?.let { AccountEditorDialog(it, vm, onDismiss = { editing = null }) }
}

private fun bankLine(figure: Double, asOf: Long?): String = buildString {
    append("Bank says ").append(Money.fmt(figure))
    if (asOf != null) {
        val date = Instant.ofEpochMilli(asOf).atZone(ZoneId.systemDefault()).toLocalDate()
        append(" · as of ").append(ASOF_FMT.format(date))
    }
}

@Composable
private fun ProposalCard(
    p: BalanceReview.AccountProposal,
    onAccept: () -> Unit,
    onDecline: () -> Unit,
) {
    CtCard {
        Text(p.name, color = Ct.colors.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(6.dp))
        val current = p.currentBalance
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(current?.let { Money.fmt(it) } ?: "—",
                color = Ct.colors.muted, fontSize = 14.sp)
            Text("  →  ", color = Ct.colors.muted, fontSize = 14.sp)
            // Green for more money in an asset account — the opposite of the
            // card review, where a bigger number is a bigger debt.
            val up = current == null || p.proposedBalance >= current
            Text(Money.fmt(p.proposedBalance),
                color = if (up) Ct.colors.green else Ct.colors.red,
                fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.height(6.dp))
        Text("Your bank reports a different balance. Accepting replaces the saved figure.",
            color = Ct.colors.muted, fontSize = 12.sp)
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = onAccept) { Text("Accept", color = Ct.colors.accent) }
            TextButton(onClick = onDecline) { Text("Decline", color = Ct.colors.muted) }
        }
    }
}
