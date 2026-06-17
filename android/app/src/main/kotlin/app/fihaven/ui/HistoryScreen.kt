package app.fihaven.ui

import app.fihaven.ui.theme.PlexMono

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
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
import app.fihaven.core.logic.Period
import app.fihaven.core.model.Payment
import app.fihaven.ui.theme.Ct
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
