package app.fihaven.ui

import app.fihaven.ui.theme.PlexMono

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.fihaven.AppViewModel
import app.fihaven.core.Money
import app.fihaven.core.logic.Reconcile
import app.fihaven.core.logic.SpendingInsights
import app.fihaven.core.logic.Period
import app.fihaven.core.model.SPENDING_CATEGORIES
import app.fihaven.core.model.SpendTransaction
import app.fihaven.core.model.categoryBudgets
import app.fihaven.ui.theme.Ct

@Composable
fun SpendingScreen(vm: AppViewModel, padding: PaddingValues, onBack: (() -> Unit)? = null) {
    val data by vm.data.collectAsStateWithLifecycle()
    val ent by vm.entitlement.collectAsStateWithLifecycle()
    var addingTx by remember { mutableStateOf(false) }
    var editingTx by remember { mutableStateOf<app.fihaven.core.model.SpendTransaction?>(null) }
    var editingBudgets by remember { mutableStateOf(false) }
    var dismissedDupes by remember { mutableStateOf(setOf<String>()) }

    // Bank-sync reconciliation: duplicate audit + uncorroborated manual entries.
    val today = app.fihaven.core.logic.DateLogic.today(vm.zone())
    val dupPairs = Reconcile.duplicatePairs(data.transactions).filter { it.bank.id !in dismissedDupes }
    val unconfirmed = if (data.transactions.any { it.isBank })
        Reconcile.unconfirmedManual(data.transactions, today).size else 0

    val bounds = vm.currentBounds()
    val cfg = vm.periodConfig()
    val prevBounds = Period.shift(bounds, -1, cfg)
    val insights = if (ent.pro) SpendingInsights.compute(data.transactions, bounds, prevBounds) else emptyList()
    val periodTx = data.transactions.filter { it.date.isNotEmpty() && it.date >= bounds.startKey && it.date < bounds.endKey }
    val spentByCat = periodTx.groupBy { it.category }.mapValues { e -> e.value.sumOf { it.amount } }
    val totalSpent = periodTx.sumOf { it.amount }
    val budgets = data.settings.categoryBudgets
    val recentTx = periodTx.sortedByDescending { it.date }

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        ScreenHeader("Spending", onBack = onBack, branded = true)
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("SPENDING · THIS PERIOD", color = Ct.colors.muted, fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    if (ent.pro) {
                        Text("Budgets", color = Ct.colors.accent, fontSize = 14.sp,
                            modifier = Modifier.clickable { editingBudgets = true }.padding(end = 12.dp))
                    }
                    Text("+ Add", color = Ct.colors.accent, fontSize = 14.sp,
                        modifier = Modifier.clickable { addingTx = true })
                }
            }
            item {
                CtCard(padding = 14) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Total spent", color = Ct.colors.muted, fontSize = 13.sp, modifier = Modifier.weight(1f))
                            Text(Money.fmt(totalSpent), color = Ct.colors.text, fontSize = 15.sp,
                                fontWeight = FontWeight.SemiBold, fontFamily = PlexMono)
                        }
                        SPENDING_CATEGORIES.forEach { cat ->
                            val spent = spentByCat[cat] ?: 0.0
                            val budget = budgets[cat] ?: 0.0
                            if (spent > 0 || budget > 0) {
                                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text("${spendIcon(cat)} $cat", color = Ct.colors.text, fontSize = 13.sp,
                                            modifier = Modifier.weight(1f))
                                        Text(
                                            if (ent.pro && budget > 0) "${Money.fmt(spent)} / ${Money.fmt(budget)}" else Money.fmt(spent),
                                            color = if (ent.pro && budget > 0 && spent > budget) Ct.colors.red else Ct.colors.muted,
                                            fontSize = 12.sp, fontFamily = PlexMono,
                                        )
                                    }
                                    if (ent.pro && budget > 0) {
                                        LinearProgressIndicator(
                                            progress = { (spent / budget).coerceIn(0.0, 1.0).toFloat() },
                                            modifier = Modifier.fillMaxWidth(),
                                            color = if (spent > budget) Ct.colors.red else Ct.colors.green,
                                            trackColor = Ct.colors.border,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if (ent.pro && insights.isNotEmpty()) {
                item {
                    CtCard(padding = 14) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("VS LAST PERIOD", color = Ct.colors.muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            insights.take(6).forEach { row ->
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text("${spendIcon(row.cat)} ${row.cat}", color = Ct.colors.text, fontSize = 13.sp,
                                        modifier = Modifier.weight(1f))
                                    Column(horizontalAlignment = Alignment.End) {
                                        Text(Money.fmt(row.now), color = Ct.colors.text, fontSize = 12.sp, fontFamily = PlexMono)
                                        val deltaColor = when {
                                            row.delta > 0 -> Ct.colors.red
                                            row.delta < 0 -> Ct.colors.green
                                            else -> Ct.colors.muted
                                        }
                                        val sign = if (row.delta > 0) "+" else ""
                                        Text("$sign${Money.fmt(row.delta)} (${row.pct}%)",
                                            color = deltaColor, fontSize = 11.sp, fontFamily = PlexMono)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if (dupPairs.isNotEmpty() || unconfirmed > 0) {
                item {
                    CtCard {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("🏦 Bank sync review", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Ct.colors.text)
                            if (dupPairs.isNotEmpty()) {
                                Text("These look like the same purchase entered twice — your entry and a bank import. Keep one.",
                                    color = Ct.colors.muted, fontSize = 11.sp)
                                dupPairs.forEach { pair ->
                                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                        Column(Modifier.weight(1f)) {
                                            Text("${pair.bank.merchant.ifBlank { pair.manual.merchant }} · ${Money.fmt(pair.bank.amount)}",
                                                color = Ct.colors.text, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                                            Text("you logged ${pair.manual.date} · bank ${pair.bank.date}",
                                                color = Ct.colors.muted, fontSize = 11.sp)
                                        }
                                        Text("Remove mine", color = Ct.colors.red, fontSize = 12.sp,
                                            modifier = Modifier.padding(start = 8.dp).clickable { vm.deleteTransaction(pair.manual) })
                                        Text("Keep", color = Ct.colors.muted, fontSize = 12.sp,
                                            modifier = Modifier.padding(start = 10.dp).clickable { dismissedDupes = dismissedDupes + pair.bank.id })
                                    }
                                }
                            }
                            if (unconfirmed > 0) {
                                Text("$unconfirmed recent manual ${if (unconfirmed == 1) "entry the bank hasn’t" else "entries the bank hasn’t"} corroborated yet — double-check if you expected a bank match.",
                                    color = Ct.colors.muted, fontSize = 11.sp)
                            }
                        }
                    }
                }
            }
            if (recentTx.isEmpty()) {
                item {
                    CtCard {
                        Text("Log groceries, dining, and other spending to track where your money goes this period.",
                            color = Ct.colors.muted, fontSize = 14.sp)
                    }
                }
            }
            items(recentTx, key = { "tx-${it.id}" }) { tx ->
                CtCard(padding = 10, modifier = Modifier.clickable { editingTx = tx }) {
                    SpendingTxRow(
                        tx = tx,
                        onEdit = { editingTx = tx },
                        onDelete = { vm.deleteTransaction(tx) },
                        onKeep = { vm.acceptBankTransaction(tx) },
                        onDecline = { vm.declineBankTransaction(tx) },
                    )
                }
            }
        }
    }

    if (addingTx) TransactionEditorDialog(vm) { addingTx = false }
    editingTx?.let { tx -> TransactionEditorDialog(vm, edit = tx) { editingTx = null } }
    if (editingBudgets) CategoryBudgetsDialog(vm, budgets) { editingBudgets = false }
}

@Composable
private fun SpendingTxRow(
    tx: SpendTransaction,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onKeep: () -> Unit,
    onDecline: () -> Unit,
) {
    val title = tx.merchant.ifBlank { tx.category }
    val subtitle = buildString {
        append(tx.date)
        if (tx.isBank) {
            append(" · ")
            append(if (tx.pending) "Bank · pending" else "Bank")
        }
        if (tx.note.isNotBlank()) {
            append(" · ")
            append(tx.note)
        }
    }

    Row(verticalAlignment = Alignment.Top) {
        Text(spendIcon(tx.category), fontSize = 16.sp, modifier = Modifier.padding(end = 10.dp, top = 2.dp))
        Column(modifier = Modifier.weight(1f).padding(end = 8.dp)) {
            Text(
                title,
                color = Ct.colors.text,
                fontSize = 14.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(subtitle, color = Ct.colors.muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(
            Money.fmt(tx.amount),
            color = Ct.colors.text,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            fontFamily = PlexMono,
            modifier = Modifier.padding(top = 2.dp),
        )
        IconButton(onClick = onEdit, modifier = Modifier.size(48.dp)) {
            Icon(Icons.Filled.Edit, contentDescription = "Edit transaction", tint = Ct.colors.accent)
        }
        if (tx.isBank && tx.pending) {
            IconButton(onClick = onKeep, modifier = Modifier.size(48.dp)) {
                Icon(Icons.Filled.CheckCircle, contentDescription = "Keep pending bank transaction", tint = Ct.colors.accent)
            }
        }
        IconButton(
            onClick = { if (tx.isBank) onDecline() else onDelete() },
            modifier = Modifier.size(48.dp),
        ) {
            Icon(
                Icons.Filled.Close,
                contentDescription = if (tx.isBank) "Not mine — remove and don’t import again" else "Delete transaction",
                tint = Ct.colors.muted,
            )
        }
    }
}

private fun spendIcon(c: String) = when (c) {
    "Groceries" -> "🛒"; "Dining" -> "🍽️"; "Shopping" -> "🛍️"; "Transport" -> "🚗"
    "Entertainment" -> "🎬"; "Health" -> "💊"; "Bills" -> "📄"; else -> "📦"
}
