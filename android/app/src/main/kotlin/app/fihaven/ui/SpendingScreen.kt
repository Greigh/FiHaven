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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.fihaven.AppViewModel
import app.fihaven.core.Money
import app.fihaven.core.model.SPENDING_CATEGORIES
import app.fihaven.core.model.categoryBudgets
import app.fihaven.ui.theme.Ct

@Composable
fun SpendingScreen(vm: AppViewModel, padding: PaddingValues, onBack: (() -> Unit)? = null) {
    val data by vm.data.collectAsStateWithLifecycle()
    val ent by vm.entitlement.collectAsStateWithLifecycle()
    var addingTx by remember { mutableStateOf(false) }
    var editingBudgets by remember { mutableStateOf(false) }

    val bounds = vm.currentBounds()
    val periodTx = data.transactions.filter { it.date.isNotEmpty() && it.date >= bounds.startKey && it.date < bounds.endKey }
    val spentByCat = periodTx.groupBy { it.category }.mapValues { e -> e.value.sumOf { it.amount } }
    val totalSpent = periodTx.sumOf { it.amount }
    val budgets = data.settings.categoryBudgets
    val recentTx = data.transactions.sortedByDescending { it.date }.take(8)

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
            if (recentTx.isEmpty()) {
                item {
                    CtCard {
                        Text("Log groceries, dining, and other spending to track where your money goes this period.",
                            color = Ct.colors.muted, fontSize = 14.sp)
                    }
                }
            }
            items(recentTx, key = { "tx-${it.id}" }) { tx ->
                CtCard(padding = 12) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(spendIcon(tx.category), fontSize = 16.sp, modifier = Modifier.padding(end = 10.dp))
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(tx.merchant.ifBlank { tx.category }, color = Ct.colors.text, fontSize = 14.sp)
                                if (tx.isBank) {
                                    Text(if (tx.pending) "🏦 pending" else "🏦", color = Ct.colors.accent,
                                        fontSize = 10.sp, modifier = Modifier.padding(start = 5.dp))
                                }
                            }
                            Text(tx.date, color = Ct.colors.muted, fontSize = 11.sp)
                        }
                        Text(Money.fmt(tx.amount), color = Ct.colors.text, fontSize = 14.sp,
                            fontWeight = FontWeight.Medium, fontFamily = PlexMono)
                        if (!tx.isBank) {
                            Text("✕", color = Ct.colors.muted, fontSize = 16.sp,
                                modifier = Modifier.padding(start = 12.dp).clickable { vm.deleteTransaction(tx) })
                        } else {
                            Text("🔗", color = Ct.colors.muted, fontSize = 12.sp,
                                modifier = Modifier.padding(start = 12.dp))
                        }
                    }
                }
            }
        }
    }

    if (addingTx) TransactionEditorDialog(vm) { addingTx = false }
    if (editingBudgets) CategoryBudgetsDialog(vm, budgets) { editingBudgets = false }
}

private fun spendIcon(c: String) = when (c) {
    "Groceries" -> "🛒"; "Dining" -> "🍽️"; "Shopping" -> "🛍️"; "Transport" -> "🚗"
    "Entertainment" -> "🎬"; "Health" -> "💊"; "Bills" -> "📄"; else -> "📦"
}
