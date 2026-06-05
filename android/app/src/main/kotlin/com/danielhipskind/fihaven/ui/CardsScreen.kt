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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.danielhipskind.fihaven.AppViewModel
import com.danielhipskind.fihaven.core.CTConstants
import com.danielhipskind.fihaven.core.Money
import com.danielhipskind.fihaven.core.logic.DateLogic
import com.danielhipskind.fihaven.core.logic.PaidState
import com.danielhipskind.fihaven.core.model.Card
import com.danielhipskind.fihaven.ui.theme.Ct
import kotlin.math.min

@Composable
fun CardsScreen(vm: AppViewModel, padding: PaddingValues) {
    val data by vm.data.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<Card?>(null) }
    var creating by remember { mutableStateOf(false) }
    var paying by remember { mutableStateOf<Card?>(null) }
    val cards = data.cards.sortedByDescending { it.balance }

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        ScreenHeader("Cards", onAdd = { creating = true })
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (cards.isEmpty()) {
                item { CtCard { Text("No cards yet. Tap + to add one.", color = Ct.colors.muted) } }
            }
            items(cards, key = { it.id }) { card ->
                CardRow(
                    card = card,
                    zone = vm.zone(),
                    state = vm.paidState("card", card.id.toString()),
                    paidSoFar = vm.paidAmountFor("card", card.id.toString()),
                    goal = vm.goalAmount("card", card.id.toString()),
                    onPay = { paying = card },
                    onEdit = { editing = card },
                )
            }
        }
    }

    if (creating) CardEditorDialog(null, vm, onDismiss = { creating = false })
    editing?.let { CardEditorDialog(it, vm, onDismiss = { editing = null }) }
    paying?.let { PayDialog(vm, "card", it.id.toString(), it.name) { paying = null } }
}

@Composable
private fun CardRow(
    card: Card,
    zone: java.time.ZoneId,
    state: PaidState,
    paidSoFar: Double,
    goal: Double,
    onPay: () -> Unit,
    onEdit: () -> Unit,
) {
    val util = if (card.limit > 0) min(1.0, card.balance / card.limit) else 0.0
    val promoActive = card.hasPromo && DateLogic.monthsUntil(card.promoEndDate, zone) > 0
    CtCard(Modifier.clickable(onClick = onEdit)) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(CTConstants.cardIcon, fontSize = 20.sp, modifier = Modifier.padding(end = 8.dp))
                Text(card.name, color = Ct.colors.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f))
                Text(Money.fmt(card.balance), color = Ct.colors.text, fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold, fontFamily = PlexMono)
            }
            LinearProgressIndicator(
                progress = { util.toFloat() },
                color = if (util > 0.5) Ct.colors.orange else Ct.colors.accent,
                trackColor = Ct.colors.surface2,
                modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp).clip(RoundedCornerShape(3.dp)),
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${(util * 100).toInt()}% of ${Money.fmtShort(card.limit)}",
                    color = Ct.colors.muted, fontSize = 12.sp, modifier = Modifier.weight(1f))
                if (promoActive) {
                    Text("0% promo", color = Ct.colors.green, fontSize = 10.sp, fontFamily = PlexMono)
                } else {
                    Text("%.2f%% APR".format(card.regularAPR), color = Ct.colors.muted,
                        fontSize = 11.sp, fontFamily = PlexMono)
                }
            }
            HorizontalDivider(color = Ct.colors.border, modifier = Modifier.padding(vertical = 8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    when (state) {
                        PaidState.FULL -> "Paid ${Money.fmt(paidSoFar)} this month"
                        PaidState.PARTIAL -> "Paid ${Money.fmt(paidSoFar)} of ${Money.fmt(goal)}"
                        PaidState.UNPAID -> "Not paid this month"
                    },
                    color = when (state) {
                        PaidState.FULL -> Ct.colors.green
                        PaidState.PARTIAL -> Ct.colors.orange
                        PaidState.UNPAID -> Ct.colors.muted
                    },
                    fontSize = 12.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f),
                )
                if (state != PaidState.FULL) {
                    TextButton(onClick = onPay) {
                        Text(if (state == PaidState.PARTIAL) "Pay more" else "Pay", color = Ct.colors.green)
                    }
                }
            }
        }
    }
}

@Composable
fun CardEditorDialog(card: Card?, vm: AppViewModel, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf(card?.name ?: "") }
    var balance by remember { mutableStateOf(card?.balance?.takeIf { it != 0.0 }?.toString() ?: "") }
    var limit by remember { mutableStateOf(card?.limit?.takeIf { it != 0.0 }?.toString() ?: "") }
    var minPayment by remember { mutableStateOf(card?.minPayment?.takeIf { it != 0.0 }?.toString() ?: "") }
    var recommendedPayment by remember { mutableStateOf(card?.recommendedPayment?.takeIf { it != 0.0 }?.toString() ?: "") }
    var apr by remember { mutableStateOf(card?.regularAPR?.takeIf { it != 0.0 }?.toString() ?: "") }
    var dueDay by remember { mutableStateOf(card?.dueDay?.toString() ?: "1") }
    var autopay by remember { mutableStateOf(card?.autopay ?: false) }
    var notes by remember { mutableStateOf(card?.notes ?: "") }
    var hasPromo by remember { mutableStateOf(card?.hasPromo ?: false) }
    var promoApr by remember { mutableStateOf(card?.promoAPR?.toString() ?: "0") }
    var promoBalance by remember { mutableStateOf(card?.promoBalance?.toString() ?: "") }
    var promoEnd by remember { mutableStateOf(card?.promoEndDate ?: "") }

    FormDialog(
        title = if (card == null) "New Card" else "Edit Card",
        saveEnabled = name.isNotBlank(),
        onSave = {
            vm.upsertCard(
                Card(
                    id = card?.id ?: System.currentTimeMillis().toInt(),
                    name = name.trim(),
                    balance = balance.toDoubleOrNull() ?: 0.0,
                    limit = limit.toDoubleOrNull() ?: 0.0,
                    minPayment = minPayment.toDoubleOrNull() ?: 0.0,
                    recommendedPayment = recommendedPayment.toDoubleOrNull()?.takeIf { it > 0.0 },
                    regularAPR = apr.toDoubleOrNull() ?: 0.0,
                    hasPromo = hasPromo,
                    promoAPR = if (hasPromo) promoApr.toDoubleOrNull() else null,
                    promoEndDate = if (hasPromo) promoEnd.ifBlank { null } else null,
                    promoBalance = if (hasPromo) promoBalance.toDoubleOrNull() else null,
                    dueDay = dueDay.toIntOrNull()?.coerceIn(1, 31) ?: 1,
                    autopay = autopay, notes = notes,
                )
            )
            onDismiss()
        },
        onDismiss = onDismiss,
        onDelete = card?.let { { vm.deleteCard(it); onDismiss() } },
    ) {
        OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        money(balance, "Balance") { balance = it }
        money(limit, "Credit limit") { limit = it }
        money(minPayment, "Minimum payment") { minPayment = it }
        money(recommendedPayment, "Recommended payment (optional)") { recommendedPayment = it }
        Text("Leave blank to default to the full balance (or the 0%-promo payoff).",
            color = Ct.colors.muted, fontSize = 12.sp)
        OutlinedTextField(apr, { apr = it }, label = { Text("Regular APR %") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(dueDay, { dueDay = it.filter(Char::isDigit).take(2) }, label = { Text("Due day (1–31)") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.fillMaxWidth())
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Autopay", color = Ct.colors.text, modifier = Modifier.weight(1f))
            Switch(checked = autopay, onCheckedChange = { autopay = it })
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("0% / promo APR", color = Ct.colors.text, modifier = Modifier.weight(1f))
            Switch(checked = hasPromo, onCheckedChange = { hasPromo = it })
        }
        if (hasPromo) {
            OutlinedTextField(promoApr, { promoApr = it }, label = { Text("Promo APR %") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.fillMaxWidth())
            money(promoBalance, "Promo balance") { promoBalance = it }
            OutlinedTextField(promoEnd, { promoEnd = it }, label = { Text("Promo ends (YYYY-MM-DD)") },
                singleLine = true, modifier = Modifier.fillMaxWidth())
        }
        OutlinedTextField(notes, { notes = it }, label = { Text("Notes") }, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun money(value: String, label: String, onChange: (String) -> Unit) {
    OutlinedTextField(value, onChange, label = { Text(label) }, prefix = { Text("$") },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        singleLine = true, modifier = Modifier.fillMaxWidth())
}
