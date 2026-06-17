package app.fihaven.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.text.input.KeyboardType
import app.fihaven.AppViewModel
import app.fihaven.core.model.Payment

/** Edit an existing payment's amount, date, and note. */
@Composable
fun EditPaymentDialog(payment: Payment, vm: AppViewModel, onDismiss: () -> Unit) {
    var amount by remember { mutableStateOf("%.2f".format(payment.amount)) }
    var dateIso by remember { mutableStateOf(payment.date) }
    var note by remember { mutableStateOf(payment.note) }
    val amountVal = amount.toDoubleOrNull() ?: 0.0

    FormDialog(
        title = "Edit payment",
        saveEnabled = amountVal > 0 && dateIso.isNotBlank(),
        onSave = {
            vm.updatePayment(payment, amountVal, dateIso.trim(), note.trim())
            onDismiss()
        },
        onDismiss = onDismiss,
    ) {
        OutlinedTextField(
            value = amount,
            onValueChange = { amount = it },
            label = { Text("Amount") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        )
        OutlinedTextField(
            value = dateIso,
            onValueChange = { dateIso = it },
            label = { Text("Date (YYYY-MM-DD)") },
            singleLine = true,
        )
        OutlinedTextField(
            value = note,
            onValueChange = { note = it },
            label = { Text("Note") },
            minLines = 2,
        )
    }
}
