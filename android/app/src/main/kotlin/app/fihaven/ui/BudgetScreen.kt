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
import app.fihaven.AppViewModel
import app.fihaven.core.Money
import app.fihaven.core.logic.BillSchedule
import app.fihaven.core.logic.BudgetRules
import app.fihaven.core.logic.DateLogic
import app.fihaven.core.logic.Income
import app.fihaven.core.model.IncomeAdjustment
import app.fihaven.core.model.genId
import app.fihaven.core.model.IncomeSource
import app.fihaven.core.model.SPENDING_CATEGORIES
import app.fihaven.core.model.SavingsGoal
import app.fihaven.core.model.categoryBudgets
import app.fihaven.core.model.envelopeRollover
import app.fihaven.core.model.incomeAdjustments
import app.fihaven.core.model.incomes
import app.fihaven.core.model.timezoneSetting
import app.fihaven.ui.theme.Ct
import kotlin.math.abs

@Composable
fun BudgetScreen(vm: AppViewModel, padding: PaddingValues, onBack: (() -> Unit)? = null) {
    val data by vm.data.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<IncomeSource?>(null) }
    var creating by remember { mutableStateOf(false) }
    var editingAdj by remember { mutableStateOf<IncomeAdjustment?>(null) }
    var creatingAdj by remember { mutableStateOf(false) }
    var editingGoal by remember { mutableStateOf<SavingsGoal?>(null) }
    var creatingGoal by remember { mutableStateOf(false) }

    val periodKey = vm.currentPeriodKey()
    val bounds = vm.currentBounds()
    val cfg = vm.periodConfig()
    val income = Income.periodIncome(data.settings, bounds)
    val obligations = data.bills.filter { BillSchedule.dueInPeriod(it, bounds, vm.zone()) }.sumOf { it.amount } +
        data.activeCards.sumOf { it.minPayment }
    val leftover = income - obligations
    val ent by vm.entitlement.collectAsStateWithLifecycle()
    val zone = vm.zone()
    val billDue: (app.fihaven.core.model.Bill) -> Boolean = { BillSchedule.dueInPeriod(it, bounds, zone) }
    val budgetLens = BudgetRules.lens(
        data.settings, income, data.bills, data.activeCards, data.transactions, data.goals,
        bounds, billDue, ent.pro, zone,
    )
    val sources = data.settings.incomes
    val adjustments = data.settings.incomeAdjustments.filter { it.appliesTo(periodKey) }

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        ScreenHeader("Budget", onBack = onBack, branded = true)
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item {
                CtCard(padding = 0) {
                    Column {
                        summaryRow(Income.incomeLabel(cfg), Money.fmt(income), Ct.colors.green)
                        HorizontalDivider(color = Ct.colors.border)
                        summaryRow("Bills + minimums", Money.fmt(obligations), Ct.colors.text)
                        HorizontalDivider(color = Ct.colors.border)
                        summaryRow("Leftover", Money.fmt(leftover), if (leftover >= 0) Ct.colors.green else Ct.colors.red)
                    }
                }
            }
            budgetLens?.let { lens ->
                item { BudgetLensCard(lens) }
                val env = lens.envelope
                if (lens.mode == "envelope" && ent.pro && !lens.proLocked && env != null) {
                    item {
                        EnvelopeEditorCard(
                            goals = data.goals,
                            envelope = env,
                            rollover = data.settings.envelopeRollover,
                            vm = vm,
                        )
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
        }
    }

    if (creating) IncomeEditorDialog(null, vm) { creating = false }
    editing?.let { IncomeEditorDialog(it, vm) { editing = null } }
    if (creatingAdj) IncomeAdjustmentEditorDialog(null, vm, periodKey) { creatingAdj = false }
    editingAdj?.let { IncomeAdjustmentEditorDialog(it, vm, periodKey) { editingAdj = null } }
    if (creatingGoal) GoalEditorDialog(null, vm) { creatingGoal = false }
    editingGoal?.let { GoalEditorDialog(it, vm) { editingGoal = null } }
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
    var hoursPerWeek by remember { mutableStateOf(source?.hoursPerWeek?.takeIf { it != 0.0 }?.toString() ?: "") }

    FormDialog(
        title = if (source == null) "New Income" else "Edit Income",
        onSave = {
            vm.upsertIncome(
                IncomeSource(
                    id = source?.id ?: "src-${System.currentTimeMillis()}",
                    label = label.trim(),
                    amount = amount.toDoubleOrNull() ?: 0.0,
                    frequency = frequency,
                    hoursPerWeek = if (frequency == "hourly") (hoursPerWeek.toDoubleOrNull() ?: 0.0) else 0.0,
                )
            )
            onDismiss()
        },
        onDismiss = onDismiss,
        onDelete = source?.let { { vm.deleteIncome(it); onDismiss() } },
    ) {
        OutlinedTextField(label, { label = it }, label = { Text("Label") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(amount, { amount = it }, label = { Text(if (frequency == "hourly") "Hourly rate" else "Amount") }, prefix = { Text("$") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.fillMaxWidth())
        DropdownField("Frequency", Income.frequencies.map { it.key }, frequency) { frequency = it }
        if (frequency == "hourly") {
            OutlinedTextField(hoursPerWeek, { hoursPerWeek = it }, label = { Text("Hours / week") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.fillMaxWidth())
        }
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
                    id = goal?.id ?: genId(),
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
        DateField("Target date", targetDate, { targetDate = it },
            supportingText = "Optional — when you want to reach this goal.")
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
        DateField("Date", dateIso, { dateIso = it }, clearable = false)
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

@Composable
private fun BudgetLensCard(lens: BudgetRules.Lens) {
    CtCard {
        Text("BUDGET LENS", color = Ct.colors.muted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
        Text(lens.title, color = Ct.colors.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(top = 4.dp))
        Text(lens.subtitle, color = Ct.colors.muted, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp, bottom = 8.dp))
        if (lens.proLocked) {
            Text("Envelope lite is a Pro feature. Upgrade to assign income to goals and category budgets.",
                color = Ct.colors.muted, fontSize = 13.sp)
        } else {
            lens.headline?.let { h ->
                val bg = if (h.status == "ok") Ct.colors.green.copy(alpha = 0.08f) else Ct.colors.red.copy(alpha = 0.08f)
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 8.dp)
                        .background(bg, androidx.compose.foundation.shape.RoundedCornerShape(8.dp))
                        .padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(h.label, color = Ct.colors.muted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Text(Money.fmt(h.amount), color = Ct.colors.text, fontSize = 20.sp, fontWeight = FontWeight.Bold, fontFamily = PlexMono)
                }
            }
            lens.rows.forEach { row ->
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column(Modifier.weight(1f)) {
                        Text(row.label, color = Ct.colors.text, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        row.pct?.let { Text("$it%", color = Ct.colors.muted, fontSize = 11.sp) }
                        row.hint?.let { Text(it, color = Ct.colors.muted, fontSize = 11.sp) }
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        row.target?.let { if (it != row.actual) Text("target ${Money.fmt(it)}", color = Ct.colors.muted, fontSize = 12.sp) }
                        val color = when (row.status) {
                            "ok" -> Ct.colors.green
                            "under" -> Ct.colors.red
                            else -> Ct.colors.orange
                        }
                        Text(Money.fmt(row.actual), color = color, fontSize = 13.sp, fontFamily = PlexMono)
                    }
                }
            }
            lens.warnings.forEach { w ->
                Text(
                    "${w.label}: ${w.pct}% of income (≤ ${w.limit}%)" + if (w.over) " ⚠" else "",
                    color = if (w.over) Ct.colors.orange else Ct.colors.muted,
                    fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun EnvelopeEditorCard(
    goals: List<SavingsGoal>,
    envelope: BudgetRules.EnvelopeAssignments,
    rollover: Boolean,
    vm: AppViewModel,
) {
    CtCard {
        Text("ASSIGN ENVELOPES", color = Ct.colors.muted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
        if (goals.isNotEmpty()) {
            Text("Goals", color = Ct.colors.muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(top = 10.dp, bottom = 6.dp))
            goals.forEach { g ->
                var v by remember(g.id, envelope.goalMap[g.id.toString()]) {
                    mutableStateOf(envelope.goalMap[g.id.toString()]?.takeIf { it > 0 }?.toString() ?: "")
                }
                OutlinedTextField(
                    v,
                    {
                        v = it
                        vm.setEnvelopeAssignGoal(g.id.toString(), it.toDoubleOrNull() ?: 0.0)
                    },
                    label = { Text(g.name.ifBlank { "Goal" }) },
                    prefix = { Text("$") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                )
            }
        }
        Text("Categories", color = Ct.colors.muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(top = 10.dp, bottom = 6.dp))
        SPENDING_CATEGORIES.forEach { cat ->
            var v by remember(cat, envelope.catMap[cat]) {
                mutableStateOf(envelope.catMap[cat]?.takeIf { it > 0 }?.toString() ?: "")
            }
            OutlinedTextField(
                v,
                {
                    v = it
                    vm.setEnvelopeAssignCategory(cat, it.toDoubleOrNull() ?: 0.0)
                },
                label = { Text("${spendIcon(cat)} $cat") },
                prefix = { Text("$") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
            )
        }
        if (rollover) {
            Text("Unused category amounts roll into the next period.",
                color = Ct.colors.muted, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
        }
    }
}
