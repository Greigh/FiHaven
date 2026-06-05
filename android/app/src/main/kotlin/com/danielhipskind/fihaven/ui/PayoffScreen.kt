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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.danielhipskind.fihaven.AppViewModel
import com.danielhipskind.fihaven.core.Money
import com.danielhipskind.fihaven.core.logic.DateLogic
import com.danielhipskind.fihaven.core.logic.Payoff
import com.danielhipskind.fihaven.core.logic.PayoffResult
import com.danielhipskind.fihaven.core.logic.PayoffStrategy
import com.danielhipskind.fihaven.ui.theme.Ct

@Composable
fun PayoffScreen(vm: AppViewModel, padding: PaddingValues) {
    val data by vm.data.collectAsStateWithLifecycle()
    var strategy by remember { mutableStateOf(PayoffStrategy.AVALANCHE) }
    var extra by remember { mutableFloatStateOf(100f) }
    val result = Payoff.runPayoffSim(data.cards, strategy, extra.toDouble(), vm.zone())

    Column(
        Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)
            .verticalScroll(rememberScrollState()),
    ) {
        ScreenHeader("Payoff")
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            CtCard {
                Column {
                    FieldLabel("Strategy")
                    Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        chip("Minimums", strategy == PayoffStrategy.NONE) { strategy = PayoffStrategy.NONE }
                        chip("Snowball", strategy == PayoffStrategy.SNOWBALL) { strategy = PayoffStrategy.SNOWBALL }
                        chip("Avalanche", strategy == PayoffStrategy.AVALANCHE) { strategy = PayoffStrategy.AVALANCHE }
                    }
                    Text(blurb(strategy), color = Ct.colors.muted, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
                }
            }
            CtCard {
                Column {
                    Row {
                        FieldLabel("Extra per month")
                        Text(Money.fmt(extra.toDouble()), color = Ct.colors.accent, fontSize = 15.sp,
                            fontWeight = FontWeight.Medium, fontFamily = PlexMono,
                            modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.End)
                    }
                    Slider(value = extra, onValueChange = { extra = it }, valueRange = 0f..1000f, steps = 39,
                        enabled = strategy != PayoffStrategy.NONE)
                }
            }
            if (result == null) {
                CtCard { Text("Add a card with a balance to see a payoff plan.", color = Ct.colors.muted) }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    stat("Debt-free in", "${result.months} mo", Ct.colors.accent,
                        DateLogic.monthKeyLabel(DateLogic.monthKey(result.payoffDate)), Modifier.weight(1f))
                    stat("Total interest", Money.fmtShort(result.totalInterest), Ct.colors.red, null, Modifier.weight(1f))
                }
                CtCard(padding = 0) {
                    Column {
                        Text("BY CARD", color = Ct.colors.muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(14.dp))
                        result.cards.forEachIndexed { i, c ->
                            if (i > 0) HorizontalDivider(color = Ct.colors.border)
                            Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(c.name, color = Ct.colors.text, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                                    Text("Started at ${Money.fmt(c.origBalance)}", color = Ct.colors.muted, fontSize = 11.sp)
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    Text(c.paidOffMonth?.let { "Month $it" } ?: "—", color = Ct.colors.text,
                                        fontSize = 13.sp, fontFamily = PlexMono)
                                    Text("${Money.fmtShort(c.interestPaid)} interest", color = Ct.colors.muted,
                                        fontSize = 10.sp, fontFamily = PlexMono)
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
private fun chip(label: String, selected: Boolean, onClick: () -> Unit) {
    FilterChip(selected = selected, onClick = onClick, label = { Text(label) })
}

@Composable
private fun stat(label: String, value: String, color: Color, subtitle: String?, modifier: Modifier) {
    CtCard(modifier) {
        Column {
            FieldLabel(label)
            Text(value, color = color, fontSize = 22.sp, fontWeight = FontWeight.SemiBold, fontFamily = PlexMono)
            if (subtitle != null) Text(subtitle, color = Ct.colors.muted, fontSize = 11.sp)
        }
    }
}

private fun blurb(s: PayoffStrategy) = when (s) {
    PayoffStrategy.NONE -> "Pay only the minimums on every card."
    PayoffStrategy.SNOWBALL -> "Throw extra at the smallest balance first for quick wins."
    PayoffStrategy.AVALANCHE -> "Throw extra at the highest APR first to minimize interest."
}
