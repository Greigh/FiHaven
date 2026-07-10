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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Icon
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import java.util.UUID
import app.fihaven.core.model.CardPerk
import app.fihaven.core.model.CardOffer
import app.fihaven.core.model.genId
import app.fihaven.core.model.archiveInsteadOfDelete
import app.fihaven.core.logic.Schedule
import androidx.compose.foundation.layout.height
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.ui.graphics.Color
import app.fihaven.AppViewModel
import app.fihaven.core.CTConstants
import app.fihaven.core.Money
import app.fihaven.core.logic.DateLogic
import app.fihaven.core.logic.PaidState
import app.fihaven.core.logic.Rewards
import app.fihaven.core.model.Account
import app.fihaven.core.model.Card
import app.fihaven.ui.theme.Ct
import kotlin.math.min

@Composable
fun CardsScreen(vm: AppViewModel, padding: PaddingValues, kind: String = "card") {
    // kind == "loan" renders the Loans tab; default "card" renders Credit Cards.
    // Cards and loans share this screen (and the editor) but live in separate tabs.
    val isLoanView = kind == "loan"
    val data by vm.data.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<Card?>(null) }
    var creating by remember { mutableStateOf(false) }
    var paying by remember { mutableStateOf<Card?>(null) }
    var sortKey by remember { mutableStateOf("due") }
    var showFilters by remember { mutableStateOf(false) }
    var fBalance by remember { mutableStateOf(false) }
    var fPromo by remember { mutableStateOf(false) }
    var fOverdue by remember { mutableStateOf(false) }
    var showArchived by remember { mutableStateOf(false) }
    val zone = vm.zone()

    val creditCards = data.activeCards.filter { it.type != "loan" }
    val useArchive = data.settings.archiveInsteadOfDelete
    val archivedForKind = data.archivedCards.filter { (it.type == "loan") == isLoanView }

    val filtered = data.activeCards.filter { c ->
        if (((c.type == "loan")) != isLoanView) return@filter false
        if (fBalance && !(c.balance > 0)) return@filter false
        if (fPromo && !(c.hasPromo && !c.promoEndDate.isNullOrEmpty())) return@filter false
        if (fOverdue && !(c.dueDay != null && DateLogic.effectiveDaysUntilDue(
                c.dueDay!!,
                vm.isFullyPaid("card", c.id.toString()),
                zone,
            ) < 0)) return@filter false
        true
    }
    val cards = when (sortKey) {
        "balance" -> filtered.sortedByDescending { it.balance }
        "apr" -> filtered.sortedByDescending { it.regularAPR }
        "util" -> filtered.sortedByDescending { if (it.limit > 0) it.balance / it.limit else 0.0 }
        "name" -> filtered.sortedBy { it.name.lowercase() }
        "promo" -> filtered.sortedBy {
            if (it.hasPromo && !it.promoEndDate.isNullOrEmpty()) DateLogic.monthsUntil(it.promoEndDate, zone) else 9999
        }
        else -> filtered.sortedBy {
            val dd = it.dueDay ?: return@sortedBy 99
            DateLogic.effectiveDaysUntilDue(dd, vm.isFullyPaid("card", it.id.toString()), zone)
        }
    }
    val filterCount = listOf(fBalance, fPromo, fOverdue).count { it }

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        ScreenHeader(if (isLoanView) "Loans" else "Cards", onAdd = { creating = true }, branded = true)
        SortFilterBar(
            sortOptions = if (isLoanView) listOf(
                "due" to "Due date", "balance" to "Largest balance",
                "apr" to "Highest APR", "name" to "Name (A–Z)",
            ) else listOf(
                "due" to "Due date", "balance" to "Largest balance", "apr" to "Highest APR",
                "util" to "Highest utilization", "promo" to "0% promo first", "name" to "Name (A–Z)",
            ),
            sortKey = sortKey, onSortChange = { sortKey = it },
            filterCount = filterCount, onFilters = { showFilters = true },
        )
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (!isLoanView && creditCards.isNotEmpty()) {
                item { CardsSummaryCard(creditCards) }
                item { CardsPayoffCard(creditCards, zone) }
            }
            if (cards.isEmpty()) {
                item { CtCard { Text(
                    if (isLoanView) "No loans yet. Tap + to add one." else "No cards yet. Tap + to add one.",
                    color = Ct.colors.muted) } }
            }
            items(cards, key = { it.id }) { card ->
                val dismissState = rememberSwipeToDismissBoxState()
                LaunchedEffect(dismissState.currentValue) {
                    when (dismissState.currentValue) {
                        SwipeToDismissBoxValue.StartToEnd -> {
                            paying = card
                            dismissState.reset()
                        }
                        SwipeToDismissBoxValue.EndToStart -> {
                            if (useArchive) vm.archiveCard(card) else vm.deleteCard(card)
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
            if (archivedForKind.isNotEmpty()) {
                item {
                    ArchivedItemsCard(
                        title = "Archived ${if (isLoanView) "loans" else "cards"} (${archivedForKind.size})",
                        expanded = showArchived,
                        onToggle = { showArchived = !showArchived },
                        rows = archivedForKind.map { c ->
                            ArchivedRow(c.name, Money.fmt(c.balance), { vm.restoreCard(c) }, { vm.deleteCard(c) })
                        },
                    )
                }
            }
        }
    }

    if (creating) CardEditorDialog(null, vm, onDismiss = { creating = false }, defaultType = kind)
    editing?.let { CardEditorDialog(it, vm, onDismiss = { editing = null }) }
    paying?.let { PayDialog(vm, "card", it.id.toString(), it.name) { paying = null } }

    if (showFilters) {
        FormDialog(if (isLoanView) "Filter loans" else "Filter cards", saveEnabled = true,
            onSave = { showFilters = false }, onDismiss = { showFilters = false }) {
            FilterSwitch("Has a balance", fBalance) { fBalance = it }
            if (!isLoanView) FilterSwitch("Has 0% promo", fPromo) { fPromo = it }
            FilterSwitch("Overdue only", fOverdue) { fOverdue = it }
            Text("Clear filters", color = Ct.colors.accent, fontSize = 14.sp,
                modifier = Modifier.clickable {
                    fBalance = false; fPromo = false; fOverdue = false
                }.padding(top = 6.dp))
        }
    }
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
    val isLoan = card.type == "loan"
    val util = if (card.limit > 0) min(1.0, card.balance / card.limit) else 0.0
    val promoActive = card.hasPromo && DateLogic.monthsUntil(card.promoEndDate, zone) > 0
    CtCard(Modifier.clickable(onClick = onEdit)) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (isLoan) CTConstants.loanIcon else CTConstants.cardIcon, fontSize = 20.sp, modifier = Modifier.padding(end = 8.dp))
                // Name owns the title line; issuer and the network/last-4 share the
                // subtitle. Keeping the digits out of the title stops a long card
                // name from squeezing them into a second wrapped line.
                Column(Modifier.weight(1f)) {
                    Text(
                        card.name, color = Ct.colors.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                    val issuer = card.issuer?.takeIf { it.isNotBlank() }
                    val lastDigits = card.lastDigits?.takeIf { it.isNotBlank() }
                    if (issuer != null || lastDigits != null) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            if (issuer != null) {
                                Text(
                                    issuer, color = Ct.colors.muted, fontSize = 12.sp,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f, fill = false),
                                )
                            }
                            if (lastDigits != null) {
                                Text(
                                    listOfNotNull(card.network?.takeIf { it.isNotBlank() }, "•••• $lastDigits").joinToString(" "),
                                    color = Ct.colors.muted, fontSize = 11.sp, fontFamily = PlexMono, maxLines = 1,
                                )
                            }
                        }
                    }
                }
                Text(Money.fmt(card.balance), color = Ct.colors.text, fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold, fontFamily = PlexMono)
            }
            if (!isLoan) {
                LinearProgressIndicator(
                    progress = { util.toFloat() },
                    color = if (util > 0.5) Ct.colors.orange else Ct.colors.accent,
                    trackColor = Ct.colors.surface2,
                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp).clip(RoundedCornerShape(3.dp)),
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("${(util * 100).toInt()}% of ${Money.fmtShort(card.limit)}",
                            color = Ct.colors.muted, fontSize = 12.sp)
                        card.currentBalance?.let { cur ->
                            if (cur > 0) {
                                Text("Current: ${Money.fmtShort(cur)}", color = Ct.colors.muted, fontSize = 12.sp)
                            }
                        }
                    }
                    if (promoActive) {
                        Text("0% promo", color = Ct.colors.green, fontSize = 10.sp, fontFamily = PlexMono)
                    } else {
                        Text("%.2f%% APR".format(card.regularAPR), color = Ct.colors.muted,
                            fontSize = 11.sp, fontFamily = PlexMono)
                    }
                    Spacer(Modifier.width(6.dp))
                    AutopayPill(card.autopay, card.autopayDay)
                }
            } else {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                    Text("%.2f%% APR".format(card.regularAPR), color = Ct.colors.muted,
                        fontSize = 11.sp, fontFamily = PlexMono, modifier = Modifier.weight(1f))
                    AutopayPill(card.autopay, card.autopayDay)
                }
            }
            HorizontalDivider(color = Ct.colors.border, modifier = Modifier.padding(vertical = 8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    when (state) {
                        PaidState.FULL -> "Paid ${Money.fmt(paidSoFar)} this month"
                        PaidState.PARTIAL -> "Paid ${Money.fmt(paidSoFar)} of ${Money.fmt(goal)}"
                        PaidState.UNPAID -> if (isLoan) "Monthly payment: ${Money.fmt(card.minPayment)}" else "Not paid this month"
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
fun CardEditorDialog(card: Card?, vm: AppViewModel, onDismiss: () -> Unit, defaultType: String = "card") {
    var name by remember { mutableStateOf(card?.name ?: "") }
    var type by remember { mutableStateOf(card?.type ?: defaultType) }
    var issuer by remember { mutableStateOf(card?.issuer ?: "") }
    var currentBalance by remember { mutableStateOf(card?.currentBalance?.takeIf { it != 0.0 }?.toString() ?: "") }
    var lastDigits by remember { mutableStateOf(card?.lastDigits ?: "") }
    var network by remember { mutableStateOf(card?.network ?: "") }
    var balance by remember { mutableStateOf(card?.balance?.takeIf { it != 0.0 }?.toString() ?: "") }
    var limit by remember { mutableStateOf(card?.limit?.takeIf { it != 0.0 }?.toString() ?: "") }
    var minPayment by remember { mutableStateOf(card?.minPayment?.takeIf { it != 0.0 }?.toString() ?: "") }
    var recommendedPayment by remember { mutableStateOf(card?.recommendedPayment?.takeIf { it != 0.0 }?.toString() ?: "") }
    var apr by remember { mutableStateOf(card?.regularAPR?.takeIf { it != 0.0 }?.toString() ?: "") }
    var annualFee by remember { mutableStateOf(card?.annualFee?.takeIf { it != 0.0 }?.toString() ?: "") }
    var feeMonth by remember { mutableStateOf(card?.feeMonth ?: 0) } // 0 = none
    var dueDay by remember { mutableStateOf(card?.dueDay?.toString() ?: "1") }
    var autopay by remember { mutableStateOf(card?.autopay ?: false) }
    var autopayDay by remember { mutableStateOf(card?.autopayDay?.toString() ?: "") }
    var notes by remember { mutableStateOf(card?.notes ?: "") }
    var hasPromo by remember { mutableStateOf(card?.hasPromo ?: false) }
    var promoApr by remember { mutableStateOf(card?.promoAPR?.toString() ?: "0") }
    var promoBalance by remember { mutableStateOf(card?.promoBalance?.toString() ?: "") }
    var promoEnd by remember { mutableStateOf(card?.promoEndDate ?: "") }
    var rewardBase by remember { mutableStateOf(card?.rewardBase?.takeIf { it != 0.0 }?.toString() ?: "") }
    val rewardCats = remember {
        mutableStateMapOf<String, String>().apply {
            card?.rewardCategories?.forEach { (k, v) -> if (v > 0) put(k, v.toString()) }
        }
    }
    var rotatingRate by remember { mutableStateOf(card?.rotatingRate ?: 5.0) }
    val rotatingPool = remember {
        mutableStateListOf<String>().apply { card?.rotatingPool?.let { addAll(it) } }
    }
    var pointValue by remember { mutableStateOf(card?.pointValue?.takeIf { it != 1.0 }?.toString() ?: "") }
    val perks = remember {
        mutableStateListOf<PerkEditState>().apply {
            card?.perks?.forEach { add(PerkEditState(it.id, it.label, if (it.amount == 0.0) "" else it.amount.toString(), it.frequency)) }
        }
    }
    val offers = remember {
        mutableStateListOf<OfferEditState>().apply {
            card?.offers?.forEach { add(OfferEditState(it.id, it.merchant, it.detail, it.expires, it.used)) }
        }
    }

    val isLoan = type == "loan"

    FormDialog(
        title = if (card == null) {
            if (isLoan) "New Loan" else "New Card"
        } else {
            if (isLoan) "Edit Loan" else "Edit Card"
        },
        saveEnabled = name.isNotBlank(),
        onSave = {
            vm.upsertCard(
                Card(
                    id = card?.id ?: genId(),
                    name = name.trim(),
                    type = type,
                    issuer = issuer.trim().takeIf { it.isNotBlank() },
                    currentBalance = if (isLoan) null else currentBalance.toDoubleOrNull(),
                    lastDigits = lastDigits.trim().takeIf { it.isNotBlank() },
                    network = network.takeIf { it.isNotBlank() },
                    balance = balance.toDoubleOrNull() ?: 0.0,
                    limit = if (isLoan) 0.0 else (limit.toDoubleOrNull() ?: 0.0),
                    minPayment = minPayment.toDoubleOrNull() ?: 0.0,
                    recommendedPayment = recommendedPayment.toDoubleOrNull()?.takeIf { it > 0.0 },
                    regularAPR = apr.toDoubleOrNull() ?: 0.0,
                    hasPromo = if (isLoan) false else hasPromo,
                    promoAPR = if (!isLoan && hasPromo) promoApr.toDoubleOrNull() else null,
                    promoEndDate = if (!isLoan && hasPromo) promoEnd.ifBlank { null } else null,
                    promoBalance = if (!isLoan && hasPromo) promoBalance.toDoubleOrNull() else null,
                    dueDay = dueDay.toIntOrNull()?.coerceIn(1, 31) ?: 1,
                    autopay = autopay,
                    autopayDay = if (autopay) autopayDay.toIntOrNull()?.coerceIn(1, 31) else null,
                    notes = notes,
                    rewardBase = if (isLoan) 0.0 else (rewardBase.toDoubleOrNull() ?: 0.0),
                    rewardCategories = if (isLoan) emptyMap() else rewardCats.mapNotNull { (k, v) ->
                        v.toDoubleOrNull()?.takeIf { it > 0.0 }?.let { k to it }
                    }.toMap(),
                    rotatingPool = if (isLoan || rotatingPool.isEmpty()) null else rotatingPool.toList(),
                    rotatingRate = if (isLoan || rotatingPool.isEmpty()) null else rotatingRate,
                    pointValue = if (isLoan) null else pointValue.toDoubleOrNull()?.takeIf { it > 0 && it != 1.0 },
                    perks = if (isLoan) emptyList() else perks.mapNotNull { p ->
                        val amt = p.amount.toDoubleOrNull() ?: 0.0
                        if (p.label.isNotBlank() && amt > 0) CardPerk(p.id, p.label.trim(), amt, p.frequency) else null
                    },
                    annualFee = if (isLoan) null else annualFee.toDoubleOrNull()?.takeIf { it > 0 },
                    feeMonth = if (isLoan || feeMonth == 0) null else feeMonth,
                    offers = if (isLoan) emptyList() else offers.mapNotNull { o ->
                        if (o.merchant.isNotBlank()) CardOffer(o.id, o.merchant.trim(), o.detail.trim(), o.expires, o.used) else null
                    },
                )
            )
            onDismiss()
        },
        onDismiss = onDismiss,
        onDelete = card?.let { { vm.deleteCard(it); onDismiss() } },
    ) {
        DropdownField(
            label = "Account Type",
            options = listOf("Credit Card", "Loan"),
            selected = if (isLoan) "Loan" else "Credit Card"
        ) {
            type = if (it == "Loan") "loan" else "card"
        }

        OutlinedTextField(name, { name = it }, label = { Text(if (isLoan) "Loan Name" else "Card Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(issuer, { issuer = it }, label = { Text("Issuer / Bank") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        // Short label, detail in supportingText — "Ends in (last 4 or 5 digits)"
        // is wider than the field and wrapped onto a second line.
        OutlinedTextField(
            lastDigits, { lastDigits = it.filter(Char::isDigit).take(5) },
            label = { Text("Ends in") },
            supportingText = { Text("Last 4 or 5 digits") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true, modifier = Modifier.fillMaxWidth(),
        )
        DropdownField("Network", listOf("—", "Visa", "Mastercard", "Amex", "Discover", "Other"), network.ifBlank { "—" }) { network = if (it == "—") "" else it }

        money(balance, if (isLoan) "Remaining Principal" else "Statement Balance") { balance = it }

        if (!isLoan) {
            money(limit, "Credit limit") { limit = it }
            money(currentBalance, "Current Balance (optional)") { currentBalance = it }
        }

        money(minPayment, if (isLoan) "Monthly payment" else "Minimum payment") { minPayment = it }
        money(recommendedPayment, "Recommended payment (optional)") { recommendedPayment = it }
        Text("Leave blank to default to the full balance (or the 0%-promo payoff).",
            color = Ct.colors.muted, fontSize = 12.sp)
        OutlinedTextField(apr, { apr = it }, label = { Text("Regular APR %") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.fillMaxWidth())
        DayField("Due day (1–31)", dueDay) { dueDay = it }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Autopay", color = Ct.colors.text, modifier = Modifier.weight(1f))
            Switch(checked = autopay, onCheckedChange = { autopay = it })
        }
        if (autopay) {
            DayField("Autopay day", autopayDay, allowSame = true) { autopayDay = it }
        }
        if (!isLoan) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("0% / promo APR", color = Ct.colors.text, modifier = Modifier.weight(1f))
                Switch(checked = hasPromo, onCheckedChange = { hasPromo = it })
            }
            if (hasPromo) {
                OutlinedTextField(promoApr, { promoApr = it }, label = { Text("Promo APR %") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.fillMaxWidth())
                money(promoBalance, "Promo balance") { promoBalance = it }
                DateField("Promo ends", promoEnd, { promoEnd = it })
            }
        }
        if (!isLoan) {
            FieldLabel("Rewards")
            Text("Powers the “which card should I use?” tool. A category bonus overrides the base rate.",
                color = Ct.colors.muted, fontSize = 12.sp)
            DropdownField("Start from a known card…", Rewards.CARD_PRESETS.map { it.label }, "Start from a known card…") { picked ->
                Rewards.CARD_PRESETS.firstOrNull { it.label == picked }?.let { p ->
                    if (name.isBlank()) name = p.name
                    if (issuer.isBlank()) issuer = p.issuer
                    network = p.network
                    rewardBase = if (p.rewardBase > 0) p.rewardBase.toString() else ""
                    rewardCats.clear()
                    p.rewardCategories.forEach { (k, v) -> rewardCats[k] = v.toString() }
                    rotatingPool.clear()
                    p.rotatingPool?.let { rotatingPool.addAll(it) }
                    rotatingRate = p.rotatingRate ?: 5.0
                    pointValue = p.pointValue?.takeIf { it != 1.0 }?.toString() ?: ""
                }
            }
            OutlinedTextField(rewardBase, { rewardBase = it }, label = { Text("Base reward % (everything)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(pointValue, { pointValue = it }, label = { Text("Point value (¢ per point, 1 = cash back)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.fillMaxWidth())
            Rewards.CATEGORIES.forEach { cat ->
                if (cat !in rotatingPool) {
                    OutlinedTextField(rewardCats[cat] ?: "", { rewardCats[cat] = it }, label = { Text("$cat %") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.fillMaxWidth())
                }
            }
            if (rotatingPool.isNotEmpty()) {
                Text("Rotating ${rotatingRate.toInt()}% — tick this quarter’s active categories",
                    color = Ct.colors.muted, fontSize = 12.sp)
                rotatingPool.forEach { cat ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(cat, color = Ct.colors.text, modifier = Modifier.weight(1f))
                        Switch(
                            checked = (rewardCats[cat]?.toDoubleOrNull() ?: 0.0) > 0.0,
                            onCheckedChange = { on ->
                                if (on) rewardCats[cat] = rotatingRate.toString() else rewardCats.remove(cat)
                            },
                        )
                    }
                }
            }

            FieldLabel("Annual fee")
            OutlinedTextField(annualFee, { annualFee = it }, label = { Text("Annual fee") }, prefix = { Text("$") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.fillMaxWidth())
            DropdownField("Fee renews", MONTH_OPTS.map { it.second },
                MONTH_OPTS.first { it.first == feeMonth }.second) { lbl ->
                feeMonth = MONTH_OPTS.first { it.second == lbl }.first
            }
            Text("Powers the “is the fee worth it?” check on the Rewards tab.",
                color = Ct.colors.muted, fontSize = 12.sp)

            FieldLabel("Credits & perks")
            Text("Recurring statement credits — log usage each cycle on the Rewards tab.",
                color = Ct.colors.muted, fontSize = 12.sp)
            perks.forEachIndexed { i, p ->
                OutlinedTextField(p.label, { p.label = it }, label = { Text("Credit name (e.g. Uber Cash)") },
                    singleLine = true, modifier = Modifier.fillMaxWidth())
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(p.amount, { p.amount = it }, label = { Text("Amount") }, prefix = { Text("$") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true,
                        modifier = Modifier.weight(1f))
                    Spacer(Modifier.width(8.dp))
                    Box(Modifier.weight(1.2f)) {
                        DropdownField("Resets", PERK_FREQ_OPTS.map { it.second },
                            PERK_FREQ_OPTS.first { it.first == p.frequency }.second) { lbl ->
                            p.frequency = PERK_FREQ_OPTS.first { it.second == lbl }.first
                        }
                    }
                    TextButton({ perks.removeAt(i) }) { Text("✕", color = Ct.colors.muted) }
                }
            }
            TextButton({ perks.add(PerkEditState(UUID.randomUUID().toString(), "", "", "monthly")) }) {
                Text("+ Add credit")
            }

            FieldLabel("Card-linked offers")
            Text("Amex/Chase/BofA deals you’ve activated — tracked on the Rewards tab so you use them before they expire.",
                color = Ct.colors.muted, fontSize = 12.sp)
            offers.forEachIndexed { i, o ->
                OutlinedTextField(o.merchant, { o.merchant = it }, label = { Text("Merchant (e.g. Whole Foods)") },
                    singleLine = true, modifier = Modifier.fillMaxWidth())
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(o.detail, { o.detail = it }, label = { Text("Detail (e.g. 10% back)") },
                        singleLine = true, modifier = Modifier.weight(1f))
                    TextButton({ offers.removeAt(i) }) { Text("✕", color = Ct.colors.muted) }
                }
                DateField("Expires", o.expires, { o.expires = it })
            }
            TextButton({ offers.add(OfferEditState(UUID.randomUUID().toString(), "", "", "", false)) }) {
                Text("+ Add offer")
            }
        }
        OutlinedTextField(notes, { notes = it }, label = { Text("Notes") }, modifier = Modifier.fillMaxWidth())
    }
}

/** Mutable editor row for a card perk (amount kept as text while typing). */
private class PerkEditState(val id: String, label: String, amount: String, frequency: String) {
    var label by mutableStateOf(label)
    var amount by mutableStateOf(amount)
    var frequency by mutableStateOf(frequency)
}

/** Mutable editor row for a card-linked offer. */
private class OfferEditState(val id: String, merchant: String, detail: String, expires: String, val used: Boolean) {
    var merchant by mutableStateOf(merchant)
    var detail by mutableStateOf(detail)
    var expires by mutableStateOf(expires)
}

private val PERK_FREQ_OPTS = listOf(
    "monthly" to "Monthly", "quarterly" to "Quarterly", "semiannual" to "Twice a year", "annual" to "Yearly",
)

private val MONTH_OPTS = listOf(
    0 to "—", 1 to "January", 2 to "February", 3 to "March", 4 to "April", 5 to "May", 6 to "June",
    7 to "July", 8 to "August", 9 to "September", 10 to "October", 11 to "November", 12 to "December",
)

/** Autopay status pill, matching the web card row ("✓ Autopay · day N" / "Manual"). */
@Composable
private fun AutopayPill(autopay: Boolean, autopayDay: Int?) {
    if (autopay) {
        Text(
            if (autopayDay != null) "✓ Autopay · day $autopayDay" else "✓ Autopay",
            color = Ct.colors.green, fontSize = 10.sp, fontFamily = PlexMono,
            modifier = Modifier
                .background(Ct.colors.greenBg, RoundedCornerShape(999.dp))
                .padding(horizontal = 8.dp, vertical = 2.dp),
        )
    } else {
        Text(
            "Manual",
            color = Ct.colors.muted, fontSize = 10.sp, fontFamily = PlexMono,
            modifier = Modifier
                .background(Ct.colors.surface2, RoundedCornerShape(999.dp))
                .padding(horizontal = 8.dp, vertical = 2.dp),
        )
    }
}

@Composable
private fun money(value: String, label: String, onChange: (String) -> Unit) {
    OutlinedTextField(value, onChange, label = { Text(label) }, prefix = { Text("$") },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        singleLine = true, modifier = Modifier.fillMaxWidth())
}

private val ACCOUNT_TYPES = listOf(
    "checking" to "Checking", "savings" to "Savings", "investment" to "Investments",
    "property" to "Property", "cash" to "Cash", "other" to "Other",
)
private fun accountTypeLabel(t: String) = ACCOUNT_TYPES.firstOrNull { it.first == t }?.second ?: "Checking"
private fun accountIcon(t: String) = when (t) {
    "savings" -> "💰"; "investment" -> "📈"; "property" -> "🏠"; "cash" -> "💵"; "other" -> "📦"; else -> "🏦"
}

@Composable
private fun CardsSummaryCard(cards: List<Card>) {
    val totalBalance = cards.sumOf { it.balance }
    val totalLimit = cards.sumOf { it.limit }
    val util = if (totalLimit > 0) min(1.0, totalBalance / totalLimit) else 0.0
    CtCard(branded = true) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                Column {
                    FieldLabel("Total balance")
                    Text(
                        Money.fmt(totalBalance),
                        color = Ct.colors.text,
                        fontSize = 26.sp,
                        fontWeight = FontWeight.ExtraBold,
                        fontFamily = PlexMono,
                    )
                }
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Credit", color = Ct.colors.muted, fontSize = 11.sp)
                        Text(Money.fmt(totalLimit), color = Ct.colors.text, fontSize = 13.sp, fontFamily = PlexMono)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Utilization", color = Ct.colors.muted, fontSize = 11.sp)
                        Text(
                            "${(util * 100).toInt()}%",
                            color = if (util > 0.3) Ct.colors.red else Ct.colors.green,
                            fontSize = 13.sp,
                            fontFamily = PlexMono,
                        )
                    }
                }
            }
            if (totalLimit > 0) {
                LinearProgressIndicator(
                    progress = { util.toFloat() },
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(4.dp)),
                    color = if (util > 0.3) Ct.colors.red else Ct.colors.accent,
                    trackColor = Ct.colors.border,
                )
            }
        }
    }
}

@Composable
fun AccountEditorDialog(account: Account?, vm: AppViewModel, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf(account?.name ?: "") }
    var type by remember { mutableStateOf(account?.type ?: "checking") }
    var balance by remember { mutableStateOf(account?.balance?.takeIf { it != 0.0 }?.toString() ?: "") }
    var notes by remember { mutableStateOf(account?.notes ?: "") }
    FormDialog(
        title = if (account == null) "New Account" else "Edit Account",
        saveEnabled = name.isNotBlank(),
        onSave = {
            vm.upsertAccount(
                Account(
                    id = account?.id ?: genId(),
                    name = name.trim(), type = type,
                    balance = balance.toDoubleOrNull() ?: 0.0, notes = notes,
                )
            )
            onDismiss()
        },
        onDismiss = onDismiss,
        onDelete = account?.let { { vm.deleteAccount(it); onDismiss() } },
    ) {
        OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true,
            modifier = Modifier.fillMaxWidth())
        DropdownField("Type", ACCOUNT_TYPES.map { it.second }, accountTypeLabel(type)) { label ->
            type = ACCOUNT_TYPES.firstOrNull { it.second == label }?.first ?: "checking"
        }
        OutlinedTextField(balance, { balance = it }, label = { Text("Balance") }, prefix = { Text("$") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true,
            modifier = Modifier.fillMaxWidth())
        OutlinedTextField(notes, { notes = it }, label = { Text("Notes") }, modifier = Modifier.fillMaxWidth())
    }
}

// ── Payoff plan: lump for interest-bearing cards, monthly for 0% promos ──
@Composable
private fun CardsPayoffCard(cards: List<Card>, zone: java.time.ZoneId) {
    val nonPromo = cards.filter { !(it.hasPromo && !it.promoEndDate.isNullOrEmpty()) && it.balance > 0 }
    val promo = cards.filter { it.hasPromo && !it.promoEndDate.isNullOrEmpty() }
    if (nonPromo.isEmpty() && promo.isEmpty()) return
    val nonPromoTotal = nonPromo.sumOf { it.balance }
    val promoMonthly = promo.sumOf { Schedule.promoNeeded(it, zone) }
    val longestMonths = promo.maxOfOrNull { DateLogic.monthsUntil(it.promoEndDate, zone) } ?: 0
    CtCard {
        Text("PAYOFF PLAN", color = Ct.colors.muted, fontSize = 10.sp,
            fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
        Spacer(Modifier.height(10.dp))
        if (nonPromo.isNotEmpty()) {
            PayoffRow("🔥", "Pay off interest-bearing cards",
                "${nonPromo.size} card${if (nonPromo.size == 1) "" else "s"} without 0% financing — clear these first",
                Money.fmt(nonPromoTotal), Ct.colors.red, null)
        }
        if (promo.isNotEmpty()) {
            if (nonPromo.isNotEmpty()) Spacer(Modifier.height(12.dp))
            PayoffRow("📆", "Stay ahead of 0% promos",
                "Clears ${promo.size} promo balance${if (promo.size == 1) "" else "s"} on time" +
                    if (longestMonths > 0) " — up to ${longestMonths}mo left" else "",
                Money.fmt(promoMonthly), Ct.colors.text, "/mo")
        }
    }
}

@Composable
private fun PayoffRow(emoji: String, title: String, sub: String, amount: String, amountColor: Color, suffix: String?) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(emoji, fontSize = 16.sp, modifier = Modifier.padding(end = 12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = Ct.colors.text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            Text(sub, color = Ct.colors.muted, fontSize = 12.sp)
        }
        // The subtitle wraps to two lines, so without a gutter the amount ends up
        // butted against the last word of line one. Keep it on one line too — a
        // wrapped "$1,290.62 /mo" reads as two figures.
        Row(
            modifier = Modifier.padding(start = 12.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            Text(amount, color = amountColor, fontSize = 17.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            if (suffix != null) Text(suffix, color = Ct.colors.muted, fontSize = 12.sp, maxLines = 1)
        }
    }
}

// ── Archived items (shared by Cards + Bills): restore or delete forever ──
data class ArchivedRow(val name: String, val amount: String, val onRestore: () -> Unit, val onDelete: () -> Unit)

@Composable
fun ArchivedItemsCard(title: String, expanded: Boolean, onToggle: () -> Unit, rows: List<ArchivedRow>) {
    CtCard {
        Row(Modifier.fillMaxWidth().clickable { onToggle() }, verticalAlignment = Alignment.CenterVertically) {
            Text(title, color = Ct.colors.muted, fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Icon(if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                contentDescription = null, tint = Ct.colors.muted)
        }
        if (expanded) {
            Spacer(Modifier.height(8.dp))
            rows.forEach { r ->
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(r.name, color = Ct.colors.text, fontSize = 14.sp, maxLines = 1, modifier = Modifier.weight(1f))
                    Text(r.amount, color = Ct.colors.muted, fontSize = 13.sp)
                    Spacer(Modifier.width(10.dp))
                    Text("Restore", color = Ct.colors.accent, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clickable { r.onRestore() })
                    Spacer(Modifier.width(12.dp))
                    Text("Delete", color = Ct.colors.red, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clickable { r.onDelete() })
                }
            }
        }
    }
}
