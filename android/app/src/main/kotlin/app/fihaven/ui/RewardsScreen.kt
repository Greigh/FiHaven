package app.fihaven.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.TextButton
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
import app.fihaven.AppViewModel
import app.fihaven.core.Money
import app.fihaven.core.logic.DateLogic
import app.fihaven.core.logic.Merchants
import app.fihaven.core.logic.Offers
import app.fihaven.core.logic.Perks
import app.fihaven.core.logic.Rewards
import app.fihaven.core.model.perkUsage
import app.fihaven.ui.theme.Ct
import app.fihaven.ui.theme.PlexMono

/**
 * "Maximize rewards" tool: pick a spending category and see which card earns
 * the most. Cards inside an active 0% promo are excluded (and explained).
 * Ranking logic lives in core's Rewards.
 */
@Composable
fun RewardsScreen(vm: AppViewModel, padding: PaddingValues) {
    val data by vm.data.collectAsStateWithLifecycle()
    var category by remember { mutableStateOf("Dining") }
    var merchantQuery by remember { mutableStateOf("") }

    // Annualized category spend from manual + bank-synced transactions; feeds
    // the rewards estimate in the fee check and the offer-use detection.
    val spendByCategory = Rewards.categorySpendAnnual(data.transactions, DateLogic.today(vm.zone()))

    val creditCards = data.activeCards.filter { it.type != "loan" }
    val anyRewards = creditCards.any { it.rewardBase > 0 || it.rewardCategories.values.any { v -> v > 0 } }
    val ranking = Rewards.rank(data.activeCards, category, vm.zone())

    Column(
        Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)
            .verticalScroll(rememberScrollState()),
    ) {
        ScreenHeader("Rewards", branded = true)
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

                // Type a store name → jump to its reward category, so you see
                // the best card for it instantly.
                val merchantHint = merchantQuery.trim().takeIf { it.isNotEmpty() }?.let { Merchants.category(it) }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    androidx.compose.material3.OutlinedTextField(
                        value = merchantQuery,
                        onValueChange = {
                            merchantQuery = it
                            Merchants.category(it.trim())?.let { c -> category = c }
                        },
                        placeholder = { Text("Where are you shopping? (e.g. Starbucks)") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    if (merchantQuery.trim().isNotEmpty()) {
                        if (merchantHint != null) {
                            Text("→ $merchantHint", fontWeight = FontWeight.Bold, color = Ct.colors.accent, fontSize = 13.sp)
                        } else {
                            Text("no match", color = Ct.colors.muted, fontSize = 12.sp)
                        }
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
                                    fontWeight = FontWeight.Bold, fontSize = 18.sp, color = Ct.colors.text)
                                if (best.card.rotatingPool?.contains(category) == true) {
                                    Spacer(Modifier.width(6.dp)); RotBadge()
                                }
                                Spacer(Modifier.weight(1f))
                                Text(ratePct(best.value), fontWeight = FontWeight.Bold, fontSize = 24.sp,
                                    fontFamily = PlexMono, color = Ct.colors.accent)
                            }
                            val rotateNote = if (best.card.rotatingPool?.contains(category) == true) " · activate this quarter" else ""
                            Text(Rewards.explanation(best.card, category) + rotateNote,
                                color = Ct.colors.muted, fontSize = 12.sp)
                        }
                    }
                }

                val runnersUp = ranking.eligible.drop(1)
                if (runnersUp.isNotEmpty()) {
                    CtCard {
                        Column {
                            runnersUp.forEachIndexed { i, e ->
                                Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text(e.card.name.ifEmpty { "Card" }, color = Ct.colors.text)
                                            if (e.card.rotatingPool?.contains(category) == true) {
                                                Spacer(Modifier.width(6.dp)); RotBadge()
                                            }
                                        }
                                        breakdown(e)?.let {
                                            Text(it, color = Ct.colors.muted, fontSize = 11.sp)
                                        }
                                    }
                                    Text(ratePct(e.value), fontWeight = FontWeight.SemiBold, color = Ct.colors.muted, fontFamily = PlexMono)
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
                                        Text("${ratePct(e.value)} · skipped", fontSize = 12.sp,
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

                val wallet = Rewards.walletStrategy(data.activeCards, Rewards.CATEGORIES, vm.zone()).filter { it.best != null }
                if (wallet.isNotEmpty()) {
                    CtCard {
                        Column {
                            FieldLabel("Your wallet at a glance")
                            Text("Best card for every category", fontWeight = FontWeight.SemiBold, fontSize = 16.sp,
                                color = Ct.colors.text, modifier = Modifier.padding(bottom = 4.dp))
                            wallet.forEach { pick ->
                                val best = pick.best!!
                                Row(
                                    Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
                                        .clickable { category = pick.category }.padding(vertical = 7.dp, horizontal = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(pick.category, color = Ct.colors.muted, fontSize = 13.sp, modifier = Modifier.width(92.dp))
                                    Text(best.card.name.ifEmpty { "Card" }, color = Ct.colors.text,
                                        fontWeight = FontWeight.SemiBold, maxLines = 1, modifier = Modifier.weight(1f))
                                    if (best.card.rotatingPool?.contains(pick.category) == true) {
                                        RotBadge(); Spacer(Modifier.width(6.dp))
                                    }
                                    Text(ratePct(best.value), fontWeight = FontWeight.Bold, fontFamily = PlexMono, color = Ct.colors.accent)
                                }
                            }
                        }
                    }
                }

                val today = DateLogic.today(vm.zone())

                // "Looks like you used this" — offers with a matching recent charge.
                val suggestions = Offers.useSuggestions(data.activeCards, data.transactions, today)
                if (suggestions.isNotEmpty()) {
                    CtCard {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            FieldLabel("Looks like you used these")
                            Text("Mark them used?", fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = Ct.colors.text)
                            Text("We spotted a charge at these offers’ merchants. Confirm if the offer terms were met — FiHaven never marks an offer used on its own.",
                                color = Ct.colors.muted, fontSize = 11.sp)
                            suggestions.forEach { item ->
                                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text(if (item.offer.detail.isBlank()) item.offer.merchant else "${item.offer.merchant} · ${item.offer.detail}",
                                            color = Ct.colors.text, fontWeight = FontWeight.Medium)
                                        Text("💳 ${item.card.name.ifEmpty { "Card" }} · ${Money.fmt(item.tx.amount)} at ${item.tx.merchant} on ${item.tx.date}",
                                            color = Ct.colors.green, fontSize = 11.sp)
                                    }
                                    TextButton({ vm.setOfferUsed(item.card.id.toString(), item.offer.id, true) }) {
                                        Text("Mark used", color = Ct.colors.green, fontSize = 12.sp)
                                    }
                                }
                            }
                        }
                    }
                }

                val offers = Offers.active(data.activeCards, today)
                if (offers.isNotEmpty()) {
                    val soon = Offers.expiringSoon(data.activeCards, today)
                    CtCard {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                                Column(Modifier.weight(1f)) {
                                    FieldLabel("Card-linked offers")
                                    Text("Use them before they expire", fontWeight = FontWeight.SemiBold,
                                        fontSize = 16.sp, color = Ct.colors.text)
                                }
                                if (soon > 0) {
                                    Text("$soon expiring soon", color = Ct.colors.orange, fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.background(Ct.colors.orange.copy(alpha = 0.15f), RoundedCornerShape(999.dp))
                                            .padding(horizontal = 8.dp, vertical = 3.dp))
                                }
                            }
                            offers.forEach { item ->
                                val urgent = (item.daysLeft ?: 99) <= 3
                                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text(if (item.offer.detail.isBlank()) item.offer.merchant else "${item.offer.merchant} · ${item.offer.detail}",
                                            color = Ct.colors.text, fontWeight = FontWeight.Medium)
                                        Text("💳 ${item.card.name.ifEmpty { "Card" }} · ${offerExpiry(item.daysLeft)}",
                                            color = if (urgent) Ct.colors.orange else Ct.colors.muted, fontSize = 11.sp)
                                    }
                                    TextButton({ vm.setOfferUsed(item.card.id.toString(), item.offer.id, true) }) {
                                        Text("Mark used", color = Ct.colors.green, fontSize = 12.sp)
                                    }
                                }
                            }
                        }
                    }
                }

                val feeCards = data.activeCards.mapNotNull { c ->
                    val est = Rewards.cardRewardsEstimateAnnual(c, spendByCategory)
                    Perks.feeAssessment(c, data.settings.perkUsage, today, est)?.let { c to it }
                }
                if (feeCards.isNotEmpty()) {
                    val hasSpend = spendByCategory.isNotEmpty()
                    CtCard {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            FieldLabel("Annual fee check")
                            Text("Is the fee worth it?", fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = Ct.colors.text)
                            Text(
                                if (hasSpend) "Fee vs. the value each card returns — perks you’re capturing plus an estimate of rewards earned from your category spend."
                                else "Fee vs. the value of each card’s perks. Add or sync transactions to factor in rewards earned from spending.",
                                color = Ct.colors.muted, fontSize = 11.sp,
                            )
                            feeCards.forEach { (card, a) ->
                                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.Top) {
                                    Column(Modifier.weight(1f)) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text("💳 ${card.name.ifEmpty { "Card" }}", fontWeight = FontWeight.SemiBold,
                                                fontSize = 14.sp, color = Ct.colors.text)
                                            card.feeMonth?.takeIf { it in 1..12 }?.let {
                                                Spacer(Modifier.width(6.dp))
                                                Text("renews ${MONTH_SHORT[it]}", color = Ct.colors.muted, fontSize = 10.sp)
                                            }
                                        }
                                        val rewardsPart = if (a.rewards > 0) " + ~${Money.fmt(a.rewards)} rewards" else ""
                                        Text("Captures ${Money.fmt(a.captured)} perks$rewardsPart of ${Money.fmt(a.potential + a.rewards)} · ${Money.fmt(a.fee)} fee · net ${if (a.net >= 0) "+" else ""}${Money.fmt(a.net)}",
                                            color = Ct.colors.muted, fontSize = 11.sp)
                                    }
                                    FeeVerdictPill(a.verdict)
                                }
                            }
                        }
                    }
                }

                val cardsWithPerks = data.activeCards.filter { it.perks.isNotEmpty() }
                if (cardsWithPerks.isNotEmpty()) {
                    val today = DateLogic.today(vm.zone())
                    val usage = data.settings.perkUsage
                    val unrealized = Perks.unrealizedTotal(data.activeCards, usage, today)
                    CtCard {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                                Column(Modifier.weight(1f)) {
                                    FieldLabel("Credits & perks")
                                    Text("Don’t leave money on the table",
                                        fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = Ct.colors.text)
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    Text(Money.fmt(unrealized), fontWeight = FontWeight.Bold, fontSize = 20.sp,
                                        fontFamily = PlexMono,
                                        color = if (unrealized < 0.005) Ct.colors.green else Ct.colors.accent)
                                    Text("left this cycle", color = Ct.colors.muted, fontSize = 11.sp)
                                }
                            }
                            cardsWithPerks.forEach { c ->
                                Text("💳 ${c.card_name()}", fontWeight = FontWeight.SemiBold, fontSize = 13.sp, color = Ct.colors.text)
                                c.perks.forEach { p ->
                                    PerkUsageRow(
                                        label = p.label,
                                        meta = "${PERK_FREQ_LABEL[p.frequency] ?: "Monthly"} · ${Money.fmt(p.amount)} · ${expiresLabel(p.frequency, today)}",
                                        used = Perks.used(usage, c.id.toString(), p, today),
                                        remaining = Perks.remaining(usage, c.id.toString(), p, today),
                                        onSet = { vm.setPerkUsage(c.id.toString(), p, it) },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun app.fihaven.core.model.Card.card_name() = name.ifEmpty { "Card" }

private val PERK_FREQ_LABEL = mapOf(
    "monthly" to "Monthly", "quarterly" to "Quarterly", "semiannual" to "Twice a year", "annual" to "Yearly",
)

private val MONTH_SHORT = listOf(
    "", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
)

@Composable
private fun FeeVerdictPill(verdict: Perks.FeeVerdict) {
    val (label, color) = when (verdict) {
        Perks.FeeVerdict.KEEP -> "Pays for itself" to Ct.colors.green
        Perks.FeeVerdict.OPTIMIZE -> "Use it more" to Ct.colors.accent
        Perks.FeeVerdict.REVIEW -> "Review" to Ct.colors.orange
    }
    Text(
        label, color = color, fontSize = 10.sp, fontWeight = FontWeight.Bold,
        modifier = Modifier
            .background(color.copy(alpha = 0.15f), RoundedCornerShape(999.dp))
            .padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

private fun expiresLabel(frequency: String, today: java.time.LocalDate): String {
    val d = Perks.expiresInDays(frequency, today)
    return if (d == 0) "ends today" else "${d}d left"
}

private fun offerExpiry(daysLeft: Int?): String = when {
    daysLeft == null -> "no expiry"
    daysLeft <= 0 -> "ends today"
    daysLeft == 1 -> "1 day left"
    else -> "$daysLeft days left"
}

@Composable
private fun PerkUsageRow(label: String, meta: String, used: Double, remaining: Double, onSet: (Double) -> Unit) {
    var text by remember(used) { mutableStateOf(if (used == 0.0) "" else trimNum(used)) }
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(label, color = Ct.colors.text)
            Text(meta, color = Ct.colors.muted, fontSize = 11.sp)
        }
        androidx.compose.material3.OutlinedTextField(
            value = text,
            onValueChange = { text = it; onSet(it.toDoubleOrNull() ?: 0.0) },
            label = { Text("used $") },
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                keyboardType = androidx.compose.ui.text.input.KeyboardType.Decimal),
            singleLine = true,
            modifier = Modifier.width(110.dp),
        )
        Spacer(Modifier.width(8.dp))
        Text(
            if (remaining < 0.005) "✓" else Money.fmt(remaining),
            color = if (remaining < 0.005) Ct.colors.green else Ct.colors.accent,
            fontSize = 12.sp, fontFamily = PlexMono,
        )
    }
}

private fun ratePct(r: Double): String {
    val rounded = Math.round(r * 100) / 100.0
    return (if (rounded == Math.floor(rounded)) rounded.toInt().toString() else rounded.toString()) + "%"
}

private fun trimNum(d: Double): String =
    if (d == Math.floor(d)) d.toInt().toString() else d.toString()

// For a points card (point value ≠ 1), how the cash-equivalent breaks down.
private fun breakdown(e: Rewards.Ranked): String? =
    if (e.pointValue != 1.0) "${trimNum(e.rate)}× points · ${trimNum(e.pointValue)}¢/pt" else null

// Flags a category that rotates on this card — its rate only applies while the
// user has it activated for the quarter.
@Composable
private fun RotBadge() {
    Text(
        "ROTATING",
        fontSize = 9.sp,
        fontWeight = FontWeight.Bold,
        color = Ct.colors.accent,
        modifier = Modifier
            .background(Ct.colors.accent.copy(alpha = 0.16f), RoundedCornerShape(999.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}
