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
import androidx.compose.ui.graphics.Color
import com.danielhipskind.fihaven.AppViewModel
import com.danielhipskind.fihaven.core.CTConstants
import com.danielhipskind.fihaven.core.Money
import com.danielhipskind.fihaven.core.logic.DateLogic
import com.danielhipskind.fihaven.core.logic.PaidState
import com.danielhipskind.fihaven.core.logic.Rewards
import com.danielhipskind.fihaven.core.model.Account
import com.danielhipskind.fihaven.core.model.Card
import com.danielhipskind.fihaven.ui.theme.Ct
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
    var editingAccount by remember { mutableStateOf<Account?>(null) }
    var creatingAccount by remember { mutableStateOf(false) }
    val zone = vm.zone()

    val assets = data.accounts.sumOf { it.balance }
    val liabilities = data.cards.sumOf { it.balance }
    val netWorth = assets - liabilities

    val filtered = data.cards.filter { c ->
        if (((c.type == "loan")) != isLoanView) return@filter false
        if (fBalance && !(c.balance > 0)) return@filter false
        if (fPromo && !(c.hasPromo && !c.promoEndDate.isNullOrEmpty())) return@filter false
        if (fOverdue && !(c.dueDay != null && DateLogic.daysUntilDue(c.dueDay!!, zone) < 0)) return@filter false
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
        else -> filtered.sortedBy { it.dueDay ?: 99 }
    }
    val filterCount = listOf(fBalance, fPromo, fOverdue).count { it }

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        ScreenHeader(if (isLoanView) "Loans" else "Cards", onAdd = { creating = true })
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
            if (!isLoanView) {
                item { NetWorthCard(netWorth, assets, liabilities, accountsEmpty = data.accounts.isEmpty()) }
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically) {
                        Text("ACCOUNTS YOU OWN", color = Ct.colors.muted, fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold)
                        Text("+ Add", color = Ct.colors.accent, fontSize = 14.sp,
                            modifier = Modifier.clickable { creatingAccount = true })
                    }
                }
                items(data.accounts, key = { "acct-${it.id}" }) { acct ->
                    AccountRow(acct) { editingAccount = acct }
                }
            }
            if (cards.isEmpty()) {
                item { CtCard { Text(
                    if (isLoanView) "No loans yet. Tap + to add one." else "No cards yet. Tap + to add one.",
                    color = Ct.colors.muted) } }
            }
            items(cards, key = { it.id }) { card ->
                val dismissState = rememberSwipeToDismissBoxState(
                    confirmValueChange = { value ->
                        if (value == SwipeToDismissBoxValue.StartToEnd) {
                            paying = card
                            false
                        } else if (value == SwipeToDismissBoxValue.EndToStart) {
                            vm.deleteCard(card)
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
    }

    if (creating) CardEditorDialog(null, vm, onDismiss = { creating = false }, defaultType = kind)
    editing?.let { CardEditorDialog(it, vm, onDismiss = { editing = null }) }
    paying?.let { PayDialog(vm, "card", it.id.toString(), it.name) { paying = null } }
    if (creatingAccount) AccountEditorDialog(null, vm) { creatingAccount = false }
    editingAccount?.let { AccountEditorDialog(it, vm) { editingAccount = null } }

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
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(card.name, color = Ct.colors.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                        val lastDigits = card.lastDigits
                        if (!lastDigits.isNullOrBlank()) {
                            Text(
                                listOfNotNull(card.network?.takeIf { it.isNotBlank() }, "•••• $lastDigits").joinToString(" "),
                                color = Ct.colors.muted, fontSize = 11.sp, fontFamily = PlexMono,
                            )
                        }
                    }
                    val issuer = card.issuer
                    if (!issuer.isNullOrBlank()) {
                        Text(issuer, color = Ct.colors.muted, fontSize = 12.sp)
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
                }
            } else {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                    Text("%.2f%% APR".format(card.regularAPR), color = Ct.colors.muted,
                        fontSize = 11.sp, fontFamily = PlexMono, modifier = Modifier.weight(1f))
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
    var dueDay by remember { mutableStateOf(card?.dueDay?.toString() ?: "1") }
    var autopay by remember { mutableStateOf(card?.autopay ?: false) }
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
                    id = card?.id ?: System.currentTimeMillis().toInt(),
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
                    autopay = autopay, notes = notes,
                    rewardBase = if (isLoan) 0.0 else (rewardBase.toDoubleOrNull() ?: 0.0),
                    rewardCategories = if (isLoan) emptyMap() else rewardCats.mapNotNull { (k, v) ->
                        v.toDoubleOrNull()?.takeIf { it > 0.0 }?.let { k to it }
                    }.toMap(),
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
        OutlinedTextField(lastDigits, { lastDigits = it.filter(Char::isDigit).take(5) }, label = { Text("Ends in (last 4 or 5 digits)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.fillMaxWidth())
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
        OutlinedTextField(dueDay, { dueDay = it.filter(Char::isDigit).take(2) }, label = { Text("Due day (1–31)") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.fillMaxWidth())
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Autopay", color = Ct.colors.text, modifier = Modifier.weight(1f))
            Switch(checked = autopay, onCheckedChange = { autopay = it })
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
                OutlinedTextField(promoEnd, { promoEnd = it }, label = { Text("Promo ends (YYYY-MM-DD)") },
                    singleLine = true, modifier = Modifier.fillMaxWidth())
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
                }
            }
            OutlinedTextField(rewardBase, { rewardBase = it }, label = { Text("Base reward % (everything)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.fillMaxWidth())
            Rewards.CATEGORIES.forEach { cat ->
                OutlinedTextField(rewardCats[cat] ?: "", { rewardCats[cat] = it }, label = { Text("$cat %") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.fillMaxWidth())
            }
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

private val ACCOUNT_TYPES = listOf(
    "checking" to "Checking", "savings" to "Savings", "investment" to "Investments",
    "property" to "Property", "cash" to "Cash", "other" to "Other",
)
private fun accountTypeLabel(t: String) = ACCOUNT_TYPES.firstOrNull { it.first == t }?.second ?: "Checking"
private fun accountIcon(t: String) = when (t) {
    "savings" -> "💰"; "investment" -> "📈"; "property" -> "🏠"; "cash" -> "💵"; "other" -> "📦"; else -> "🏦"
}

@Composable
private fun NetWorthCard(netWorth: Double, assets: Double, liabilities: Double, accountsEmpty: Boolean) {
    CtCard(padding = 16) {
        Column {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text("NET WORTH", color = Ct.colors.muted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                    Text(Money.fmt(netWorth), color = if (netWorth >= 0) Ct.colors.green else Ct.colors.red,
                        fontSize = 26.sp, fontWeight = FontWeight.ExtraBold, fontFamily = PlexMono)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Assets", color = Ct.colors.muted, fontSize = 11.sp)
                        Text(Money.fmt(assets), color = Ct.colors.green, fontSize = 13.sp, fontFamily = PlexMono)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Debts", color = Ct.colors.muted, fontSize = 11.sp)
                        Text("-${Money.fmt(liabilities)}", color = Ct.colors.red, fontSize = 13.sp, fontFamily = PlexMono)
                    }
                }
            }
            if (accountsEmpty) {
                Text("Add savings, checking, investments, or property to track your net worth.",
                    color = Ct.colors.muted, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
            }
        }
    }
}

@Composable
private fun AccountRow(a: Account, onEdit: () -> Unit) {
    CtCard(Modifier.clickable(onClick = onEdit)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(accountIcon(a.type), fontSize = 20.sp, modifier = Modifier.padding(end = 10.dp))
            Column(Modifier.weight(1f)) {
                Text(a.name.ifBlank { accountTypeLabel(a.type) }, color = Ct.colors.text,
                    fontSize = 15.sp, fontWeight = FontWeight.Medium)
                Text(accountTypeLabel(a.type), color = Ct.colors.muted, fontSize = 12.sp)
            }
            Text(Money.fmt(a.balance), color = Ct.colors.green, fontSize = 15.sp,
                fontWeight = FontWeight.Medium, fontFamily = PlexMono)
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
                    id = account?.id ?: System.currentTimeMillis().toInt(),
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
