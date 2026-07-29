package app.fihaven.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.fihaven.core.logic.CashflowHistory
import app.fihaven.ui.theme.Ct
import java.time.YearMonth
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.pow

/**
 * Income vs. merged spending over time — two lines on one axis, oldest → newest.
 * Mirrors the web `CashflowChart.svelte` and iOS `CashflowChartView.swift`.
 *
 * Deliberately TWO lines rather than one net line: a single net series collapses
 * "earned more" and "spent less" into identical upward movement, and those are very
 * different facts about a month. The band between the lines carries the net visually.
 *
 * The y-axis IS zero-based here — unusual for a trend line, but the reader's job is
 * the GAP between the series, and cropping the axis would inflate that gap out of
 * proportion to the money it represents.
 *
 * Months we can't account for BREAK the spending line rather than plotting a zero.
 * Dashing a line down to the axis still draws a number we don't have; a gap plus a
 * shaded column says "no data" and means it.
 */

/** Round the axis ceiling up to a readable step. Deliberately fine-grained — a
 *  coarse 1/2/5/10 ladder strands a $7.3k series under a $10k ceiling. */
private val NICE_STEPS = listOf(1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0)

internal fun niceMax(v: Double): Double {
    if (v <= 0) return 1.0
    val mag = 10.0.pow(floor(log10(v)))
    val n = v / mag
    return (NICE_STEPS.firstOrNull { n <= it + 1e-9 } ?: 10.0) * mag
}

/** Runs of consecutive months whose spending we can actually account for. */
internal fun accountedRuns(rows: List<CashflowHistory.Row>): List<List<Int>> {
    val out = mutableListOf<List<Int>>()
    var cur = mutableListOf<Int>()
    rows.forEachIndexed { i, r ->
        if (r.blind) {
            if (cur.isNotEmpty()) out.add(cur)
            cur = mutableListOf()
        } else {
            cur.add(i)
        }
    }
    if (cur.isNotEmpty()) out.add(cur)
    return out
}

private fun axisLabel(v: Double): String = when {
    v >= 1000 -> "$" + (if (v % 1000 == 0.0) "%.0f".format(v / 1000) else "%.1f".format(v / 1000)) + "k"
    else -> "$" + "%.0f".format(v)
}

private fun monthLabel(mk: String): String = runCatching {
    YearMonth.parse(mk).month.getDisplayName(TextStyle.SHORT, Locale.getDefault())
}.getOrDefault(mk)

@Composable
fun CashflowChart(rows: List<CashflowHistory.Row>, modifier: Modifier = Modifier) {
    if (rows.isEmpty()) return
    val colors = Ct.colors
    val maxY = niceMax(max(1.0, rows.maxOf { max(it.income, it.spending) }) * 1.05)
    val runs = accountedRuns(rows)
    val gridSteps = listOf(0.0, 0.25, 0.5, 0.75, 1.0)

    Column(modifier) {
        // Legend: always present for two series, so identity is never carried by
        // color alone.
        Row(
            Modifier.fillMaxWidth().padding(bottom = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            LegendKey(colors.chartIncome, "Income")
            LegendKey(colors.chartSpend, "Spending")
            if (rows.any { it.blind }) {
                LegendKey(colors.muted.copy(alpha = 0.22f), "Not recorded", muted = true)
            }
        }

        // Axis labels are drawn INSIDE the Canvas, not as sibling composables:
        // laid out separately they anchor to their own slots and drift away from
        // the gridlines and data points they label.
        Canvas(Modifier.fillMaxWidth().height(190.dp)) {
            drawCashflow(
                rows = rows,
                runs = runs,
                maxY = maxY,
                gridSteps = gridSteps,
                grid = colors.border,
                band = colors.chartIncome.copy(alpha = 0.10f),
                blindCol = colors.muted.copy(alpha = 0.12f),
                incomeColor = colors.chartIncome,
                spendColor = colors.chartSpend,
                labelColor = colors.muted,
                labelPx = 10.sp.toPx(),
            )
        }
    }
}

@Composable
private fun LegendKey(color: Color, label: String, muted: Boolean = false) {
    Row(verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        Spacer(Modifier.size(10.dp).clip(RoundedCornerShape(2.dp)).background(color))
        Text(
            label,
            color = if (muted) Ct.colors.muted else Ct.colors.text,
            fontSize = 11.sp,
            fontWeight = if (muted) FontWeight.Normal else FontWeight.SemiBold,
        )
    }
}

private fun DrawScope.drawCashflow(
    rows: List<CashflowHistory.Row>,
    runs: List<List<Int>>,
    maxY: Double,
    gridSteps: List<Double>,
    grid: Color,
    band: Color,
    blindCol: Color,
    incomeColor: Color,
    spendColor: Color,
    labelColor: Color,
    labelPx: Float,
) {
    val n = rows.size
    val padL = labelPx * 4.4f      // room for "$10.5k"
    val padT = labelPx
    val padB = labelPx * 2.2f      // room for the month row
    val w = size.width
    val h = size.height
    val plotW = max(40f, w - padL)
    val plotH = max(40f, h - padT - padB)

    fun xAt(i: Int) = if (n <= 1) padL + plotW / 2f else padL + (i.toFloat() * plotW) / (n - 1).toFloat()
    fun yAt(v: Double) = padT + plotH - (max(0.0, v) / maxY).toFloat() * plotH

    val textPaint = android.graphics.Paint().apply {
        isAntiAlias = true
        color = labelColor.toArgb()
        textSize = labelPx
    }

    // Shaded columns for months with no usable spending figure.
    val half = if (n > 1) (plotW / (n - 1)) / 2f else plotW / 2f
    rows.forEachIndexed { i, r ->
        if (r.blind) {
            val x = max(padL, xAt(i) - half)
            drawRect(blindCol, topLeft = Offset(x, padT),
                size = Size(minOf(half * 2f, w - x), plotH))
        }
    }

    gridSteps.forEach { f ->
        val y = padT + plotH - (f.toFloat() * plotH)
        drawLine(grid, Offset(padL, y), Offset(w, y), strokeWidth = 1f)
        textPaint.textAlign = android.graphics.Paint.Align.RIGHT
        drawContext.canvas.nativeCanvas.drawText(
            axisLabel(maxY * f), padL - labelPx * 0.6f, y + labelPx * 0.35f, textPaint,
        )
    }

    // Thin the month labels to whatever fits: ~64px each.
    val every = max(1, ceil(n / max(2.0, floor((plotW / (labelPx * 5.5f)).toDouble()))).toInt())
    textPaint.textAlign = android.graphics.Paint.Align.CENTER
    rows.forEachIndexed { i, r ->
        if (i % every == 0 || i == n - 1) {
            drawContext.canvas.nativeCanvas.drawText(
                monthLabel(r.mk), xAt(i), h - labelPx * 0.5f, textPaint,
            )
        }
    }

    // Band between the series, one shape per run so it never spans a gap.
    runs.filter { it.size > 1 }.forEach { run ->
        val p = Path()
        p.moveTo(xAt(run.first()), yAt(rows[run.first()].income))
        run.drop(1).forEach { p.lineTo(xAt(it), yAt(rows[it].income)) }
        run.reversed().forEach { p.lineTo(xAt(it), yAt(rows[it].spending)) }
        p.close()
        drawPath(p, band)
    }

    // Spending: solid within each run, broken across gaps.
    runs.forEach { run ->
        if (run.size > 1) {
            val p = Path()
            p.moveTo(xAt(run.first()), yAt(rows[run.first()].spending))
            run.drop(1).forEach { p.lineTo(xAt(it), yAt(rows[it].spending)) }
            drawPath(p, spendColor, style = Stroke(width = 4f))
        } else {
            // A run of one has no segment to draw — mark it.
            val i = run.first()
            drawCircle(spendColor, radius = 4f, center = Offset(xAt(i), yAt(rows[i].spending)))
        }
    }

    // Income is known for every month (it's projected from settings), so that
    // line stays continuous.
    if (n > 1) {
        val p = Path()
        p.moveTo(xAt(0), yAt(rows[0].income))
        (1 until n).forEach { p.lineTo(xAt(it), yAt(rows[it].income)) }
        drawPath(p, incomeColor, style = Stroke(width = 4f))
    } else {
        drawCircle(incomeColor, radius = 4f, center = Offset(xAt(0), yAt(rows[0].income)))
    }
}
