package app.fihaven.ui

import app.fihaven.ui.theme.PlexMono

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.fihaven.AppViewModel
import app.fihaven.core.Money
import app.fihaven.core.logic.DateLogic
import app.fihaven.core.logic.Payoff
import app.fihaven.core.logic.PayoffResult
import app.fihaven.core.logic.PayoffStrategy
import app.fihaven.core.model.Card
import app.fihaven.ui.theme.Ct

@Composable
fun PayoffScreen(vm: AppViewModel, padding: PaddingValues) {
    val data by vm.data.collectAsStateWithLifecycle()
    var strategy by remember { mutableStateOf(PayoffStrategy.AVALANCHE) }
    var extra by remember { mutableFloatStateOf(100f) }
    var includeMortgage by remember { mutableStateOf(false) }
    var showCompare by remember { mutableStateOf(false) }

    val housing = remember(data.activeCards) {
        data.activeCards.filter { Payoff.isHousingLoan(it) && debtOf(it) > 0 }
    }
    val zone = vm.zone()
    val simMin = Payoff.runPayoffSim(data.activeCards, PayoffStrategy.NONE, 0.0, zone, includeMortgage = includeMortgage)
    val simSnow = Payoff.runPayoffSim(data.activeCards, PayoffStrategy.SNOWBALL, extra.toDouble(), zone, includeMortgage = includeMortgage)
    val simAval = Payoff.runPayoffSim(data.activeCards, PayoffStrategy.AVALANCHE, extra.toDouble(), zone, includeMortgage = includeMortgage)
    val hero = if (strategy == PayoffStrategy.AVALANCHE) simAval else simSnow
    val avalIsBest = (simAval?.totalInterest ?: Double.MAX_VALUE) <= (simSnow?.totalInterest ?: Double.MAX_VALUE)

    Column(
        Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)
            .verticalScroll(rememberScrollState()),
    ) {
        ScreenHeader("Payoff", branded = true)
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            if (housing.isNotEmpty()) {
                CtCard {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterSwitch("Include mortgage (estimate only)", includeMortgage) {
                            includeMortgage = it
                        }
                        Text(
                            if (includeMortgage) {
                                "Ignores PMI, escrow, taxes, and insurance — dates are approximate."
                            } else {
                                "${housing.size} housing loan${if (housing.size == 1) "" else "s"} hidden."
                            },
                            color = Ct.colors.muted, fontSize = 12.sp,
                        )
                    }
                }
            }

            CtCard {
                Column {
                    Row {
                        FieldLabel("Extra per month")
                        Text(
                            Money.fmt(extra.toDouble()), color = Ct.colors.accent, fontSize = 15.sp,
                            fontWeight = FontWeight.Medium, fontFamily = PlexMono,
                            modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.End,
                        )
                    }
                    Slider(
                        value = extra,
                        onValueChange = {
                            extra = it
                            if (it > 0f) strategy = if (avalIsBest) PayoffStrategy.AVALANCHE else PayoffStrategy.SNOWBALL
                        },
                        valueRange = 0f..1000f,
                        steps = 39,
                    )
                }
            }

            if (hero == null) {
                CtCard {
                    Text(
                        if (housing.isNotEmpty() && !includeMortgage) {
                            "Add a card or loan with a balance, or include your mortgage estimate above."
                        } else {
                            "Add a card or loan with a balance to see a payoff plan."
                        },
                        color = Ct.colors.muted,
                    )
                }
            } else {
                val saves = ((simMin?.totalInterest ?: 0.0) - hero.totalInterest).coerceAtLeast(0.0)
                CtCard {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                if (strategy == PayoffStrategy.AVALANCHE) "AVALANCHE PLAN" else "SNOWBALL PLAN",
                                color = Ct.colors.muted, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                            )
                            if (((strategy == PayoffStrategy.AVALANCHE) == avalIsBest) && extra > 0) {
                                Text(
                                    "Recommended", color = Ct.colors.green, fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(999.dp))
                                        .background(Ct.colors.green.copy(alpha = 0.12f))
                                        .padding(horizontal = 8.dp, vertical = 3.dp),
                                )
                            }
                        }
                        Text(
                            "Debt-free by ${DateLogic.monthKeyLabel(DateLogic.monthKey(hero.payoffDate))}",
                            color = Ct.colors.text, fontSize = 22.sp, fontWeight = FontWeight.Bold,
                        )
                        Text(
                            buildString {
                                append("${hero.months} months · ${Money.fmt(hero.totalInterest)} interest")
                                if (saves > 0 && extra > 0) append(" · save ${Money.fmt(saves)} vs mins")
                            },
                            color = Ct.colors.muted, fontSize = 13.sp,
                        )
                        Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            chip("Snowball", strategy == PayoffStrategy.SNOWBALL) { strategy = PayoffStrategy.SNOWBALL }
                            chip("Avalanche", strategy == PayoffStrategy.AVALANCHE) { strategy = PayoffStrategy.AVALANCHE }
                        }
                    }
                }

                Row(
                    Modifier.height(IntrinsicSize.Min),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    simSnow?.let {
                        StrategyTile(
                            title = "Snowball",
                            subtitle = "Smallest first",
                            result = it,
                            selected = strategy == PayoffStrategy.SNOWBALL,
                            best = !avalIsBest && extra > 0,
                            modifier = Modifier.weight(1f).fillMaxHeight(),
                        ) { strategy = PayoffStrategy.SNOWBALL }
                    }
                    simAval?.let {
                        StrategyTile(
                            title = "Avalanche",
                            subtitle = "Highest APR",
                            result = it,
                            selected = strategy == PayoffStrategy.AVALANCHE,
                            best = avalIsBest && extra > 0,
                            modifier = Modifier.weight(1f).fillMaxHeight(),
                        ) { strategy = PayoffStrategy.AVALANCHE }
                    }
                }

                CtCard(padding = 0) {
                    Column {
                        Row(
                            Modifier.fillMaxWidth().padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                "ACCOUNTS · ${if (strategy == PayoffStrategy.AVALANCHE) "AVALANCHE" else "SNOWBALL"}",
                                color = Ct.colors.muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.weight(1f),
                            )
                            Text(
                                if (showCompare) "Hide compare" else "Compare both",
                                color = Ct.colors.accent, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.clickable { showCompare = !showCompare },
                            )
                        }
                        hero.cards.forEachIndexed { i, c ->
                            if (i > 0) HorizontalDivider(color = Ct.colors.border)
                            val src = data.activeCards.firstOrNull { it.id == c.id }
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            Text(c.name, color = Ct.colors.text, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                                            if (src != null && Payoff.isHousingLoan(src)) {
                                                Text(
                                                    "Estimate", color = Ct.colors.muted, fontSize = 10.sp, fontWeight = FontWeight.SemiBold,
                                                    modifier = Modifier
                                                        .clip(RoundedCornerShape(999.dp))
                                                        .background(Ct.colors.surface2)
                                                        .padding(horizontal = 6.dp, vertical = 2.dp),
                                                )
                                            }
                                        }
                                        Text("Started at ${Money.fmt(c.origBalance)}", color = Ct.colors.muted, fontSize = 11.sp)
                                    }
                                    Column(horizontalAlignment = Alignment.End) {
                                        Text(c.paidOffMonth?.let { "Month $it" } ?: "—", color = Ct.colors.text,
                                            fontSize = 13.sp, fontFamily = PlexMono)
                                        Text("${Money.fmtShort(c.interestPaid)} interest", color = Ct.colors.muted,
                                            fontSize = 10.sp, fontFamily = PlexMono)
                                    }
                                }
                                if (showCompare) {
                                    val snowMo = simSnow?.cards?.firstOrNull { it.id == c.id }?.paidOffMonth
                                    val avalMo = simAval?.cards?.firstOrNull { it.id == c.id }?.paidOffMonth
                                    Text(
                                        "Snowball: ${snowMo?.let { "$it mo" } ?: "—"} · Avalanche: ${avalMo?.let { "$it mo" } ?: "—"}",
                                        color = Ct.colors.muted, fontSize = 11.sp,
                                    )
                                }
                            }
                        }
                    }
                }
            }

            CalculatorTools(data.activeCards, includeMortgage)
        }
    }
}

@Composable
private fun StrategyTile(
    title: String,
    subtitle: String,
    result: PayoffResult,
    selected: Boolean,
    best: Boolean,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    CtCard(
        modifier
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            if (best) Text("Best for you", color = Ct.colors.green, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
            Text(title, color = Ct.colors.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Text(subtitle, color = Ct.colors.muted, fontSize = 11.sp)
            Text(
                DateLogic.monthKeyLabel(DateLogic.monthKey(result.payoffDate)),
                color = if (selected) Ct.colors.accent else Ct.colors.text,
                fontSize = 16.sp, fontWeight = FontWeight.SemiBold, fontFamily = PlexMono,
            )
            Text("${result.months} mo · ${Money.fmtShort(result.totalInterest)} interest", color = Ct.colors.muted, fontSize = 11.sp)
        }
    }
}

@Composable
private fun chip(label: String, selected: Boolean, onClick: () -> Unit) {
    FilterChip(selected = selected, onClick = onClick, label = { Text(label) })
}

private fun debtOf(c: Card): Double = if ((c.currentBalance ?: 0.0) > 0) c.currentBalance!! else c.balance

/* ════════ Tools ════════ */
@Composable
private fun CalculatorTools(cards: List<Card>, includeMortgage: Boolean) {
    Text("TOOLS", color = Ct.colors.muted, fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))

    CtCard {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Interest & payoff estimator", color = Ct.colors.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            var bal by remember { mutableStateOf("") }
            var apr by remember { mutableStateOf("") }
            var pay by remember { mutableStateOf("") }
            numInput(bal, "Balance ($)") { bal = it }
            numInput(apr, "APR (%)") { apr = it }
            numInput(pay, "Monthly payment ($)") { pay = it }
            val b = bal.toDoubleOrNull() ?: 0.0
            val r = (apr.toDoubleOrNull() ?: 0.0) / 100 / 12
            val p = pay.toDoubleOrNull() ?: 0.0
            HorizontalDivider(color = Ct.colors.border)
            statLine("Interest / month", Money.fmt(b * r))
            if (b > 0 && p > 0) {
                if (r > 0 && p <= b * r) {
                    Text("Payment doesn't cover the interest.", color = Ct.colors.red, fontSize = 12.sp)
                } else {
                    var bb = b; var m = 0; var total = 0.0
                    while (bb > 0.005 && m < 1200) { val i = bb * r; total += i; bb = bb + i - p; m++ }
                    statLine("Paid off in", "$m mo")
                    statLine("Total interest", Money.fmt(total))
                }
            }
        }
    }

    CtCard {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Payment splitter", color = Ct.colors.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Text("Covers minimums first, then attacks the highest APR.", color = Ct.colors.muted, fontSize = 12.sp)
            var avail by remember { mutableStateOf("") }
            numInput(avail, "Available this paycheck ($)") { avail = it }
            val plan = splitPlan(cards, avail.toDoubleOrNull() ?: 0.0, includeMortgage)
            if (plan.isEmpty()) {
                Text("Add a credit card or loan to use the splitter.", color = Ct.colors.muted, fontSize = 12.sp)
            } else {
                plan.forEach { (name, aprv, payv) ->
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(name, color = Ct.colors.text, fontSize = 13.sp, modifier = Modifier.weight(1f))
                        Text("${aprv.toInt()}%", color = Ct.colors.muted, fontSize = 11.sp)
                        Spacer(Modifier.width(10.dp))
                        Text(Money.fmt(payv), color = Ct.colors.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

private fun splitPlan(cards: List<Card>, avail: Double, includeMortgage: Boolean): List<Triple<String, Double, Double>> {
    data class Acc(val name: String, val apr: Double, val min: Double, val bal: Double, var pay: Double)
    val list = cards
        .filter { it.type == "card" || it.type == "loan" }
        .filter { includeMortgage || !Payoff.isHousingLoan(it) }
        .map { Acc(it.name, it.regularAPR, it.minPayment, debtOf(it), 0.0) }
        .filter { it.bal > 0 }
        .sortedByDescending { it.apr }
    var remaining = avail
    list.forEach { val m = minOf(it.min, it.bal, remaining); it.pay += m; remaining -= m }
    list.forEach { if (remaining > 0.005) { val e = minOf(it.bal - it.pay, remaining); it.pay += e; remaining -= e } }
    return list.map { Triple(it.name, it.apr, it.pay) }
}

@Composable
private fun numInput(value: String, label: String, onChange: (String) -> Unit) {
    OutlinedTextField(value, onChange, label = { Text(label) },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        singleLine = true, modifier = Modifier.fillMaxWidth())
}

@Composable
private fun statLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = Ct.colors.muted, fontSize = 12.sp, modifier = Modifier.weight(1f))
        Text(value, color = Ct.colors.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}
