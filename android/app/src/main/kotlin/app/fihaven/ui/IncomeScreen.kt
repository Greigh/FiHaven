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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.fihaven.AppViewModel
import app.fihaven.core.Money
import app.fihaven.core.logic.DateLogic
import app.fihaven.core.logic.Income
import app.fihaven.core.model.IncomeAdjustment
import app.fihaven.core.model.IncomeSource
import app.fihaven.core.model.genId
import app.fihaven.core.model.incomes
import app.fihaven.ui.theme.Ct
import kotlin.math.abs

/// Paychecks and this period's income adjustments. Income used to be a pair
/// of sections inside Budget, below the budget lens — it is a destination of
/// its own now, and Budget consumes the total instead of editing it.
@Composable
fun IncomeScreen(vm: AppViewModel, padding: PaddingValues, onBack: (() -> Unit)? = null) {
    val data by vm.data.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<IncomeSource?>(null) }
    var creating by remember { mutableStateOf(false) }
    var editingAdj by remember { mutableStateOf<IncomeAdjustment?>(null) }
    var creatingAdj by remember { mutableStateOf(false) }

    val bounds = vm.currentBounds()
    val cfg = vm.periodConfig()
    // The month a new one-time adjustment belongs to. NOT the period key —
    // outside calendar mode that is a start *date*, which no adjustment can match.
    val anchorMonth = Income.periodAnchorMonth(bounds)
    val effective = Income.periodIncome(data.settings, bounds)
    val adjustTotal = Income.adjustmentsTotal(data.settings, bounds)
    // Derived from the total so the three summary rows always reconcile: outside
    // calendar mode the period's base is the monthly figure prorated by length.
    val base = effective - adjustTotal
    val sources = data.settings.incomes
    val adjustments = Income.adjustmentsForPeriod(data.settings, bounds)

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        ScreenHeader("Income", onBack = onBack, branded = true)
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item {
                CtCard(padding = 0) {
                    Column {
                        summaryRow(Income.baseIncomeLabel(cfg), Money.fmt(base), Ct.colors.text)
                        HorizontalDivider(color = Ct.colors.border)
                        summaryRow(
                            Income.adjustmentsLabel(cfg),
                            "${if (adjustTotal >= 0) "+" else ""}${Money.fmt(adjustTotal)}",
                            when {
                                adjustTotal > 0 -> Ct.colors.green
                                adjustTotal < 0 -> Ct.colors.red
                                else -> Ct.colors.muted
                            },
                        )
                        HorizontalDivider(color = Ct.colors.border)
                        summaryRow(Income.incomeLabel(cfg), Money.fmt(effective), Ct.colors.green)
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
                    Text(Income.adjustmentsLabel(cfg).uppercase(), color = Ct.colors.muted, fontSize = 12.sp,
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
        }
    }

    if (creating) IncomeEditorDialog(null, vm) { creating = false }
    editing?.let { IncomeEditorDialog(it, vm) { editing = null } }
    if (creatingAdj) IncomeAdjustmentEditorDialog(null, vm, anchorMonth) { creatingAdj = false }
    editingAdj?.let { IncomeAdjustmentEditorDialog(it, vm, anchorMonth) { editingAdj = null } }
}

@Composable
private fun summaryRow(label: String, value: String, color: androidx.compose.ui.graphics.Color) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = Ct.colors.muted, fontSize = 15.sp, modifier = Modifier.weight(1f))
        Text(value, color = color, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, fontFamily = PlexMono)
    }
}

private fun freqLabel(key: String) = Income.frequencies.firstOrNull { it.key == key }?.label ?: key

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
                    id = source?.id ?: "src-${genId()}",
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
                    id = adj?.id ?: "adj-${genId()}",
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
