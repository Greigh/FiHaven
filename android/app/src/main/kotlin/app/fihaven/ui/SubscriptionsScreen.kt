package app.fihaven.ui

import app.fihaven.ui.theme.PlexMono

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.fihaven.AppViewModel
import app.fihaven.core.Money
import app.fihaven.core.logic.DateLogic
import app.fihaven.core.logic.SubscriptionIcons
import app.fihaven.core.logic.SubscriptionLinks
import app.fihaven.core.logic.SubscriptionsFinder
import app.fihaven.core.model.Bill
import app.fihaven.core.model.subscriptionDeclined
import app.fihaven.core.model.subscriptionDetectMode
import app.fihaven.ui.theme.Ct
import kotlinx.coroutines.launch

@Composable
fun SubscriptionsScreen(vm: AppViewModel, padding: PaddingValues, onBack: (() -> Unit)? = null) {
    val data by vm.data.collectAsStateWithLifecycle()
    val zone = vm.zone()
    val detectMode = if (data.settings.subscriptionDetectMode == "inline") "inline" else "inbox"
    val allItems = SubscriptionsFinder.build(
        data.bills,
        data.transactions,
        zone,
        data.settings.subscriptionDeclined,
    )
    val tracked = allItems.filter { it.source == "bill" }
    val candidates = allItems.filter { it.source == "tx" }

    var editing by remember { mutableStateOf<Bill?>(null) }
    var linking by remember { mutableStateOf<SubscriptionsFinder.Item?>(null) }

    fun billFor(item: SubscriptionsFinder.Item): Bill? =
        item.billId?.let { id -> data.bills.firstOrNull { it.id == id } }

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        ScreenHeader("Subscriptions", onBack = onBack, branded = true)
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (tracked.isEmpty() && candidates.isEmpty()) {
                item {
                    CtCard(padding = 24) {
                        Column(
                            Modifier.fillMaxWidth(),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text("🔁", fontSize = 40.sp)
                            Text("No subscriptions yet", color = Ct.colors.text,
                                fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                            Text(
                                "Flag a bill as a Subscription, or Accept a suggestion from recurring merchants in your transactions.",
                                color = Ct.colors.muted, fontSize = 13.sp, textAlign = TextAlign.Center,
                            )
                        }
                    }
                }
            } else {
                item {
                    SubscriptionsCard(
                        tracked = tracked,
                        candidates = candidates,
                        detectMode = detectMode,
                        billFor = ::billFor,
                        onEditBill = { editing = it },
                        onManageLink = { linking = it },
                        onAccept = { vm.acceptSubscriptionCandidate(it.name, it.amount, it.lastDate) },
                        onDecline = { item ->
                            val key = item.merchantKey.ifBlank { SubscriptionLinks.normalizeKey(item.name) }
                            if (key.isNotBlank()) vm.declineSubscriptionMerchant(key)
                        },
                        onAdd = { item ->
                            val day = item.lastDate?.let { DateLogic.parseDate(it)?.dayOfMonth }
                            editing = Bill(
                                name = item.name,
                                business = item.name,
                                category = "Subscriptions",
                                amount = item.amount,
                                dueDay = day,
                                frequency = "Monthly",
                            )
                        },
                    )
                }
            }
        }
    }

    editing?.let { BillEditorDialog(it, vm, onDismiss = { editing = null }) }
    linking?.let { item ->
        ManageLinkDialog(item, billFor(item), vm, onDismiss = { linking = null })
    }
}

@Composable
private fun SubscriptionsCard(
    tracked: List<SubscriptionsFinder.Item>,
    candidates: List<SubscriptionsFinder.Item>,
    detectMode: String,
    billFor: (SubscriptionsFinder.Item) -> Bill?,
    onEditBill: (Bill) -> Unit,
    onManageLink: (SubscriptionsFinder.Item) -> Unit,
    onAccept: (SubscriptionsFinder.Item) -> Unit,
    onDecline: (SubscriptionsFinder.Item) -> Unit,
    onAdd: (SubscriptionsFinder.Item) -> Unit,
) {
    val total = tracked.sumOf { it.monthly }
    CtCard(padding = 14) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("SUBSCRIPTIONS", color = Ct.colors.muted, fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Text("${Money.fmt(total)}/mo · ${tracked.size} tracked", color = Ct.colors.muted,
                    fontSize = 12.sp, fontFamily = PlexMono)
            }
            Column(Modifier.padding(top = 6.dp)) {
                if (detectMode == "inbox") {
                    tracked.forEach { s ->
                        SubscriptionRow(
                            s,
                            isCandidate = false,
                            billFor = billFor,
                            onEditBill = onEditBill,
                            onManageLink = onManageLink,
                            onAccept = onAccept,
                            onDecline = onDecline,
                            onAdd = onAdd,
                        )
                    }
                    if (candidates.isNotEmpty()) {
                        Text(
                            "Suggested from spending",
                            color = Ct.colors.muted,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(top = if (tracked.isNotEmpty()) 12.dp else 0.dp, bottom = 4.dp),
                        )
                        Text(
                            "Accept to track, Decline to hide permanently, or Add to edit before saving.",
                            color = Ct.colors.muted,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(bottom = 6.dp),
                        )
                        candidates.forEach { s ->
                            SubscriptionRow(
                                s,
                                isCandidate = true,
                                billFor = billFor,
                                onEditBill = onEditBill,
                                onManageLink = onManageLink,
                                onAccept = onAccept,
                                onDecline = onDecline,
                                onAdd = onAdd,
                            )
                        }
                    }
                } else {
                    tracked.forEach { s ->
                        SubscriptionRow(
                            s,
                            isCandidate = false,
                            billFor = billFor,
                            onEditBill = onEditBill,
                            onManageLink = onManageLink,
                            onAccept = onAccept,
                            onDecline = onDecline,
                            onAdd = onAdd,
                        )
                    }
                    candidates.forEach { s ->
                        SubscriptionRow(
                            s,
                            isCandidate = true,
                            billFor = billFor,
                            onEditBill = onEditBill,
                            onManageLink = onManageLink,
                            onAccept = onAccept,
                            onDecline = onDecline,
                            onAdd = onAdd,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SubscriptionRow(
    s: SubscriptionsFinder.Item,
    isCandidate: Boolean,
    billFor: (SubscriptionsFinder.Item) -> Bill?,
    onEditBill: (Bill) -> Unit,
    onManageLink: (SubscriptionsFinder.Item) -> Unit,
    onAccept: (SubscriptionsFinder.Item) -> Unit,
    onDecline: (SubscriptionsFinder.Item) -> Unit,
    onAdd: (SubscriptionsFinder.Item) -> Unit,
) {
    val uriHandler = LocalUriHandler.current

    Row(verticalAlignment = Alignment.Top, modifier = Modifier.padding(vertical = 5.dp)) {
        if (isCandidate) {
            Box(
                Modifier
                    .padding(end = 8.dp)
                    .width(3.dp)
                    .heightIn(min = 48.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Ct.colors.accent.copy(alpha = 0.85f)),
            )
        }
        Text(SubscriptionIcons.emoji(s.name, "Subscriptions"), fontSize = 16.sp,
            modifier = Modifier.padding(end = 10.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(s.name, color = Ct.colors.text, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                if (isCandidate) {
                    Text(
                        "Suggested",
                        color = Ct.colors.accent,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier
                            .padding(start = 6.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(Ct.colors.accent.copy(alpha = 0.12f))
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
            }
            Text(subDetailLine(s), color = subDetailColor(s), fontSize = 11.sp)
            if (!isCandidate) {
                s.manageUrl?.let { url ->
                    Text(
                        "Manage / cancel ↗",
                        color = Ct.colors.accent,
                        fontSize = 11.sp,
                        textDecoration = TextDecoration.Underline,
                        modifier = Modifier.padding(top = 2.dp).clickable { uriHandler.openUri(url) },
                    )
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                if (isCandidate) {
                    SubAction("Accept") { onAccept(s) }
                    SubAction("Decline") { onDecline(s) }
                    SubAction("Add") { onAdd(s) }
                } else {
                    billFor(s)?.let { b ->
                        SubAction("Edit bill") { onEditBill(b) }
                    }
                    SubAction(if (s.manageUrl == null) "Add manage link" else "Change manage link") {
                        onManageLink(s)
                    }
                }
            }
        }
        Text("${Money.fmt(s.monthly)}/mo", color = Ct.colors.text, fontSize = 13.sp, fontFamily = PlexMono)
    }
}

private fun subDetailLine(s: SubscriptionsFinder.Item): String {
    val trialDays = s.trialDaysLeft
    val priceUp = s.priceUp
    val nextDue = s.nextDue
    return when {
        s.duplicate -> "⚡ possible duplicate"
        s.trialSoon && trialDays != null -> "⏳ trial ends in ${trialDays}d"
        trialDays != null && trialDays < 0 -> "Trial ended"
        priceUp != null -> "▲ was ${Money.fmt(priceUp)}"
        s.stale -> "⚠ unused 60d+"
        nextDue != null -> "Next: ${subFriendlyDate(nextDue)}"
        s.source == "bill" -> "Tracked bill"
        else -> "Recurring charge"
    }
}

@Composable
private fun subDetailColor(s: SubscriptionsFinder.Item) = when {
    s.duplicate -> Ct.colors.orange
    s.trialSoon -> Ct.colors.accent
    s.priceUp != null -> Ct.colors.orange
    s.stale -> Ct.colors.red
    else -> Ct.colors.muted
}

private fun subFriendlyDate(d: java.time.LocalDate): String =
    d.month.name.lowercase().replaceFirstChar { it.uppercase() }.take(3) + " ${d.dayOfMonth}"

@Composable
private fun SubAction(label: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick, role = Role.Button)
            .sizeIn(minHeight = 48.dp)
            .padding(horizontal = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = Ct.colors.accent, fontSize = 11.sp, fontWeight = FontWeight.Medium, maxLines = 1)
    }
}

@Composable
private fun ManageLinkDialog(
    item: SubscriptionsFinder.Item,
    bill: Bill?,
    vm: AppViewModel,
    onDismiss: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var url by remember { mutableStateOf(item.manageUrl ?: "") }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    val trimmed = url.trim()
    val valid = trimmed.startsWith("http://", true) || trimmed.startsWith("https://", true)

    FormDialog(
        title = "Manage link",
        saveEnabled = valid && !busy,
        saveLabel = if (busy) "Saving…" else "Save",
        onDismiss = onDismiss,
        onSave = {
            busy = true
            message = null
            bill?.let { vm.setBillManageUrl(it.id, trimmed) }
            scope.launch {
                val shared = vm.shareSubscriptionLink(item.name, trimmed)
                busy = false
                when {
                    bill != null -> onDismiss()
                    shared -> onDismiss()
                    else -> message = "Couldn't send that just now. Please try again."
                }
            }
        },
    ) {
        Text(
            "Manage or cancel link for ${item.name}",
            color = Ct.colors.text, fontSize = 14.sp, fontWeight = FontWeight.Medium,
        )
        OutlinedTextField(
            value = url,
            onValueChange = { url = it },
            placeholder = { Text("https://…/account/subscriptions") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            if (bill == null) {
                "Emails the service name, the link, and your email address to FiHaven so we can add " +
                    "it to the shared database. Optional — see our Privacy Policy."
            } else {
                "Saved on your bill. Also emails the service name, the link, and your email address " +
                    "to FiHaven so we can add it to the shared database. Optional — see our Privacy Policy."
            },
            color = Ct.colors.muted, fontSize = 12.sp,
        )
        message?.let { Text(it, color = Ct.colors.red, fontSize = 12.sp) }
    }
}
