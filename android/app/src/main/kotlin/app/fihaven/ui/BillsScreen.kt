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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import app.fihaven.AppViewModel
import app.fihaven.core.CTConstants
import app.fihaven.core.logic.BillSchedule
import app.fihaven.core.logic.DateLogic
import app.fihaven.core.Money
import app.fihaven.core.logic.PaidState
import app.fihaven.core.model.Bill
import app.fihaven.core.model.genId
import app.fihaven.ui.theme.Ct

@Composable
fun BillsScreen(vm: AppViewModel, padding: PaddingValues) {
    val data by vm.data.collectAsStateWithLifecycle()
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
        if (fOverdue && BillSchedule.daysUntilDue(b, zone) >= 0) return@filter false
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
            compareBy({ if (vm.paidState("bill", it.id.toString()) == PaidState.FULL) 1 else 0 },
                { BillSchedule.daysUntilDue(it, zone) })
        )
        else -> filtered.sortedBy { BillSchedule.daysUntilDue(it, zone) }
    }
    val filterCount = listOf(fUnpaid, fOverdue, fAutopay, fOnCard).count { it } + if (fCategory != "All") 1 else 0

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        ScreenHeader("Bills", onAdd = { creating = true }, branded = true)
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
            if (bills.isEmpty()) {
                item { CtCard { Text("No bills yet. Tap + to add one.", color = Ct.colors.muted) } }
            }
            items(bills, key = { it.id }) { bill ->
                val dismissState = rememberSwipeToDismissBoxState()
                LaunchedEffect(dismissState.currentValue) {
                    when (dismissState.currentValue) {
                        SwipeToDismissBoxValue.StartToEnd -> {
                            paying = bill
                            dismissState.reset()
                        }
                        SwipeToDismissBoxValue.EndToStart -> {
                            vm.deleteBill(bill)
                            dismissState.reset()
                        }
                        else -> Unit
                    }
                }
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
                        zone = zone,
                        state = vm.paidState("bill", bill.id.toString()),
                        paidSoFar = vm.paidAmountFor("bill", bill.id.toString()),
                        chargedTo = bill.cardId?.let { id -> data.cards.firstOrNull { it.id.toString() == id }?.name },
                        skipped = vm.isSkipped("bill", bill.id.toString()),
                        windowLabel = when {
                            DateLogic.billEnded(bill, zone) -> "⏹ Ended ${friendlyDate(bill.endDate)}"
                            DateLogic.billNotStarted(bill, zone) -> "Starts ${friendlyDate(bill.startDate)}"
                            else -> null
                        },
                        onPay = { paying = bill },
                        onUnmark = {
                            vm.setPaid("bill", bill.id.toString(), bill.name, vm.goalAmount("bill", bill.id.toString()), false)
                        },
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
    zone: java.time.ZoneId,
    state: PaidState,
    paidSoFar: Double,
    chargedTo: String? = null,
    skipped: Boolean = false,
    windowLabel: String? = null,
    onPay: () -> Unit,
    onUnmark: () -> Unit = {},
    onEdit: () -> Unit,
    onSkip: () -> Unit = {},
    onUnskip: () -> Unit = {},
) {
    val statusTap: () -> Unit = {
        when {
            skipped -> onUnskip()
            state == PaidState.FULL -> onUnmark()
            else -> onPay()
        }
    }
    CtCard(padding = 14) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = statusTap) {
                Icon(
                    when {
                        skipped -> Icons.Outlined.Circle
                        state == PaidState.FULL -> Icons.Filled.CheckCircle
                        else -> Icons.Outlined.Circle
                    },
                    contentDescription = when {
                        skipped -> "Un-skip"
                        state == PaidState.FULL -> "Undo payment"
                        else -> "Pay"
                    },
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
                Text(bill.name, color = Ct.colors.text, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 1)
                if (!bill.business.isNullOrBlank()) {
                    Text(bill.business ?: "", color = Ct.colors.muted, fontSize = 12.sp, maxLines = 1)
                }
                Text(
                    windowLabel ?: if (skipped) "⏭ Skipped this month" else when (state) {
                        PaidState.FULL -> "Paid this month"
                        PaidState.PARTIAL -> "Paid ${Money.fmt(paidSoFar)} of ${Money.fmt(bill.amount)}"
                        PaidState.UNPAID -> BillSchedule.nextDueDate(bill, zone)?.let { "Next: ${friendlyDate(it)}" }
                            ?: "No due date"
                    },
                    color = if (state == PaidState.PARTIAL && !skipped && windowLabel == null) Ct.colors.orange else Ct.colors.muted,
                    fontSize = 12.sp,
                )
                if (!chargedTo.isNullOrBlank()) {
                    Text("💳 Charged to $chargedTo · not a bank debit",
                        color = Ct.colors.muted, fontSize = 11.sp)
                }
                // Skip / un-skip affordance.
                if (skipped) {
                    Text("Undo skip", color = Ct.colors.accent, fontSize = 12.sp,
                        modifier = Modifier.clickable(onClick = onUnskip).padding(top = 2.dp))
                } else if (state == PaidState.FULL) {
                    Text("Undo payment", color = Ct.colors.accent, fontSize = 12.sp,
                        modifier = Modifier.clickable(onClick = onUnmark).padding(top = 2.dp))
                } else if (state == PaidState.UNPAID && windowLabel == null) {
                    Text("Skip this month", color = Ct.colors.muted, fontSize = 12.sp,
                        modifier = Modifier.clickable(onClick = onSkip).padding(top = 2.dp))
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(Money.fmt(bill.amount), color = Ct.colors.text, fontSize = 15.sp,
                    fontWeight = FontWeight.Medium, fontFamily = PlexMono)
                if (bill.autopay) Text(bill.autopayDay?.let { "autopay · day $it" } ?: "autopay", color = Ct.colors.muted, fontSize = 9.sp, fontFamily = PlexMono)
            }
        }
    }
}

/// "YYYY-MM-DD" or LocalDate → a short "MMM d" label.
private fun friendlyDate(s: String?): String =
    DateLogic.parseDate(s)?.format(
        java.time.format.DateTimeFormatter.ofPattern("MMM d", java.util.Locale.US)
    ) ?: ""

private fun friendlyDate(d: java.time.LocalDate): String {
    val fmt = if (d.year == java.time.LocalDate.now().year) "MMM d" else "MMM d, yyyy"
    return d.format(java.time.format.DateTimeFormatter.ofPattern(fmt, java.util.Locale.US))
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
    var autopayDay by remember { mutableStateOf(bill?.autopayDay?.toString() ?: "") }
    var notes by remember { mutableStateOf(bill?.notes ?: "") }
    var cardId by remember { mutableStateOf(bill?.cardId ?: "") }
    var startDate by remember { mutableStateOf(bill?.startDate ?: "") }
    var endDate by remember { mutableStateOf(bill?.endDate ?: "") }
    val data by vm.data.collectAsStateWithLifecycle()
    val cardOptions = listOf("Direct (bank / cash)" to "") + data.cards.map { it.name to it.id.toString() }

    FormDialog(
        title = if (bill == null) "New Bill" else "Edit Bill",
        saveEnabled = name.isNotBlank(),
        onSave = {
            val start = startDate.ifBlank { null }
            val end = endDate.ifBlank { null }
            // "First bill due on" derives the recurring day-of-month, so a
            // start date overrides the due-day field.
            val derivedDueDay = DateLogic.parseDate(start)?.dayOfMonth
                ?: dueDay.toIntOrNull()?.coerceIn(1, 31) ?: 1
            vm.upsertBill(
                Bill(
                    id = bill?.id ?: genId(),
                    name = name.trim(),
                    business = business.trim().takeIf { it.isNotBlank() },
                    category = category,
                    amount = amount.toDoubleOrNull() ?: 0.0,
                    dueDay = derivedDueDay,
                    frequency = frequency, autopay = autopay,
                    autopayDay = if (autopay) autopayDay.toIntOrNull()?.coerceIn(1, 31) else null,
                    notes = notes,
                    cardId = cardId.takeIf { it.isNotBlank() },
                    startDate = start, endDate = end,
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
        OutlinedTextField(startDate, { startDate = it }, label = { Text("First bill due on (YYYY-MM-DD)") },
            placeholder = { Text("optional — sets the due day") },
            singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(endDate, { endDate = it }, label = { Text("Stops on (YYYY-MM-DD)") },
            placeholder = { Text("optional — marks the bill Ended after") },
            singleLine = true, modifier = Modifier.fillMaxWidth())
        DropdownField(
            "Charged to",
            cardOptions.map { it.first },
            cardOptions.firstOrNull { it.second == cardId }?.first ?: "Direct (bank / cash)",
        ) { label -> cardId = cardOptions.firstOrNull { it.first == label }?.second ?: "" }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Autopay", color = Ct.colors.text, modifier = Modifier.weight(1f))
            Switch(checked = autopay, onCheckedChange = { autopay = it })
        }
        if (autopay) {
            OutlinedTextField(autopayDay, { autopayDay = it.filter(Char::isDigit).take(2) },
                label = { Text("Autopay day (1–31)") },
                placeholder = { Text("defaults to due day") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.fillMaxWidth())
        }
        OutlinedTextField(notes, { notes = it }, label = { Text("Notes") }, modifier = Modifier.fillMaxWidth())
    }
}

