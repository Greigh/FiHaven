package app.fihaven.ui

import app.fihaven.ui.theme.PlexMono

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
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
import app.fihaven.AppViewModel
import app.fihaven.core.Money
import app.fihaven.core.logic.DateLogic
import app.fihaven.core.logic.Payoff
import app.fihaven.core.logic.PayoffResult
import app.fihaven.core.logic.PayoffStrategy
import app.fihaven.ui.theme.Ct
import app.fihaven.core.model.Card
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign

@Composable
fun PayoffScreen(vm: AppViewModel, padding: PaddingValues) {
    val data by vm.data.collectAsStateWithLifecycle()
    var strategy by remember { mutableStateOf(PayoffStrategy.AVALANCHE) }
    var extra by remember { mutableFloatStateOf(100f) }
    val result = Payoff.runPayoffSim(data.activeCards, strategy, extra.toDouble(), vm.zone())

    Column(
        Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)
            .verticalScroll(rememberScrollState()),
    ) {
        ScreenHeader("Payoff", branded = true)
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
                CtCard { Text("Add a card or loan with a balance to see a payoff plan.", color = Ct.colors.muted) }
            } else {
                // IntrinsicSize.Min + fillMaxHeight so both cards match the taller
                // one; only the left stat has a subtitle, which otherwise leaves
                // the right card short and the row visibly uneven.
                Row(
                    Modifier.height(IntrinsicSize.Min),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    stat("Debt-free in", "${result.months} mo", Ct.colors.accent,
                        DateLogic.monthKeyLabel(DateLogic.monthKey(result.payoffDate)),
                        Modifier.weight(1f).fillMaxHeight())
                    stat("Total interest", Money.fmtShort(result.totalInterest), Ct.colors.red, null,
                        Modifier.weight(1f).fillMaxHeight())
                }
                CtCard(padding = 0) {
                    Column {
                        Text("BY ACCOUNT", color = Ct.colors.muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
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

            CalculatorTools(data.activeCards)
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
    PayoffStrategy.NONE -> "Pay only the minimums on every card and loan."
    PayoffStrategy.SNOWBALL -> "Throw extra at the smallest balance first for quick wins."
    PayoffStrategy.AVALANCHE -> "Throw extra at the highest APR first to minimize interest."
}

/* ════════ Calculator tools ════════ */
@Composable
private fun CalculatorTools(cards: List<Card>) {
    Text("CALCULATOR TOOLS", color = Ct.colors.muted, fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))

    // Interest & payoff estimator
    CtCard {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Interest & payoff estimator", color = Ct.colors.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Text("Monthly interest on a balance, and how long to clear it at a fixed payment.",
                color = Ct.colors.muted, fontSize = 12.sp)
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

    // Payment splitter
    CtCard {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Payment splitter", color = Ct.colors.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Text("Covers minimums first, then attacks the highest APR.", color = Ct.colors.muted, fontSize = 12.sp)
            var avail by remember { mutableStateOf("") }
            numInput(avail, "Available this paycheck ($)") { avail = it }
            val plan = splitPlan(cards, avail.toDoubleOrNull() ?: 0.0)
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

    // Basic calculator (button state machine — no eval)
    CtCard {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Calculator", color = Ct.colors.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            var display by remember { mutableStateOf("0") }
            var acc by remember { mutableStateOf<Double?>(null) }
            var pending by remember { mutableStateOf<String?>(null) }
            var startNew by remember { mutableStateOf(false) }

            fun apply(a: Double, op: String, c: Double) = when (op) {
                "+" -> a + c; "−" -> a - c; "×" -> a * c; "÷" -> if (c == 0.0) 0.0 else a / c; else -> c
            }
            fun fmt(v: Double) = if (v == Math.floor(v) && !v.isInfinite() && Math.abs(v) < 1e15) v.toLong().toString()
                else (Math.round(v * 1e6) / 1e6).toString()
            fun key(k: String) {
                when (k) {
                    "C" -> { display = "0"; acc = null; pending = null; startNew = false }
                    "⌫" -> display = if (display.length > 1) display.dropLast(1) else "0"
                    "±" -> display = fmt(-(display.toDoubleOrNull() ?: 0.0))
                    "%" -> display = fmt((display.toDoubleOrNull() ?: 0.0) / 100)
                    "÷", "×", "−", "+" -> {
                        val v = display.toDoubleOrNull() ?: 0.0
                        if (acc != null && pending != null && !startNew) { val res = apply(acc!!, pending!!, v); acc = res; display = fmt(res) }
                        else acc = v
                        pending = k; startNew = true
                    }
                    "=" -> {
                        val a = acc; val p = pending
                        if (a != null && p != null) { display = fmt(apply(a, p, display.toDoubleOrNull() ?: 0.0)); acc = null; pending = null }
                        startNew = true
                    }
                    else -> {
                        if (startNew) { display = "0"; startNew = false }
                        display = if (k == ".") { if (!display.contains(".")) "$display." else display }
                            else if (display == "0") k else display + k
                    }
                }
            }

            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Ct.colors.surface2).padding(12.dp)) {
                Text(display, color = Ct.colors.text, fontSize = 24.sp, fontWeight = FontWeight.SemiBold,
                    fontFamily = PlexMono, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.End, maxLines = 1)
            }
            listOf(
                listOf("C", "⌫", "%", "÷"),
                listOf("7", "8", "9", "×"),
                listOf("4", "5", "6", "−"),
                listOf("1", "2", "3", "+"),
                listOf("±", "0", ".", "="),
            ).forEach { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    row.forEach { k -> CalcBtn(k, Modifier.weight(1f)) { key(k) } }
                }
            }
        }
    }
}

private fun splitPlan(cards: List<Card>, avail: Double): List<Triple<String, Double, Double>> {
    data class Acc(val name: String, val apr: Double, val min: Double, val bal: Double, var pay: Double)
    val list = cards
        .filter { it.type == "card" || it.type == "loan" }
        .map { Acc(it.name, it.regularAPR, it.minPayment, if ((it.currentBalance ?: 0.0) > 0) it.currentBalance!! else it.balance, 0.0) }
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

@Composable
private fun CalcBtn(label: String, modifier: Modifier, onClick: () -> Unit) {
    val isOp = label in listOf("÷", "×", "−", "+", "=")
    Box(
        modifier.height(48.dp).clip(RoundedCornerShape(10.dp))
            .background(if (isOp) Ct.colors.accentBg else Ct.colors.surface2)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = if (isOp) Ct.colors.accent else Ct.colors.text, fontSize = 18.sp, fontWeight = FontWeight.Medium)
    }
}
