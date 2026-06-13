package com.danielhipskind.fihaven.ui

import com.danielhipskind.fihaven.ui.theme.PlexMono

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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.danielhipskind.fihaven.AppViewModel
import com.danielhipskind.fihaven.core.Money
import com.danielhipskind.fihaven.core.logic.DateLogic
import com.danielhipskind.fihaven.core.logic.Income
import com.danielhipskind.fihaven.core.model.IncomeAdjustment
import com.danielhipskind.fihaven.core.model.IncomeSource
import com.danielhipskind.fihaven.core.model.SPENDING_CATEGORIES
import com.danielhipskind.fihaven.core.model.SavingsGoal
import com.danielhipskind.fihaven.core.model.categoryBudgets
import com.danielhipskind.fihaven.core.model.incomeAdjustments
import com.danielhipskind.fihaven.core.model.incomes
import com.danielhipskind.fihaven.core.model.timezoneSetting
import com.danielhipskind.fihaven.ui.theme.Ct
import kotlin.math.abs

@Composable
fun BudgetScreen(vm: AppViewModel, padding: PaddingValues, onBack: (() -> Unit)? = null) {
    val data by vm.data.collectAsStateWithLifecycle()
    val ent by vm.entitlement.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<IncomeSource?>(null) }
    var creating by remember { mutableStateOf(false) }
    var editingAdj by remember { mutableStateOf<IncomeAdjustment?>(null) }
    var creatingAdj by remember { mutableStateOf(false) }
    var editingGoal by remember { mutableStateOf<SavingsGoal?>(null) }
    var creatingGoal by remember { mutableStateOf(false) }
    var addingTx by remember { mutableStateOf(false) }
    var editingBudgets by remember { mutableStateOf(false) }

    val periodKey = vm.currentPeriodKey()
    val income = Income.monthlyIncome(data.settings, periodKey)
    val obligations = data.bills.sumOf { it.amount } + data.cards.sumOf { it.minPayment }
    val leftover = income - obligations
    val sources = data.settings.incomes
    val adjustments = data.settings.incomeAdjustments.filter { it.appliesTo(periodKey) }

    val bounds = vm.currentBounds()
    val periodTx = data.transactions.filter { it.date.isNotEmpty() && it.date >= bounds.startKey && it.date < bounds.endKey }
    val spentByCat = periodTx.groupBy { it.category }.mapValues { e -> e.value.sumOf { it.amount } }
    val totalSpent = periodTx.sumOf { it.amount }
    val budgets = data.settings.categoryBudgets
    val recentTx = data.transactions.sortedByDescending { it.date }.take(8)

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        ScreenHeader("Budget", onBack = onBack)
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item {
                CtCard(padding = 0) {
                    Column {
                        summaryRow("Monthly income", Money.fmt(income), Ct.colors.green)
                        HorizontalDivider(color = Ct.colors.border)
                        summaryRow("Bills + minimums", Money.fmt(obligations), Ct.colors.text)
                        HorizontalDivider(color = Ct.colors.border)
                        summaryRow("Leftover", Money.fmt(leftover), if (leftover >= 0) Ct.colors.green else Ct.colors.red)
                    }
                }
            }
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("INCOME SOURCES", color = Ct.colors.muted, fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    Text("+ Add", color = Ct.colors.accent, fontSize = 14.sp,
                        modifier = Modifier.clickable { creating = true })
                }
            }
            if (sources.isEmpty()) {
                item { CtCard { Text("No income sources yet. Add your paycheck.", color = Ct.colors.muted) } }
            }
            items(sources, key = { it.id }) { src ->
                CtCard(Modifier.clickable { editing = src }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(src.label.ifBlank { "Income" }, color = Ct.colors.text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                            Text(freqLabel(src.frequency), color = Ct.colors.muted, fontSize = 12.sp)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(Money.fmt(src.amount), color = Ct.colors.text, fontSize = 15.sp,
                                fontWeight = FontWeight.Medium, fontFamily = PlexMono)
                            Text("${Money.fmt(Income.monthly(src))}/mo", color = Ct.colors.muted,
                                fontSize = 10.sp, fontFamily = PlexMono)
                        }
                    }
                }
            }
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("ADJUSTMENTS · THIS MONTH", color = Ct.colors.muted, fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    Text("+ Add", color = Ct.colors.accent, fontSize = 14.sp,
                        modifier = Modifier.clickable { creatingAdj = true })
                }
            }
            if (adjustments.isEmpty()) {
                item {
                    CtCard { Text("Bonus, unpaid time off, or a raise? Add a one-time or recurring change.",
                        color = Ct.colors.muted) }
                }
            }
            items(adjustments, key = { it.id }) { adj ->
                CtCard(Modifier.clickable { editingAdj = adj }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(adj.label.ifBlank { if (adj.amount < 0) "Reduction" else "Extra income" },
                                color = Ct.colors.text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                            Text(
                                if (adj.kind == "recurring") "Monthly from ${DateLogic.monthKeyLabel(adj.startMonth)}"
                                else "Just ${DateLogic.monthKeyLabel(adj.monthKey)}",
                                color = Ct.colors.muted, fontSize = 12.sp,
                            )
                        }
                        Text("${if (adj.amount >= 0) "+" else ""}${Money.fmt(adj.amount)}",
                            color = if (adj.amount < 0) Ct.colors.red else Ct.colors.green,
                            fontSize = 15.sp, fontWeight = FontWeight.Medium, fontFamily = PlexMono)
                    }
                }
            }
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("SAVINGS GOALS", color = Ct.colors.muted, fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    Text("+ Add", color = Ct.colors.accent, fontSize = 14.sp,
                        modifier = Modifier.clickable { creatingGoal = true })
                }
            }
            if (data.goals.isEmpty()) {
                item {
                    CtCard { Text("Saving for an emergency fund, a trip, or a big purchase? Add a goal.",
                        color = Ct.colors.muted) }
                }
            }
            items(data.goals, key = { "goal-${it.id}" }) { goal ->
                GoalRow(goal, vm.zone()) { editingGoal = goal }
            }
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("SPENDING · THIS PERIOD", color = Ct.colors.muted, fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    // Per-category budgets are Pro; logging transactions stays free.
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
                        // Bank-synced rows are managed by the linked bank — remove the
                        // connection in Settings instead of deleting rows here.
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

    if (creating) IncomeEditorDialog(null, vm) { creating = false }
    editing?.let { IncomeEditorDialog(it, vm) { editing = null } }
    if (creatingAdj) IncomeAdjustmentEditorDialog(null, vm, periodKey) { creatingAdj = false }
    editingAdj?.let { IncomeAdjustmentEditorDialog(it, vm, periodKey) { editingAdj = null } }
    if (creatingGoal) GoalEditorDialog(null, vm) { creatingGoal = false }
    editingGoal?.let { GoalEditorDialog(it, vm) { editingGoal = null } }
    if (addingTx) TransactionEditorDialog(vm) { addingTx = false }
    if (editingBudgets) CategoryBudgetsDialog(vm, budgets) { editingBudgets = false }
}

private fun spendIcon(c: String) = when (c) {
    "Groceries" -> "🛒"; "Dining" -> "🍽️"; "Shopping" -> "🛍️"; "Transport" -> "🚗"
    "Entertainment" -> "🎬"; "Health" -> "💊"; "Bills" -> "📄"; else -> "📦"
}

@Composable
private fun summaryRow(label: String, value: String, color: androidx.compose.ui.graphics.Color) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = Ct.colors.muted, fontSize = 15.sp, modifier = Modifier.weight(1f))
        Text(value, color = color, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, fontFamily = PlexMono)
    }
}

@Composable
fun IncomeEditorDialog(source: IncomeSource?, vm: AppViewModel, onDismiss: () -> Unit) {
    var label by remember { mutableStateOf(source?.label ?: "") }
    var amount by remember { mutableStateOf(source?.amount?.takeIf { it != 0.0 }?.toString() ?: "") }
    var frequency by remember { mutableStateOf(source?.frequency ?: "biweekly") }

    FormDialog(
        title = if (source == null) "New Income" else "Edit Income",
        onSave = {
            vm.upsertIncome(
                IncomeSource(
                    id = source?.id ?: "src-${System.currentTimeMillis()}",
                    label = label.trim(),
                    amount = amount.toDoubleOrNull() ?: 0.0,
                    frequency = frequency,
                )
            )
            onDismiss()
        },
        onDismiss = onDismiss,
        onDelete = source?.let { { vm.deleteIncome(it); onDismiss() } },
    ) {
        OutlinedTextField(label, { label = it }, label = { Text("Label") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(amount, { amount = it }, label = { Text("Amount") }, prefix = { Text("$") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.fillMaxWidth())
        DropdownField("Frequency", Income.frequencies.map { it.key }, frequency) { frequency = it }
    }
}

private fun freqLabel(key: String) = Income.frequencies.firstOrNull { it.key == key }?.label ?: key

private const val ADJ_ONCE = "Just this month"
private const val ADJ_RECURRING = "Every month from now"
private const val DIR_ADD = "Add (+)"
private const val DIR_REDUCE = "Reduce (−)"

@Composable
fun IncomeAdjustmentEditorDialog(
    adj: IncomeAdjustment?,
    vm: AppViewModel,
    currentMonthKey: String,
    onDismiss: () -> Unit,
) {
    var label by remember { mutableStateOf(adj?.label ?: "") }
    var amount by remember {
        mutableStateOf(adj?.amount?.let { abs(it) }?.takeIf { it != 0.0 }?.toString() ?: "")
    }
    var direction by remember { mutableStateOf(if ((adj?.amount ?: 0.0) < 0) DIR_REDUCE else DIR_ADD) }
    var scope by remember { mutableStateOf(if (adj?.kind == "recurring") ADJ_RECURRING else ADJ_ONCE) }

    FormDialog(
        title = if (adj == null) "New Adjustment" else "Edit Adjustment",
        onSave = {
            val magnitude = amount.toDoubleOrNull() ?: 0.0
            val signed = if (direction == DIR_REDUCE) -abs(magnitude) else abs(magnitude)
            val recurring = scope == ADJ_RECURRING
            val onceMonth = adj?.monthKey?.takeIf { it.isNotEmpty() } ?: currentMonthKey
            val startMonth = adj?.startMonth?.takeIf { it.isNotEmpty() } ?: currentMonthKey
            vm.upsertAdjustment(
                IncomeAdjustment(
                    id = adj?.id ?: "adj-${System.currentTimeMillis()}",
                    label = label.trim(),
                    amount = signed,
                    kind = if (recurring) "recurring" else "once",
                    monthKey = if (recurring) "" else onceMonth,
                    startMonth = if (recurring) startMonth else "",
                    endMonth = if (recurring) (adj?.endMonth ?: "") else "",
                )
            )
            onDismiss()
        },
        onDismiss = onDismiss,
        onDelete = adj?.let { { vm.deleteAdjustment(it); onDismiss() } },
    ) {
        OutlinedTextField(label, { label = it }, label = { Text("Label (e.g. Bonus, Unpaid PTO)") },
            singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(amount, { amount = it }, label = { Text("Amount") }, prefix = { Text("$") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true,
            modifier = Modifier.fillMaxWidth())
        DropdownField("Direction", listOf(DIR_ADD, DIR_REDUCE), direction) { direction = it }
        DropdownField("Applies", listOf(ADJ_ONCE, ADJ_RECURRING), scope) { scope = it }
    }
}

@Composable
private fun GoalRow(g: SavingsGoal, zone: java.time.ZoneId, onEdit: () -> Unit) {
    val pct = if (g.target > 0) (g.saved / g.target).coerceIn(0.0, 1.0) else 0.0
    val remaining = (g.target - g.saved).coerceAtLeast(0.0)
    val suggested = if (g.targetDate.isNotEmpty() && remaining > 0) {
        remaining / maxOf(1, DateLogic.monthsUntil(g.targetDate, zone))
    } else null
    CtCard(Modifier.clickable(onClick = onEdit)) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(g.name.ifBlank { "Goal" }, color = Ct.colors.text, fontSize = 15.sp,
                    fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                Text("${(pct * 100).toInt()}%", color = Ct.colors.muted, fontSize = 13.sp, fontFamily = PlexMono)
            }
            LinearProgressIndicator(progress = { pct.toFloat() }, modifier = Modifier.fillMaxWidth(),
                color = Ct.colors.green, trackColor = Ct.colors.border)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${Money.fmt(g.saved)} of ${Money.fmt(g.target)}", color = Ct.colors.muted,
                    fontSize = 12.sp, modifier = Modifier.weight(1f))
                if (suggested != null) {
                    Text("Save ${Money.fmt(suggested)}/mo", color = Ct.colors.green, fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
fun GoalEditorDialog(goal: SavingsGoal?, vm: AppViewModel, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf(goal?.name ?: "") }
    var target by remember { mutableStateOf(goal?.target?.takeIf { it != 0.0 }?.toString() ?: "") }
    var saved by remember { mutableStateOf(goal?.saved?.takeIf { it != 0.0 }?.toString() ?: "") }
    var targetDate by remember { mutableStateOf(goal?.targetDate ?: "") }
    var notes by remember { mutableStateOf(goal?.notes ?: "") }
    FormDialog(
        title = if (goal == null) "New Goal" else "Edit Goal",
        saveEnabled = name.isNotBlank(),
        onSave = {
            vm.upsertGoal(
                SavingsGoal(
                    id = goal?.id ?: System.currentTimeMillis().toInt(),
                    name = name.trim(),
                    target = target.toDoubleOrNull() ?: 0.0,
                    saved = saved.toDoubleOrNull() ?: 0.0,
                    targetDate = targetDate.trim(),
                    notes = notes,
                )
            )
            onDismiss()
        },
        onDismiss = onDismiss,
        onDelete = goal?.let { { vm.deleteGoal(it); onDismiss() } },
    ) {
        OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true,
            modifier = Modifier.fillMaxWidth())
        OutlinedTextField(saved, { saved = it }, label = { Text("Saved so far") }, prefix = { Text("$") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true,
            modifier = Modifier.fillMaxWidth())
        OutlinedTextField(target, { target = it }, label = { Text("Target") }, prefix = { Text("$") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true,
            modifier = Modifier.fillMaxWidth())
        OutlinedTextField(targetDate, { targetDate = it },
            label = { Text("Target date (YYYY-MM-DD, optional)") }, singleLine = true,
            modifier = Modifier.fillMaxWidth())
        OutlinedTextField(notes, { notes = it }, label = { Text("Notes") }, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
fun TransactionEditorDialog(vm: AppViewModel, onDismiss: () -> Unit) {
    var amount by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("Groceries") }
    var merchant by remember { mutableStateOf("") }
    val today = java.time.LocalDate.now()
    var dateIso by remember { mutableStateOf("%04d-%02d-%02d".format(today.year, today.monthValue, today.dayOfMonth)) }
    FormDialog(
        title = "Add Transaction",
        saveEnabled = (amount.toDoubleOrNull() ?: 0.0) > 0,
        onSave = {
            vm.addTransaction(amount.toDoubleOrNull() ?: 0.0, category, merchant.trim(), dateIso.trim())
            onDismiss()
        },
        onDismiss = onDismiss,
    ) {
        OutlinedTextField(amount, { amount = it }, label = { Text("Amount") }, prefix = { Text("$") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true,
            modifier = Modifier.fillMaxWidth())
        DropdownField("Category", SPENDING_CATEGORIES, category) { category = it }
        OutlinedTextField(merchant, { merchant = it }, label = { Text("Merchant (optional)") }, singleLine = true,
            modifier = Modifier.fillMaxWidth())
        OutlinedTextField(dateIso, { dateIso = it }, label = { Text("Date (YYYY-MM-DD)") }, singleLine = true,
            modifier = Modifier.fillMaxWidth())
    }
}

@Composable
fun CategoryBudgetsDialog(vm: AppViewModel, budgets: Map<String, Double>, onDismiss: () -> Unit) {
    FormDialog("Category budgets", saveEnabled = false, onSave = {}, onDismiss = onDismiss) {
        Text("Set a monthly spending limit per category. Leave blank to ignore.",
            color = Ct.colors.muted, fontSize = 13.sp)
        SPENDING_CATEGORIES.forEach { cat ->
            var v by remember { mutableStateOf(budgets[cat]?.takeIf { it != 0.0 }?.toString() ?: "") }
            OutlinedTextField(
                v,
                {
                    v = it
                    vm.setCategoryBudget(cat, it.toDoubleOrNull() ?: 0.0)
                },
                label = { Text("${spendIcon(cat)} $cat") }, prefix = { Text("$") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
