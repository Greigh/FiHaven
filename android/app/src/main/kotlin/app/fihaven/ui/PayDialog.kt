package app.fihaven.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.fihaven.AppViewModel
import app.fihaven.core.Money
import app.fihaven.core.logic.DateLogic
import app.fihaven.core.logic.PaidGoalPolicy
import app.fihaven.core.logic.Schedule
import app.fihaven.ui.theme.Ct
import app.fihaven.ui.theme.PlexMono
import kotlin.math.abs

private data class PayPreset(val label: String, val sub: String, val amount: Double)

/**
 * Record a payment toward a bill/card with quick presets — Full for bills, Minimum / Recommended
 * for cards — plus a custom amount and a goal hint. Payments accumulate toward the monthly goal.
 * Mirrors the web pay modal.
 */
@Composable
fun PayDialog(vm: AppViewModel, type: String, refId: String, name: String, onDismiss: () -> Unit) {
    val data by vm.data.collectAsStateWithLifecycle()
    val zone = vm.zone()
    val goal = vm.goalAmount(type, refId)
    val alreadyPaid = vm.paidAmountFor(type, refId)

    val presets: List<PayPreset> =
            remember(data, type, refId) {
                if (type == "bill") {
                    val amt = data.bills.firstOrNull { it.id.toString() == refId }?.amount ?: 0.0
                    listOf(PayPreset("Full amount", "The whole bill", amt))
                } else {
                    val card = data.cards.firstOrNull { it.id.toString() == refId }
                    if (card == null) emptyList()
                    else if (card.type == "loan")
                    // Loans: scheduled monthly payment, plus paying off the
                    // remaining principal in full as an explicit option.
                    buildList {
                                add(PayPreset("Monthly payment", "Your scheduled payment", card.minPayment))
                                if (card.balance > card.minPayment + Schedule.PAID_EPSILON) {
                                    add(PayPreset("Pay off in full", "Clears the remaining principal", card.balance))
                                }
                            }
                    else
                            buildList {
                                add(PayPreset("Minimum", "Minimum payment", card.minPayment))
                                val rec = Schedule.recommendedAmount(card, zone)
                                if (rec > card.minPayment + Schedule.PAID_EPSILON) {
                                    val sub =
                                            when {
                                                (card.recommendedPayment ?: 0.0) > 0.0 ->
                                                        "Your set payment"
                                                card.hasPromo -> "Clears the 0% promo in time"
                                                else -> "Pays off the balance"
                                            }
                                    add(PayPreset("Recommended", sub, rec))
                                }
                            }
                }
            }

    // Default to whatever still gets the item to its goal.
    val initial =
            (goal - alreadyPaid).coerceAtLeast(0.0).let {
                if (it > Schedule.PAID_EPSILON) it else goal
            }
    var amount by remember { mutableStateOf(if (initial > 0) "%.2f".format(initial) else "") }
    val today = DateLogic.today(zone)
    var dateStr by remember {
        mutableStateOf("%04d-%02d-%02d".format(today.year, today.monthValue, today.dayOfMonth))
    }
    var note by remember { mutableStateOf("") }
    var showDuplicateAlert by remember { mutableStateOf(false) }

    val amountVal = amount.toDoubleOrNull() ?: 0.0

    val policyLabel =
            if (type == "bill") "full amount"
            else
                    when (vm.paidGoalPolicy()) {
                        PaidGoalPolicy.MINIMUM -> "minimum"
                        PaidGoalPolicy.RECOMMENDED -> "recommended"
                        PaidGoalPolicy.FULL -> "full balance"
                    }
    val projected = alreadyPaid + amountVal
    val hint =
            when {
                goal <= 0 -> ""
                projected >= goal - Schedule.PAID_EPSILON ->
                        "✓ Marks $name fully paid (goal ${Money.fmt(goal)} · $policyLabel)."
                else -> {
                    val soFar =
                            if (alreadyPaid > Schedule.PAID_EPSILON)
                                    " Already paid ${Money.fmt(alreadyPaid)} this month."
                            else ""
                    "Goal is ${Money.fmt(goal)} ($policyLabel). ${Money.fmt(goal - projected)} will remain after this.$soFar"
                }
            }

    if (showDuplicateAlert) {
        androidx.compose.material3.AlertDialog(
                onDismissRequest = { showDuplicateAlert = false },
                title = { Text("Additional Payment?") },
                text = {
                    Text(
                            "You have already recorded ${Money.fmt(alreadyPaid)} in payments for this card/loan this month. Is this an additional payment?"
                    )
                },
                confirmButton = {
                    TextButton(
                            onClick = {
                                showDuplicateAlert = false
                                val date = DateLogic.parseDate(dateStr) ?: today
                                vm.recordPayment(type, refId, name, amountVal, date, note.trim())
                                onDismiss()
                            }
                    ) { Text("Save Payment") }
                },
                dismissButton = {
                    TextButton(onClick = { showDuplicateAlert = false }) { Text("Cancel") }
                }
        )
    }

    FormDialog(
            title = "Pay · $name",
            saveEnabled = amountVal > 0.0,
            onSave = {
                val date = DateLogic.parseDate(dateStr) ?: today
                val day = date.dayOfMonth
                if (type == "card" && day >= 15 && alreadyPaid > Schedule.PAID_EPSILON) {
                    showDuplicateAlert = true
                } else {
                    vm.recordPayment(type, refId, name, amountVal, date, note.trim())
                    onDismiss()
                }
            },
            onDismiss = onDismiss,
    ) {
        if (presets.isNotEmpty()) {
            FieldLabel("How much?")
            presets.forEach { p ->
                val selected = abs(p.amount - amountVal) < Schedule.PAID_EPSILON
                if (selected) {
                    Button(
                            onClick = { amount = "%.2f".format(p.amount) },
                            colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent),
                            modifier = Modifier.fillMaxWidth(),
                    ) { PresetLabel(p, onAccent = true) }
                } else {
                    OutlinedButton(
                            onClick = { amount = "%.2f".format(p.amount) },
                            modifier = Modifier.fillMaxWidth(),
                    ) { PresetLabel(p, onAccent = false) }
                }
            }
        }
        OutlinedTextField(
                amount,
                { amount = it },
                label = { Text("Amount paid") },
                prefix = { Text("$") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
        )
        if (hint.isNotEmpty()) {
            Text(
                    hint,
                    color =
                            if (projected >= goal - Schedule.PAID_EPSILON) Ct.colors.green
                            else Ct.colors.muted,
                    fontSize = 12.sp
            )
        }
        OutlinedTextField(
                dateStr,
                { dateStr = it },
                label = { Text("Date paid (YYYY-MM-DD)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
                note,
                { note = it },
                label = { Text("Note (optional)") },
                modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun PresetLabel(p: PayPreset, onAccent: Boolean) {
    val main = if (onAccent) Ct.colors.bg else Ct.colors.text
    val sub = if (onAccent) Ct.colors.bg else Ct.colors.muted
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(p.label, color = main, fontWeight = FontWeight.Medium)
            Text(p.sub, color = sub, fontSize = 11.sp)
        }
        Text(
                Money.fmt(p.amount),
                color = main,
                fontFamily = PlexMono,
                fontWeight = FontWeight.Medium
        )
    }
}
