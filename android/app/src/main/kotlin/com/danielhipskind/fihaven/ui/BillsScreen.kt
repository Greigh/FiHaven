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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Switch
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import com.danielhipskind.fihaven.AppViewModel
import com.danielhipskind.fihaven.core.CTConstants
import com.danielhipskind.fihaven.core.Money
import com.danielhipskind.fihaven.core.logic.PaidState
import com.danielhipskind.fihaven.core.model.Bill
import com.danielhipskind.fihaven.ui.theme.Ct

@Composable
fun BillsScreen(vm: AppViewModel, padding: PaddingValues) {
    val data by vm.data.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<Bill?>(null) }
    var creating by remember { mutableStateOf(false) }
    var paying by remember { mutableStateOf<Bill?>(null) }
    val bills = data.bills.sortedBy { it.dueDay ?: 99 }

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        ScreenHeader("Bills", onAdd = { creating = true })
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (bills.isEmpty()) {
                item { CtCard { Text("No bills yet. Tap + to add one.", color = Ct.colors.muted) } }
            }
            items(bills, key = { it.id }) { bill ->
                BillRow(
                    bill = bill,
                    state = vm.paidState("bill", bill.id.toString()),
                    paidSoFar = vm.paidAmountFor("bill", bill.id.toString()),
                    onPay = { paying = bill },
                    onEdit = { editing = bill },
                )
            }
        }
    }

    if (creating) BillEditorDialog(null, vm, onDismiss = { creating = false })
    editing?.let { BillEditorDialog(it, vm, onDismiss = { editing = null }) }
    paying?.let { PayDialog(vm, "bill", it.id.toString(), it.name) { paying = null } }
}

@Composable
private fun BillRow(bill: Bill, state: PaidState, paidSoFar: Double, onPay: () -> Unit, onEdit: () -> Unit) {
    CtCard(padding = 14) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onPay) {
                Icon(
                    if (state == PaidState.FULL) Icons.Filled.CheckCircle else Icons.Outlined.Circle,
                    contentDescription = "Pay",
                    tint = when (state) {
                        PaidState.FULL -> Ct.colors.green
                        PaidState.PARTIAL -> Ct.colors.orange
                        PaidState.UNPAID -> Ct.colors.muted
                    },
                )
            }
            Text(CTConstants.iconForCategory(bill.category), fontSize = 20.sp,
                modifier = Modifier.padding(horizontal = 8.dp))
            Column(Modifier.weight(1f).clickable(onClick = onEdit)) {
                Text(bill.name, color = Ct.colors.text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                Text(
                    when (state) {
                        PaidState.FULL -> "Paid this month"
                        PaidState.PARTIAL -> "Paid ${Money.fmt(paidSoFar)} of ${Money.fmt(bill.amount)}"
                        PaidState.UNPAID -> bill.dueDay?.let { "Due on the $it" } ?: "No due date"
                    },
                    color = if (state == PaidState.PARTIAL) Ct.colors.orange else Ct.colors.muted, fontSize = 12.sp,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(Money.fmt(bill.amount), color = Ct.colors.text, fontSize = 15.sp,
                    fontWeight = FontWeight.Medium, fontFamily = PlexMono)
                if (bill.autopay) Text("autopay", color = Ct.colors.muted, fontSize = 9.sp, fontFamily = PlexMono)
            }
        }
    }
}

private val BILL_FREQUENCIES = listOf("Monthly", "Weekly", "Bi-weekly", "Quarterly", "Annually")

@Composable
fun BillEditorDialog(bill: Bill?, vm: AppViewModel, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf(bill?.name ?: "") }
    var category by remember { mutableStateOf(bill?.category ?: "Other") }
    var amount by remember { mutableStateOf(bill?.amount?.takeIf { it != 0.0 }?.toString() ?: "") }
    var dueDay by remember { mutableStateOf(bill?.dueDay?.toString() ?: "1") }
    var frequency by remember { mutableStateOf(bill?.frequency ?: "Monthly") }
    var autopay by remember { mutableStateOf(bill?.autopay ?: false) }
    var notes by remember { mutableStateOf(bill?.notes ?: "") }

    FormDialog(
        title = if (bill == null) "New Bill" else "Edit Bill",
        saveEnabled = name.isNotBlank(),
        onSave = {
            vm.upsertBill(
                Bill(
                    id = bill?.id ?: System.currentTimeMillis().toInt(),
                    name = name.trim(), category = category,
                    amount = amount.toDoubleOrNull() ?: 0.0,
                    dueDay = dueDay.toIntOrNull()?.coerceIn(1, 31) ?: 1,
                    frequency = frequency, autopay = autopay, notes = notes,
                )
            )
            onDismiss()
        },
        onDismiss = onDismiss,
        onDelete = bill?.let { { vm.deleteBill(it); onDismiss() } },
    ) {
        OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        DropdownField("Category", CTConstants.categories, category) { category = it }
        OutlinedTextField(amount, { amount = it }, label = { Text("Amount") }, prefix = { Text("$") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(dueDay, { dueDay = it.filter(Char::isDigit).take(2) }, label = { Text("Due day (1–31)") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.fillMaxWidth())
        DropdownField("Frequency", BILL_FREQUENCIES, frequency) { frequency = it }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Autopay", color = Ct.colors.text, modifier = Modifier.weight(1f))
            Switch(checked = autopay, onCheckedChange = { autopay = it })
        }
        OutlinedTextField(notes, { notes = it }, label = { Text("Notes") }, modifier = Modifier.fillMaxWidth())
    }
}
