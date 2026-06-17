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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.fihaven.AppViewModel
import app.fihaven.core.CTConstants
import app.fihaven.core.Money
import app.fihaven.core.logic.BillSchedule
import app.fihaven.core.logic.DateLogic
import app.fihaven.core.logic.PaidState
import app.fihaven.core.logic.Schedule
import app.fihaven.ui.theme.Ct
import kotlin.math.max

private data class DayItem(val name: String, val amount: Double, val icon: String, val type: String, val refId: String)

@Composable
fun CalendarScreen(vm: AppViewModel, padding: PaddingValues, onBack: (() -> Unit)? = null) {
    val data by vm.data.collectAsStateWithLifecycle()
    val zone = vm.zone()
    val today = DateLogic.today(zone)
    val first = today.withDayOfMonth(1)
    val daysInMonth = today.lengthOfMonth()
    val leadingBlanks = first.dayOfWeek.value % 7  // Sunday-first
    val monthKey = DateLogic.currentMonthKey(zone)

    var selected by remember { mutableIntStateOf(today.dayOfMonth) }
    var paying by remember { mutableStateOf<DayItem?>(null) }

    val byDay = remember(data, zone) {
        val map = HashMap<Int, MutableList<DayItem>>()
        val first = today.withDayOfMonth(1)
        data.bills.forEach { b ->
            for (day in 1..daysInMonth) {
                val d = first.plusDays((day - 1).toLong())
                if (BillSchedule.dueOn(b, d, zone)) {
                    map.getOrPut(day) { mutableListOf() }
                        .add(DayItem(b.name, b.amount, CTConstants.iconForCategory(b.category), "bill", b.id.toString()))
                }
            }
        }
        data.cards.forEach { c ->
            c.dueDay?.let { d ->
                val amt = if (c.hasPromo) max(c.minPayment, Schedule.promoNeeded(c, zone)) else c.minPayment
                map.getOrPut(d) { mutableListOf() }
                    .add(DayItem(c.name + " (payment)", amt, CTConstants.cardIcon, "card", c.id.toString()))
            }
        }
        map
    }

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding).verticalScroll(rememberScrollState())) {
        ScreenHeader(DateLogic.monthKeyLabel(monthKey), onBack = onBack, branded = true)
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(Modifier.fillMaxWidth()) {
                listOf("S", "M", "T", "W", "T", "F", "S").forEach {
                    Text(it, color = Ct.colors.muted, fontSize = 11.sp, fontFamily = PlexMono,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.weight(1f))
                }
            }
            CtCard {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    val cells = buildList {
                        repeat(leadingBlanks) { add(0) }
                        for (d in 1..daysInMonth) add(d)
                        while (size % 7 != 0) add(0)
                    }
                    cells.chunked(7).forEach { week ->
                        Row(Modifier.fillMaxWidth()) {
                            week.forEach { day ->
                                Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                                    if (day == 0) Box(Modifier.height(40.dp))
                                    else DayCell(day, day == today.dayOfMonth, day == selected,
                                        (byDay[day]?.isNotEmpty() == true)) { selected = day }
                                }
                            }
                        }
                    }
                }
            }
            Text("DUE ON THE $selected", color = Ct.colors.muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            val items = byDay[selected].orEmpty()
            if (items.isEmpty()) {
                CtCard { Text("Nothing due this day.", color = Ct.colors.muted) }
            } else {
                CtCard(padding = 0) {
                    Column {
                        items.forEachIndexed { i, it ->
                            if (i > 0) HorizontalDivider(color = Ct.colors.border)
                            val state = vm.paidState(it.type, it.refId)
                            Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                                IconButton(onClick = { paying = it }) {
                                    Icon(
                                        if (state == PaidState.FULL) Icons.Filled.CheckCircle else Icons.Outlined.Circle,
                                        "Pay",
                                        tint = when (state) {
                                            PaidState.FULL -> Ct.colors.green
                                            PaidState.PARTIAL -> Ct.colors.orange
                                            PaidState.UNPAID -> Ct.colors.muted
                                        },
                                    )
                                }
                                Text(it.icon, fontSize = 18.sp, modifier = Modifier.padding(end = 8.dp))
                                Text(it.name, color = Ct.colors.text, fontSize = 15.sp, modifier = Modifier.weight(1f))
                                Text(Money.fmt(it.amount), color = Ct.colors.text, fontSize = 14.sp,
                                    fontWeight = FontWeight.Medium, fontFamily = PlexMono)
                            }
                        }
                    }
                }
            }
        }
    }

    paying?.let { PayDialog(vm, it.type, it.refId, it.name) { paying = null } }
}

@Composable
private fun DayCell(day: Int, isToday: Boolean, isSelected: Boolean, hasItems: Boolean, onClick: () -> Unit) {
    Column(
        Modifier.height(44.dp).clip(RoundedCornerShape(9.dp))
            .background(if (isSelected) Ct.colors.accent else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(top = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("$day", fontSize = 14.sp,
            fontWeight = if (isToday) FontWeight.Bold else FontWeight.Normal,
            color = if (isSelected) Color.White else if (isToday) Ct.colors.accent else Ct.colors.text)
        Box(Modifier.padding(top = 3.dp).size(5.dp).clip(CircleShape)
            .background(if (hasItems) (if (isSelected) Color.White else Ct.colors.accent) else Color.Transparent))
    }
}
