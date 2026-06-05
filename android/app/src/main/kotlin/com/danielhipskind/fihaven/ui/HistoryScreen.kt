package com.danielhipskind.fihaven.ui

import com.danielhipskind.fihaven.ui.theme.PlexMono

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.danielhipskind.fihaven.AppViewModel
import com.danielhipskind.fihaven.core.CTConstants
import com.danielhipskind.fihaven.core.Money
import com.danielhipskind.fihaven.core.logic.DateLogic
import com.danielhipskind.fihaven.core.model.Payment
import com.danielhipskind.fihaven.ui.theme.Ct
import java.time.format.DateTimeFormatter
import java.util.Locale

private val prettyDate = DateTimeFormatter.ofPattern("EEE, MMM d, yyyy", Locale.US)

@Composable
fun HistoryScreen(vm: AppViewModel, padding: PaddingValues, onBack: (() -> Unit)? = null) {
    val data by vm.data.collectAsStateWithLifecycle()
    val groups = data.payments
        .sortedByDescending { it.date }
        .groupBy { it.monthKey }
        .toList()
        .sortedByDescending { it.first }

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        ScreenHeader("History", onBack = onBack)
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            if (data.payments.isEmpty()) {
                item { CtCard { Text("No payments recorded yet.", color = Ct.colors.muted) } }
            }
            groups.forEach { (monthKey, items) ->
                item(key = monthKey) {
                    Column {
                        Text(DateLogic.monthKeyLabel(monthKey), color = Ct.colors.muted,
                            fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(bottom = 8.dp))
                        CtCard(padding = 0) {
                            Column {
                                items.forEachIndexed { i, p ->
                                    if (i > 0) HorizontalDivider(color = Ct.colors.border)
                                    HistoryRow(p) { vm.deletePayment(p) }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HistoryRow(p: Payment, onDelete: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(start = 14.dp, top = 8.dp, bottom = 8.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Text(if (p.type == "card") CTConstants.cardIcon else "🧾", fontSize = 18.sp,
            modifier = Modifier.padding(end = 12.dp))
        Column(Modifier.weight(1f)) {
            Text(p.name.ifBlank { p.type.replaceFirstChar { it.uppercase() } },
                color = Ct.colors.text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
            Text(prettyDate(p), color = Ct.colors.muted, fontSize = 12.sp)
        }
        Text(Money.fmt(p.amount), color = Ct.colors.green, fontSize = 15.sp,
            fontWeight = FontWeight.Medium, fontFamily = PlexMono)
        IconButton(onClick = onDelete) {
            Icon(Icons.Outlined.Delete, "Delete", tint = Ct.colors.muted)
        }
    }
}

private fun prettyDate(p: Payment): String {
    val d = DateLogic.parseDate(p.date) ?: return p.date
    return prettyDate.format(d)
}
