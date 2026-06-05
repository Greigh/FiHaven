package com.danielhipskind.fihaven.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.danielhipskind.fihaven.AppViewModel
import com.danielhipskind.fihaven.core.net.User
import com.danielhipskind.fihaven.ui.theme.Ct

@Composable
fun MoreScreen(vm: AppViewModel, user: User, padding: PaddingValues, initialRoute: String? = null) {
    var route by remember { mutableStateOf(initialRoute) }
    val back = { route = null }
    when (route) {
        "pro" -> ProScreen(vm, padding, back)
        "budget" -> BudgetScreen(vm, padding, back)
        "calendar" -> ProGate(vm, ProFeature.CALENDAR, padding, onBack = back) { CalendarScreen(vm, padding, back) }
        "history" -> ProGate(vm, ProFeature.HISTORY, padding, onBack = back) { HistoryScreen(vm, padding, back) }
        "settings" -> SettingsScreen(vm, user, padding, back)
        else -> Menu(padding) { route = it }
    }
}

@Composable
private fun Menu(padding: PaddingValues, onOpen: (String) -> Unit) {
    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        ScreenHeader("More")
        Column(Modifier.padding(16.dp)) {
            CtCard(padding = 0) {
                Column {
                    item("FiHaven Pro", Icons.Filled.WorkspacePremium) { onOpen("pro") }
                    HorizontalDivider(color = Ct.colors.border)
                    item("Budget", Icons.Filled.PieChart) { onOpen("budget") }
                    HorizontalDivider(color = Ct.colors.border)
                    item("Calendar", Icons.Filled.CalendarMonth) { onOpen("calendar") }
                    HorizontalDivider(color = Ct.colors.border)
                    item("History", Icons.Filled.History) { onOpen("history") }
                    HorizontalDivider(color = Ct.colors.border)
                    item("Settings", Icons.Filled.Settings) { onOpen("settings") }
                }
            }
            MadeWithLove(
                Modifier.fillMaxWidth().padding(top = 24.dp),
            )
        }
    }
}

@Composable
private fun item(label: String, icon: ImageVector, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = Ct.colors.accent, modifier = Modifier.padding(end = 14.dp))
        Text(label, color = Ct.colors.text, fontSize = 16.sp, modifier = Modifier.weight(1f))
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = Ct.colors.muted)
    }
}
