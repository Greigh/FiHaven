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
import com.danielhipskind.fihaven.core.logic.Income
import com.danielhipskind.fihaven.core.model.IncomeSource
import com.danielhipskind.fihaven.core.model.incomes
import com.danielhipskind.fihaven.ui.theme.Ct

@Composable
fun BudgetScreen(vm: AppViewModel, padding: PaddingValues, onBack: (() -> Unit)? = null) {
    val data by vm.data.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<IncomeSource?>(null) }
    var creating by remember { mutableStateOf(false) }

    val income = Income.monthlyIncome(data.settings)
    val obligations = data.bills.sumOf { it.amount } + data.cards.sumOf { it.minPayment }
    val leftover = income - obligations
    val sources = data.settings.incomes

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
        }
    }

    if (creating) IncomeEditorDialog(null, vm) { creating = false }
    editing?.let { IncomeEditorDialog(it, vm) { editing = null } }
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
