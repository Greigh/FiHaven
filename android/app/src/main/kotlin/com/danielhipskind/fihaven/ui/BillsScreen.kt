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
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import com.danielhipskind.fihaven.AppViewModel
import com.danielhipskind.fihaven.core.CTConstants
import com.danielhipskind.fihaven.core.logic.DateLogic
import com.danielhipskind.fihaven.core.Money
import com.danielhipskind.fihaven.core.logic.PaidState
import com.danielhipskind.fihaven.core.model.Bill
import com.danielhipskind.fihaven.core.model.SpendTransaction
import com.danielhipskind.fihaven.ui.theme.Ct

@Composable
fun BillsScreen(vm: AppViewModel, padding: PaddingValues) {
    val data by vm.data.collectAsStateWithLifecycle()
    val ent by vm.entitlement.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<Bill?>(null) }
    var creating by remember { mutableStateOf(false) }
    var paying by remember { mutableStateOf<Bill?>(null) }
    var sortKey by remember { mutableStateOf("due") }
    var showFilters by remember { mutableStateOf(false) }
    var fUnpaid by remember { mutableStateOf(false) }
    var fOverdue by remember { mutableStateOf(false) }
    var fAutopay by remember { mutableStateOf(false) }
    var fOnCard by remember { mutableStateOf(false) }
    var fCategory by remember { mutableStateOf("All") }
    val zone = vm.zone()

    val filtered = data.bills.filter { b ->
        if (fUnpaid && vm.paidState("bill", b.id.toString()) == PaidState.FULL) return@filter false
        if (fOverdue && !(b.dueDay != null && DateLogic.daysUntilDue(b.dueDay!!, zone) < 0)) return@filter false
        if (fAutopay && !b.autopay) return@filter false
        if (fOnCard && b.cardId == null) return@filter false
        if (fCategory != "All" && b.category != fCategory) return@filter false
        true
    }
    val bills = when (sortKey) {
        "amount-desc" -> filtered.sortedByDescending { it.amount }
        "amount-asc" -> filtered.sortedBy { it.amount }
        "name" -> filtered.sortedBy { it.name.lowercase() }
        "unpaid" -> filtered.sortedWith(
            compareBy({ if (vm.paidState("bill", it.id.toString()) == PaidState.FULL) 1 else 0 }, { it.dueDay ?: 99 })
        )
        else -> filtered.sortedBy { it.dueDay ?: 99 }
    }
    val filterCount = listOf(fUnpaid, fOverdue, fAutopay, fOnCard).count { it } + if (fCategory != "All") 1 else 0
    val subs = detectSubscriptions(data.bills, data.transactions, zone)

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        ScreenHeader("Bills", onAdd = { creating = true })
        SortFilterBar(
            sortOptions = listOf(
                "due" to "Due date", "amount-desc" to "Largest first", "amount-asc" to "Smallest first",
                "unpaid" to "Need to pay first", "name" to "Name (A–Z)",
            ),
            sortKey = sortKey, onSortChange = { sortKey = it },
            filterCount = filterCount, onFilters = { showFilters = true },
        )
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            // Subscription finder is a Pro insight (Balanced tiering).
            if (ent.pro && subs.isNotEmpty()) {
                item { SubscriptionsCard(subs) }
            }
            if (bills.isEmpty()) {
                item { CtCard { Text("No bills yet. Tap + to add one.", color = Ct.colors.muted) } }
            }
            items(bills, key = { it.id }) { bill ->
                val dismissState = rememberSwipeToDismissBoxState(
                    confirmValueChange = { value ->
                        if (value == SwipeToDismissBoxValue.StartToEnd) {
                            paying = bill
                            false
                        } else if (value == SwipeToDismissBoxValue.EndToStart) {
                            vm.deleteBill(bill)
                            true
                        } else {
                            false
                        }
                    }
                )
                SwipeToDismissBox(
                    state = dismissState,
                    backgroundContent = {
                        val color = when (dismissState.dismissDirection) {
                            SwipeToDismissBoxValue.StartToEnd -> Ct.colors.green
                            SwipeToDismissBoxValue.EndToStart -> Ct.colors.red
                            else -> Color.Transparent
                        }
                        val alignment = when (dismissState.dismissDirection) {
                            SwipeToDismissBoxValue.StartToEnd -> Alignment.CenterStart
                            SwipeToDismissBoxValue.EndToStart -> Alignment.CenterEnd
                            else -> Alignment.Center
                        }
                        val icon = when (dismissState.dismissDirection) {
                            SwipeToDismissBoxValue.StartToEnd -> Icons.Default.Check
                            SwipeToDismissBoxValue.EndToStart -> Icons.Default.Delete
                            else -> null
                        }
                        Box(
                            Modifier
                                .fillMaxSize()
                                .clip(RoundedCornerShape(12.dp))
                                .background(color)
                                .padding(horizontal = 20.dp),
                            contentAlignment = alignment
                        ) {
                            icon?.let {
                                Icon(
                                    imageVector = it,
                                    contentDescription = null,
                                    tint = Color.White
                                )
                            }
                        }
                    },
                    modifier = Modifier.clip(RoundedCornerShape(12.dp))
                ) {
                    BillRow(
                        bill = bill,
                        state = vm.paidState("bill", bill.id.toString()),
                        paidSoFar = vm.paidAmountFor("bill", bill.id.toString()),
                        chargedTo = bill.cardId?.let { id -> data.cards.firstOrNull { it.id.toString() == id }?.name },
                        skipped = vm.isSkipped("bill", bill.id.toString()),
                        onPay = { paying = bill },
                        onEdit = { editing = bill },
                        onSkip = { vm.skipMonth("bill", bill.id.toString(), bill.name) },
                        onUnskip = { vm.unskip("bill", bill.id.toString()) },
                    )
                }
            }
        }
    }

    if (creating) BillEditorDialog(null, vm, onDismiss = { creating = false })
    editing?.let { BillEditorDialog(it, vm, onDismiss = { editing = null }) }
    paying?.let { PayDialog(vm, "bill", it.id.toString(), it.name) { paying = null } }

    if (showFilters) {
        FormDialog("Filter bills", saveEnabled = true, onSave = { showFilters = false },
            onDismiss = { showFilters = false }) {
            FilterSwitch("Unpaid only", fUnpaid) { fUnpaid = it }
            FilterSwitch("Overdue only", fOverdue) { fOverdue = it }
            FilterSwitch("Autopay only", fAutopay) { fAutopay = it }
            FilterSwitch("Charged to a card", fOnCard) { fOnCard = it }
            DropdownField("Category", listOf("All") + CTConstants.categories, fCategory) { fCategory = it }
            Text("Clear filters", color = Ct.colors.accent, fontSize = 14.sp,
                modifier = Modifier.clickable {
                    fUnpaid = false; fOverdue = false; fAutopay = false; fOnCard = false; fCategory = "All"
                }.padding(top = 6.dp))
        }
    }
}

@Composable
private fun BillRow(
    bill: Bill,
    state: PaidState,
    paidSoFar: Double,
    chargedTo: String? = null,
    skipped: Boolean = false,
    onPay: () -> Unit,
    onEdit: () -> Unit,
    onSkip: () -> Unit = {},
    onUnskip: () -> Unit = {},
) {
    CtCard(padding = 14) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onPay) {
                Icon(
                    if (state == PaidState.FULL && !skipped) Icons.Filled.CheckCircle else Icons.Outlined.Circle,
                    contentDescription = "Pay",
                    tint = when {
                        skipped -> Ct.colors.muted
                        state == PaidState.FULL -> Ct.colors.green
                        state == PaidState.PARTIAL -> Ct.colors.orange
                        else -> Ct.colors.muted
                    },
                )
            }
            Text(CTConstants.iconForCategory(bill.category), fontSize = 20.sp,
                modifier = Modifier.padding(horizontal = 8.dp))
            Column(Modifier.weight(1f).clickable(onClick = onEdit)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(bill.name, color = Ct.colors.text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                    if (!bill.business.isNullOrBlank()) {
                        Text("· ${bill.business}", color = Ct.colors.muted, fontSize = 14.sp)
                    }
                }
                Text(
                    if (skipped) "⏭ Skipped this month" else when (state) {
                        PaidState.FULL -> "Paid this month"
                        PaidState.PARTIAL -> "Paid ${Money.fmt(paidSoFar)} of ${Money.fmt(bill.amount)}"
                        PaidState.UNPAID -> bill.dueDay?.let { "Due on the $it" } ?: "No due date"
                    },
                    color = if (state == PaidState.PARTIAL && !skipped) Ct.colors.orange else Ct.colors.muted, fontSize = 12.sp,
                )
                if (!chargedTo.isNullOrBlank()) {
                    Text("💳 Charged to $chargedTo · not a bank debit",
                        color = Ct.colors.muted, fontSize = 11.sp)
                }
                // Skip / un-skip affordance.
                if (skipped) {
                    Text("Undo skip", color = Ct.colors.accent, fontSize = 12.sp,
                        modifier = Modifier.clickable(onClick = onUnskip).padding(top = 2.dp))
                } else if (state == PaidState.UNPAID) {
                    Text("Skip this month", color = Ct.colors.muted, fontSize = 12.sp,
                        modifier = Modifier.clickable(onClick = onSkip).padding(top = 2.dp))
                }
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
    var business by remember { mutableStateOf(bill?.business ?: "") }
    var category by remember { mutableStateOf(bill?.category ?: "Other") }
    var amount by remember { mutableStateOf(bill?.amount?.takeIf { it != 0.0 }?.toString() ?: "") }
    var dueDay by remember { mutableStateOf(bill?.dueDay?.toString() ?: "1") }
    var frequency by remember { mutableStateOf(bill?.frequency ?: "Monthly") }
    var autopay by remember { mutableStateOf(bill?.autopay ?: false) }
    var notes by remember { mutableStateOf(bill?.notes ?: "") }
    var cardId by remember { mutableStateOf(bill?.cardId ?: "") }
    val data by vm.data.collectAsStateWithLifecycle()
    val cardOptions = listOf("Direct (bank / cash)" to "") + data.cards.map { it.name to it.id.toString() }

    FormDialog(
        title = if (bill == null) "New Bill" else "Edit Bill",
        saveEnabled = name.isNotBlank(),
        onSave = {
            vm.upsertBill(
                Bill(
                    id = bill?.id ?: System.currentTimeMillis().toInt(),
                    name = name.trim(),
                    business = business.trim().takeIf { it.isNotBlank() },
                    category = category,
                    amount = amount.toDoubleOrNull() ?: 0.0,
                    dueDay = dueDay.toIntOrNull()?.coerceIn(1, 31) ?: 1,
                    frequency = frequency, autopay = autopay, notes = notes,
                    cardId = cardId.takeIf { it.isNotBlank() },
                )
            )
            onDismiss()
        },
        onDismiss = onDismiss,
        onDelete = bill?.let { { vm.deleteBill(it); onDismiss() } },
    ) {
        OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(business, { business = it }, label = { Text("Business / Provider") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        DropdownField("Category", CTConstants.categories, category) { category = it }
        OutlinedTextField(amount, { amount = it }, label = { Text("Amount") }, prefix = { Text("$") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(dueDay, { dueDay = it.filter(Char::isDigit).take(2) }, label = { Text("Due day (1–31)") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.fillMaxWidth())
        DropdownField("Frequency", BILL_FREQUENCIES, frequency) { frequency = it }
        DropdownField(
            "Charged to",
            cardOptions.map { it.first },
            cardOptions.firstOrNull { it.second == cardId }?.first ?: "Direct (bank / cash)",
        ) { label -> cardId = cardOptions.firstOrNull { it.first == label }?.second ?: "" }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Autopay", color = Ct.colors.text, modifier = Modifier.weight(1f))
            Switch(checked = autopay, onCheckedChange = { autopay = it })
        }
        OutlinedTextField(notes, { notes = it }, label = { Text("Notes") }, modifier = Modifier.fillMaxWidth())
    }
}

private data class SubItem(
    val id: String, val name: String, val monthly: Double,
    val source: String, val priceUp: Double?, val stale: Boolean,
)

private fun monthlyOfBill(b: Bill): Double = when (b.frequency) {
    "Weekly" -> b.amount * 52 / 12
    "Bi-weekly" -> b.amount * 26 / 12
    "Quarterly" -> b.amount / 3
    "Annually" -> b.amount / 12
    else -> b.amount
}

private fun detectSubscriptions(
    bills: List<Bill>,
    txs: List<SpendTransaction>,
    zone: java.time.ZoneId,
): List<SubItem> {
    val out = mutableListOf<SubItem>()
    bills.filter { it.category == "Subscriptions" }.forEach { b ->
        out.add(SubItem("bill-${b.id}", b.name.ifBlank { "Subscription" }, monthlyOfBill(b), "bill", null, false))
    }
    txs.filter { it.merchant.trim().isNotEmpty() }
        .groupBy { it.merchant.trim().lowercase() }
        .forEach { (_, list) ->
            if (list.map { it.date.take(7) }.toSet().size < 2) return@forEach
            val latest = list.sortedBy { it.date }.last()
            val minAmt = list.minOf { it.amount }
            val days = DateLogic.parseDate(latest.date)?.let {
                java.time.temporal.ChronoUnit.DAYS.between(it, DateLogic.today(zone))
            } ?: 0L
            out.add(SubItem("tx-${latest.merchant}", latest.merchant, latest.amount, "tx",
                if (latest.amount > minAmt + 0.005) minAmt else null, days > 60))
        }
    return out.sortedByDescending { it.monthly }
}

@Composable
private fun SubscriptionsCard(subs: List<SubItem>) {
    val total = subs.sumOf { it.monthly }
    CtCard(padding = 14) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("SUBSCRIPTIONS", color = Ct.colors.muted, fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Text("${Money.fmt(total)}/mo · ${subs.size}", color = Ct.colors.muted,
                    fontSize = 12.sp, fontFamily = PlexMono)
            }
            Column(Modifier.padding(top = 6.dp)) {
                subs.forEach { s ->
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 5.dp)) {
                        Text(if (s.source == "bill") "📄" else "🔁", fontSize = 15.sp,
                            modifier = Modifier.padding(end = 10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(s.name, color = Ct.colors.text, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            Text(
                                when {
                                    s.priceUp != null -> "▲ was ${Money.fmt(s.priceUp)}"
                                    s.stale -> "⚠ unused 60d+"
                                    s.source == "bill" -> "Tracked bill"
                                    else -> "Recurring charge"
                                },
                                color = when {
                                    s.priceUp != null -> Ct.colors.orange
                                    s.stale -> Ct.colors.red
                                    else -> Ct.colors.muted
                                },
                                fontSize = 11.sp,
                            )
                        }
                        Text("${Money.fmt(s.monthly)}/mo", color = Ct.colors.text, fontSize = 13.sp, fontFamily = PlexMono)
                    }
                }
            }
        }
    }
}
