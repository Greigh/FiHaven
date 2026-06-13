package com.danielhipskind.fihaven.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.danielhipskind.fihaven.AppViewModel
import com.danielhipskind.fihaven.core.logic.Rewards
import com.danielhipskind.fihaven.ui.theme.Ct
import com.danielhipskind.fihaven.ui.theme.PlexMono

/**
 * "Maximize rewards" tool: pick a spending category and see which card earns
 * the most. Cards inside an active 0% promo are excluded (and explained).
 * Ranking logic lives in core's Rewards.
 */
@Composable
fun RewardsScreen(vm: AppViewModel, padding: PaddingValues) {
    val data by vm.data.collectAsStateWithLifecycle()
    var category by remember { mutableStateOf("Dining") }

    val creditCards = data.cards.filter { it.type != "loan" }
    val anyRewards = creditCards.any { it.rewardBase > 0 || it.rewardCategories.values.any { v -> v > 0 } }
    val ranking = Rewards.rank(data.cards, category, vm.zone())

    Column(
        Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)
            .verticalScroll(rememberScrollState()),
    ) {
        ScreenHeader("Rewards")
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            if (creditCards.isEmpty()) {
                CtCard {
                    Column {
                        Text("💳 No cards yet", fontWeight = FontWeight.SemiBold, color = Ct.colors.text)
                        Text("Add a credit card and set its reward rates to get recommendations.",
                            color = Ct.colors.muted, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp))
                    }
                }
            } else {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Rewards.CATEGORIES.forEach { cat ->
                        FilterChip(
                            selected = cat == category,
                            onClick = { category = cat },
                            label = { Text(cat) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = Ct.colors.accent,
                                selectedLabelColor = Ct.colors.surface,
                            ),
                        )
                    }
                }

                if (!anyRewards) {
                    Text("No reward rates set yet. Edit a card and add a base rate (and category bonuses) to rank your cards per purchase.",
                        color = Ct.colors.muted, fontSize = 13.sp)
                }

                ranking.eligible.firstOrNull()?.let { best ->
                    CtCard {
                        Column {
                            FieldLabel("Best for ${category.lowercase()}")
                            Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text("💳 ${best.card.name.ifEmpty { "Card" }}",
                                    fontWeight = FontWeight.Bold, fontSize = 18.sp, color = Ct.colors.text,
                                    modifier = Modifier.weight(1f))
                                Text(ratePct(best.rate), fontWeight = FontWeight.Bold, fontSize = 24.sp,
                                    fontFamily = PlexMono, color = Ct.colors.accent)
                            }
                        }
                    }
                }

                val runnersUp = ranking.eligible.drop(1)
                if (runnersUp.isNotEmpty()) {
                    CtCard {
                        Column {
                            runnersUp.forEachIndexed { i, e ->
                                Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Text(e.card.name.ifEmpty { "Card" }, color = Ct.colors.text, modifier = Modifier.weight(1f))
                                    Text(ratePct(e.rate), fontWeight = FontWeight.SemiBold, color = Ct.colors.muted, fontFamily = PlexMono)
                                }
                                if (i < runnersUp.lastIndex) HorizontalDivider(color = Ct.colors.border)
                            }
                        }
                    }
                }

                if (ranking.excluded.isNotEmpty()) {
                    CtCard {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            FieldLabel("Skipped (0% promo)")
                            ranking.excluded.forEach { e ->
                                Column {
                                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                        Text(e.card.name.ifEmpty { "Card" }, color = Ct.colors.muted, modifier = Modifier.weight(1f))
                                        Text("${ratePct(e.rate)} · skipped", fontSize = 12.sp,
                                            fontWeight = FontWeight.SemiBold, color = Ct.colors.muted)
                                    }
                                    e.reason?.let {
                                        Text("⚠ $it", fontSize = 11.sp, color = Ct.colors.orange,
                                            modifier = Modifier.padding(top = 2.dp))
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun ratePct(r: Double): String {
    val rounded = Math.round(r * 100) / 100.0
    return (if (rounded == Math.floor(rounded)) rounded.toInt().toString() else rounded.toString()) + "%"
}
