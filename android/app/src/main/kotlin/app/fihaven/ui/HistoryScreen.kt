package app.fihaven.ui

import app.fihaven.ui.theme.PlexMono

import androidx.compose.foundation.clickable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.fihaven.AppViewModel
import app.fihaven.core.CTConstants
import app.fihaven.core.Money
import app.fihaven.core.logic.DateLogic
import app.fihaven.core.logic.Income
import app.fihaven.core.logic.Period
import app.fihaven.core.model.Payment
import app.fihaven.ui.theme.Ct
import kotlinx.serialization.json.JsonObject
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val prettyDate = DateTimeFormatter.ofPattern("EEE, MMM d, yyyy", Locale.US)

@Composable
fun HistoryScreen(vm: AppViewModel, padding: PaddingValues, onBack: (() -> Unit)? = null) {
    val data by vm.data.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<Payment?>(null) }
    val realPayments = data.payments.filterNot { it.skipped }
    val cfg = vm.periodConfig()
    val groups = realPayments
        .sortedByDescending { it.date }
        .groupBy { Period.keyForPayment(it, cfg) }
        .toList()
        .sortedByDescending { it.first }

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        ScreenHeader("History", onBack = onBack, branded = true)
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item { IncomeHistoryCard(data.settings, vm.zone(), vm.currentUser?.createdAt) }
            if (realPayments.isEmpty()) {
                item { CtCard { Text("No payments recorded yet.", color = Ct.colors.muted) } }
            }
            groups.forEach { (monthKey, items) ->
                item(key = monthKey) {
                    Column {
                        Text(Period.labelForKey(monthKey, cfg), color = Ct.colors.muted,
                            fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(bottom = 8.dp))
                        CtCard(padding = 0) {
                            Column {
                                items.forEachIndexed { i, p ->
                                    if (i > 0) HorizontalDivider(color = Ct.colors.border)
                                    HistoryRow(
                                        p,
                                        onEdit = { editing = p },
                                        onDelete = { vm.deletePayment(p) },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    editing?.let { EditPaymentDialog(it, vm) { editing = null } }
}

/** Income history: membership-bounded months (default ≤18) with a range control. */
@Composable
private fun IncomeHistoryCard(settings: JsonObject, zone: ZoneId, createdAt: Double?) {
    var range by remember { mutableStateOf("18") }
    val membership = remember(createdAt, zone) { monthsSinceJoin(createdAt, zone) }
    val options = remember(membership) {
        buildList {
            if (membership >= 6) add("6")
            if (membership >= 12) add("12")
            if (membership >= 18) add("18")
            add("all")
        }
    }
    val window = when (range) {
        "6" -> minOf(6, membership)
        "12" -> minOf(12, membership)
        "18" -> minOf(18, membership)
        else -> membership
    }.coerceAtLeast(1)
    val months = remember(settings, window, zone) {
        (0 until window).map { i ->
            val mk = DateLogic.monthKey(LocalDate.now(zone).minusMonths(i.toLong()))
            val total = Income.monthlyIncome(settings, mk)
            val bonus = Income.adjustmentsFor(settings, mk).filter { it.amount > 0 }.sumOf { it.amount }
            Triple(mk, total, bonus)
        }
    }
    val base = Income.monthlyIncome(settings)
    if (base <= 0.0 && months.none { it.second > 0.0 }) return
    val avg = if (months.isEmpty()) 0.0 else months.sumOf { it.second } / months.size
    val maxTotal = (months.maxOfOrNull { it.second } ?: 1.0).coerceAtLeast(1.0)
    val totalBonus = months.sumOf { it.third }

    Column {
        Row(
            Modifier.fillMaxWidth().padding(bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text("Income history", color = Ct.colors.muted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            if (options.size > 1) {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    options.forEach { opt ->
                        val label = if (opt == "all") "All" else opt
                        val selected = range == opt || (opt == "all" && range == "all")
                        Text(
                            label,
                            color = if (range == opt) Ct.colors.accent else Ct.colors.muted,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier
                                .clip(RoundedCornerShape(999.dp))
                                .background(if (range == opt) Ct.colors.accentBg else Ct.colors.surface2)
                                .clickable { range = opt }
                                .padding(horizontal = 10.dp, vertical = 5.dp),
                        )
                    }
                }
            }
        }
        CtCard {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                    Column {
                        Text("Avg / mo (incl. bonuses)", color = Ct.colors.muted, fontSize = 11.sp)
                        Text(Money.fmt(avg), color = Ct.colors.text, fontSize = 20.sp,
                            fontWeight = FontWeight.SemiBold, fontFamily = PlexMono)
                        Text("last ${months.size} mo", color = Ct.colors.muted, fontSize = 11.sp)
                    }
                    Column {
                        Text("Recurring / mo", color = Ct.colors.muted, fontSize = 11.sp)
                        Text(Money.fmt(base), color = Ct.colors.text, fontSize = 20.sp,
                            fontWeight = FontWeight.SemiBold, fontFamily = PlexMono)
                    }
                    if (totalBonus > 0) {
                        Column {
                            Text("Bonuses", color = Ct.colors.muted, fontSize = 11.sp)
                            Text(Money.fmt(totalBonus), color = Ct.colors.green, fontSize = 20.sp,
                                fontWeight = FontWeight.SemiBold, fontFamily = PlexMono)
                        }
                    }
                }
                months.forEach { (mk, total, bonus) ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(DateLogic.monthKeyLabel(mk), color = Ct.colors.muted, fontSize = 11.sp,
                            modifier = Modifier.width(64.dp))
                        Box(
                            Modifier.weight(1f).height(4.dp).clip(RoundedCornerShape(999.dp))
                                .background(Ct.colors.surface2),
                        ) {
                            Box(
                                Modifier.fillMaxWidth((total / maxTotal).toFloat()).height(4.dp)
                                    .clip(RoundedCornerShape(999.dp)).background(Ct.colors.accent.copy(alpha = 0.7f)),
                            )
                        }
                        Spacer(Modifier.width(8.dp))
                        Text(Money.fmt(total), color = Ct.colors.text, fontSize = 12.sp,
                            fontFamily = PlexMono, fontWeight = FontWeight.Medium,
                            modifier = Modifier.width(78.dp))
                        Text(
                            if (bonus > 0) "+${Money.fmt(bonus)}" else "",
                            color = Ct.colors.green,
                            fontSize = 11.sp,
                            modifier = Modifier.width(64.dp),
                        )
                    }
                }
            }
        }
    }
}

private fun monthsSinceJoin(createdAt: Double?, zone: ZoneId): Int {
    if (createdAt == null) return 18
    val ms = if (createdAt > 1e12) createdAt else createdAt * 1000
    val start = java.time.Instant.ofEpochMilli(ms.toLong()).atZone(zone).toLocalDate().withDayOfMonth(1)
    var cur = LocalDate.now(zone).withDayOfMonth(1)
    var n = 0
    while (!cur.isBefore(start) && n < 240) {
        n++
        cur = cur.minusMonths(1)
    }
    return n.coerceAtLeast(1)
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun HistoryRow(p: Payment, onEdit: () -> Unit, onDelete: () -> Unit) {
    var menuOpen by remember { mutableStateOf(false) }

    Row(
        Modifier
            .fillMaxWidth()
            .combinedClickable(onClick = {}, onLongClick = { menuOpen = true })
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(if (p.type == "card") CTConstants.cardIcon else "🧾", fontSize = 18.sp,
            modifier = Modifier.padding(end = 12.dp))
        Column(Modifier.weight(1f)) {
            Text(p.name.ifBlank { p.type.replaceFirstChar { it.uppercase() } },
                color = Ct.colors.text, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 1)
            Text(prettyDate(p), color = Ct.colors.muted, fontSize = 12.sp)
            if (p.note.isNotBlank()) {
                Text(p.note, color = Ct.colors.muted, fontSize = 11.sp, maxLines = 1)
            }
        }
        Text(Money.fmt(p.amount), color = Ct.colors.green, fontSize = 15.sp,
            fontWeight = FontWeight.Medium, fontFamily = PlexMono)
        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            DropdownMenuItem(text = { Text("Edit") }, onClick = { menuOpen = false; onEdit() })
            DropdownMenuItem(text = { Text("Delete") }, onClick = { menuOpen = false; onDelete() })
        }
    }
}

private fun prettyDate(p: Payment): String {
    val d = DateLogic.parseDate(p.date) ?: return p.date
    return prettyDate.format(d)
}
