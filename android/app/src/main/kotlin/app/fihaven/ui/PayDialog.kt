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
import app.fihaven.core.model.Card
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

    // Each preset shows what's *left* toward its target after the payments already
    // recorded this period, so paying part of a card and coming back doesn't
    // re-suggest the whole amount; a target already covered drops out entirely.
    val presets: List<PayPreset> =
            remember(data, type, refId, alreadyPaid) {
                val partly = alreadyPaid > Schedule.PAID_EPSILON
                // The sub notes the payments already counted, so a shrunken
                // figure is never a mystery.
                fun preset(label: String, sub: String, target: Double): PayPreset? {
                    val left = (target - alreadyPaid).coerceAtLeast(0.0)
                    if (partly && left <= Schedule.PAID_EPSILON) return null
                    val note =
                            if (partly)
                                    "$sub · ${Money.fmt(alreadyPaid)} of ${Money.fmt(target)} paid"
                            else sub
                    return PayPreset(label, note, left)
                }

                if (type == "bill") {
                    val amt = data.bills.firstOrNull { it.id.toString() == refId }?.amount ?: 0.0
                    listOfNotNull(preset("Full amount", "The whole bill", amt))
                } else {
                    val card = data.cards.firstOrNull { it.id.toString() == refId }
                    fun target(kind: Schedule.PayTarget, c: Card) =
                            Schedule.payTarget(kind, c, alreadyPaid, zone)
                    if (card == null) emptyList()
                    else if (card.type == "loan")
                    // Loans: scheduled monthly payment, plus paying off the
                    // remaining principal in full as an explicit option.
                    buildList {
                                add(preset("Monthly payment", "Your scheduled payment",
                                        target(Schedule.PayTarget.MONTHLY, card)))
                                if (target(Schedule.PayTarget.PAYOFF, card) >
                                                target(Schedule.PayTarget.MONTHLY, card) + Schedule.PAID_EPSILON) {
                                    add(preset("Pay off in full", "Clears the remaining principal",
                                            target(Schedule.PayTarget.PAYOFF, card)))
                                }
                            }
                            .filterNotNull()
                    else
                            buildList {
                                add(preset("Minimum", "Minimum payment",
                                        target(Schedule.PayTarget.MINIMUM, card)))
                                if (target(Schedule.PayTarget.RECOMMENDED, card) >
                                                target(Schedule.PayTarget.MINIMUM, card) + Schedule.PAID_EPSILON) {
                                    val sub =
                                            when {
                                                (card.recommendedPayment ?: 0.0) > 0.0 ->
                                                        "Your set payment"
                                                card.hasPromo -> "Clears the 0% promo in time"
                                                else -> "Pays off the balance"
                                            }
                                    add(preset("Recommended", sub,
                                            target(Schedule.PayTarget.RECOMMENDED, card)))
                                }
                            }
                                    .filterNotNull()
                }
            }

    // Default to whatever still gets the item to its goal. Once the goal is met the
    // field starts empty — an extra payment is a deliberate amount to type, not the
    // whole recommendation offered up a second time.
    val initial =
            (goal - alreadyPaid).coerceAtLeast(0.0).let {
                when {
                    it > Schedule.PAID_EPSILON -> it
                    alreadyPaid > Schedule.PAID_EPSILON -> 0.0
                    else -> goal
                }
            }
    var amount by remember { mutableStateOf(if (initial > 0) "%.2f".format(initial) else "") }
    val today = DateLogic.today(zone)
    var dateStr by remember {
        mutableStateOf("%04d-%02d-%02d".format(today.year, today.monthValue, today.dayOfMonth))
    }
    var note by remember { mutableStateOf("") }
    var showDuplicateAlert by remember { mutableStateOf(false) }
    var showPromoClearAlert by remember { mutableStateOf(false) }

    val amountVal = amount.toDoubleOrNull() ?: 0.0

    fun savePaymentAndMaybePromoPrompt() {
        val date = DateLogic.parseDate(dateStr) ?: today
        vm.recordPayment(type, refId, name, amountVal, date, note.trim())
        if (type == "card" && vm.cardNeedsPromoClearPrompt(refId)) {
            showPromoClearAlert = true
        } else {
            onDismiss()
        }
    }

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
                // Already at the goal before this payment: say so, instead of
                // claiming the amount being typed is what marks it paid.
                alreadyPaid >= goal - Schedule.PAID_EPSILON ->
                        "✓ $name is already fully paid this period (${Money.fmt(alreadyPaid)} of ${Money.fmt(goal)} · $policyLabel). Anything you record here is an extra payment."
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
                                savePaymentAndMaybePromoPrompt()
                            }
                    ) { Text("Save Payment") }
                },
                dismissButton = {
                    TextButton(onClick = { showDuplicateAlert = false }) { Text("Cancel") }
                }
        )
    }

    if (showPromoClearAlert) {
        androidx.compose.material3.AlertDialog(
                onDismissRequest = {
                    vm.resolvePromoClearPrompt(refId, clear = false)
                    onDismiss()
                },
                title = { Text("Remove 0% promo?") },
                text = { Text("This card is paid off. Remove the 0% promo?") },
                confirmButton = {
                    TextButton(
                            onClick = {
                                vm.resolvePromoClearPrompt(refId, clear = true)
                                onDismiss()
                            }
                    ) { Text("Remove promo") }
                },
                dismissButton = {
                    TextButton(
                            onClick = {
                                vm.resolvePromoClearPrompt(refId, clear = false)
                                onDismiss()
                            }
                    ) { Text("Keep promo") }
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
                    savePaymentAndMaybePromoPrompt()
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
        DateField("Date paid", dateStr, { dateStr = it }, clearable = false)
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
