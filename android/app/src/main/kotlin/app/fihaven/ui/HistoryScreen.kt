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
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.TextAutoSize
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.fihaven.AppViewModel
import app.fihaven.core.CTConstants
import app.fihaven.core.Money
import app.fihaven.core.logic.CashflowHistory
import app.fihaven.core.logic.DateLogic
import app.fihaven.core.logic.Income
import app.fihaven.core.logic.Period
import app.fihaven.core.model.Payment
import app.fihaven.core.model.SpendTransaction
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
    // Everything settled — paid AND skipped. A skip is a payment record flagged
    // `skipped` (amount 0): not money out, but a decision worth looking back on,
    // so it lists as a "Skipped" row and stays out of every total.
    val cfg = vm.periodConfig()
    val groups = data.payments
        .sortedByDescending { it.date }
        .groupBy { Period.keyForPayment(it, cfg) }
        .toList()
        .sortedByDescending { it.first }

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        ScreenHeader("History", onBack = onBack, branded = true)
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item {
                IncomeHistoryCard(
                    data.settings, vm.zone(), vm.currentUser?.createdAt,
                    data.payments, data.transactions,
                )
            }
            if (data.payments.isEmpty()) {
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
private fun IncomeHistoryCard(
    settings: JsonObject,
    zone: ZoneId,
    createdAt: Double?,
    payments: List<Payment>,
    transactions: List<SpendTransaction>,
) {
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

    // Merged income-vs-spending series. Its window self-clamps to months with a
    // real outflow record, so it can be shorter than the picker's range.
    val cf = remember(settings, payments, transactions, window, zone) {
        CashflowHistory.series(
            settings = settings,
            payments = payments,
            transactions = transactions,
            months = window,
            from = DateLogic.monthKey(LocalDate.now(zone)),
        )
    }
    val hasCashflow = cf.rows.isNotEmpty()
    // Averages run over ACCOUNTED months only. A blind month carries spending 0,
    // and folding that in would quietly understate spending and inflate net — the
    // same fabricated zero the chart refuses to draw.
    val accounted = cf.rows.filter { !it.blind }
    val avgNet = if (accounted.isEmpty()) 0.0 else accounted.sumOf { it.net } / accounted.size
    val avgSpend = if (accounted.isEmpty()) 0.0 else accounted.sumOf { it.spending } / accounted.size

    Column {
        Row(
            Modifier.fillMaxWidth().padding(bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                if (hasCashflow) "Income & spending" else "Income history",
                color = Ct.colors.muted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
            )
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
                if (hasCashflow) {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        StatFigure(
                            "Avg net / mo",
                            (if (avgNet >= 0) "+" else "") + Money.fmt(avgNet),
                            if (avgNet >= 0) Ct.colors.green else Ct.colors.red,
                            caption = "over ${accounted.size} recorded mo",
                        )
                        StatFigure("Avg income", Money.fmt(avg), Ct.colors.text)
                        StatFigure("Avg spending", Money.fmt(avgSpend), Ct.colors.text)
                    }

                    CashflowChart(cf.rows)

                    Text(
                        buildString {
                            append(
                                "Income is projected from your current setup, not recorded month by " +
                                    "month — a raise today reshapes every month shown here. Card payments " +
                                    "are left out of spending: they settle purchases already counted, so " +
                                    "adding them would double-count.",
                            )
                            if (cf.blindMonths > 0) {
                                append(
                                    " ${cf.blindMonths} month${if (cf.blindMonths == 1) "" else "s"} " +
                                        "can't be accounted for, so the spending line breaks there " +
                                        "instead of plotting a zero.",
                                )
                            }
                        },
                        color = Ct.colors.muted, fontSize = 11.sp,
                    )

                    // Table view for the chart — same figures, exact and screen-readable.
                    // The columns share the row's width instead of taking fixed dp:
                    // a five-figure amount didn't fit 72dp and wrapped mid-number.
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        TableHead("MONTH", MONTH_COL, TextAlign.Start)
                        TableHead("INCOME", MONEY_COL)
                        TableHead("SPENDING", SPEND_COL)
                        TableHead("NET", MONEY_COL)
                    }
                    HorizontalDivider(color = Ct.colors.border)
                    // Newest-first for the table; the chart reads oldest → newest.
                    cf.rows.reversed().forEach { r ->
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            OneLine(
                                DateLogic.monthKeyLabel(r.mk),
                                color = if (r.blind) Ct.colors.muted.copy(alpha = 0.75f) else Ct.colors.muted,
                                weight = MONTH_COL, maxFontSize = 11.sp, align = TextAlign.Start,
                            )
                            OneLine(
                                Money.fmt(r.income), color = Ct.colors.text, weight = MONEY_COL,
                                fontFamily = PlexMono, fontWeight = FontWeight.Medium,
                            )
                            OneLine(
                                if (r.blind) "not recorded" else Money.fmt(r.spending),
                                color = if (r.blind) Ct.colors.muted else Ct.colors.text,
                                weight = SPEND_COL,
                                maxFontSize = if (r.blind) 10.sp else 12.sp,
                                fontFamily = if (r.blind) FontFamily.Default else PlexMono,
                                fontWeight = FontWeight.Medium,
                            )
                            OneLine(
                                if (r.blind) "—" else (if (r.net >= 0) "+" else "") + Money.fmt(r.net),
                                color = when {
                                    r.blind -> Ct.colors.muted
                                    r.net >= 0 -> Ct.colors.green
                                    else -> Ct.colors.red
                                },
                                weight = MONEY_COL,
                                maxFontSize = if (r.blind) 10.sp else 12.sp,
                                fontFamily = if (r.blind) FontFamily.Default else PlexMono,
                                fontWeight = FontWeight.Medium,
                            )
                        }
                    }
                } else {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        StatFigure(
                            "Avg / mo (incl. bonuses)", Money.fmt(avg), Ct.colors.text,
                            caption = "last ${months.size} mo",
                        )
                        StatFigure("Recurring / mo", Money.fmt(base), Ct.colors.text)
                        if (totalBonus > 0) {
                            StatFigure("Bonuses", Money.fmt(totalBonus), Ct.colors.green)
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
}

// How the cashflow table splits a row between its four columns. Money needs
// the most: "-$5,400.06" is wider than the "SPENDING" that heads it.
private const val MONTH_COL = 1.05f
private const val MONEY_COL = 1f
private const val SPEND_COL = 1.05f

/**
 * Text that shrinks to hold one line rather than wrapping.
 *
 * Every figure on this screen shares a row with two or three others, so there
 * is no width to spare: an amount that wrapped broke across lines mid-number
 * ("$5,220." / "60"), which reads as two figures. Shrinking a point or two is
 * the lesser evil, and a large system font scale makes it the common case.
 */
@Composable
private fun RowScope.OneLine(
    text: String,
    color: Color,
    weight: Float,
    maxFontSize: TextUnit = 12.sp,
    minFontSize: TextUnit = 9.sp,
    align: TextAlign = TextAlign.End,
    fontFamily: FontFamily? = null,
    fontWeight: FontWeight? = null,
) {
    Text(
        text,
        color = color,
        fontFamily = fontFamily,
        fontWeight = fontWeight,
        textAlign = align,
        maxLines = 1,
        autoSize = TextAutoSize.StepBased(minFontSize, maxFontSize, 0.5.sp),
        modifier = Modifier.weight(weight),
    )
}

/** One column heading in the cashflow table. */
@Composable
private fun RowScope.TableHead(text: String, weight: Float, align: TextAlign = TextAlign.End) {
    OneLine(
        text, color = Ct.colors.muted, weight = weight, maxFontSize = 10.sp, minFontSize = 8.sp,
        align = align, fontWeight = FontWeight.SemiBold,
    )
}

/**
 * A headline figure with its caption, sharing the row evenly with its
 * siblings. Label, figure and caption each hold one line so the three
 * columns' numbers stay on a common baseline.
 */
@Composable
private fun RowScope.StatFigure(label: String, value: String, color: Color, caption: String? = null) {
    Column(Modifier.weight(1f)) {
        Row { OneLine(label, Ct.colors.muted, 1f, maxFontSize = 11.sp, align = TextAlign.Start) }
        Row {
            OneLine(
                value, color, 1f, maxFontSize = 20.sp, minFontSize = 12.sp, align = TextAlign.Start,
                fontFamily = PlexMono, fontWeight = FontWeight.SemiBold,
            )
        }
        if (caption != null) {
            Row { OneLine(caption, Ct.colors.muted, 1f, maxFontSize = 11.sp, align = TextAlign.Start) }
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
        Text(if (p.skipped) "⏭" else if (p.type == "card") CTConstants.cardIcon else "🧾",
            fontSize = 18.sp, modifier = Modifier.padding(end = 12.dp))
        Column(Modifier.weight(1f)) {
            Text(p.name.ifBlank { p.type.replaceFirstChar { it.uppercase() } },
                color = Ct.colors.text, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 1)
            Text(prettyDate(p), color = Ct.colors.muted, fontSize = 12.sp)
            if (p.note.isNotBlank()) {
                Text(p.note, color = Ct.colors.muted, fontSize = 11.sp, maxLines = 1)
            }
        }
        // Nothing left the account on a skip, so it never wears the green
        // "money moved" treatment.
        if (p.skipped) {
            Text("Skipped", color = Ct.colors.muted, fontSize = 13.sp,
                fontWeight = FontWeight.Medium)
        } else {
            Text(Money.fmt(p.amount), color = Ct.colors.green, fontSize = 15.sp,
                fontWeight = FontWeight.Medium, fontFamily = PlexMono)
        }
        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            // A skip has no amount to edit — the pay editor refuses $0, so editing
            // one could only turn it into a payment by accident. Deleting is the un-skip.
            if (!p.skipped) {
                DropdownMenuItem(text = { Text("Edit") }, onClick = { menuOpen = false; onEdit() })
            }
            DropdownMenuItem(
                text = { Text(if (p.skipped) "Remove skip" else "Delete") },
                onClick = { menuOpen = false; onDelete() },
            )
        }
    }
}

private fun prettyDate(p: Payment): String {
    val d = DateLogic.parseDate(p.date) ?: return p.date
    return prettyDate.format(d)
}
