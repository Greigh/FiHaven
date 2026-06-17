package app.fihaven.core.logic

import app.fihaven.core.model.Payment
import app.fihaven.core.model.periodAnchor
import app.fihaven.core.model.periodLength
import app.fihaven.core.model.periodMode
import app.fihaven.core.model.periodStartDay
import kotlinx.serialization.json.JsonObject
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

/// The user's budgeting "period". Mirrors period.js / Period.swift.
/// - calendar : the calendar month. key "YYYY-MM" (legacy behavior).
/// - startDay : a month-length period beginning on day N.
/// - rolling  : fixed consecutive K-day buckets anchored at an epoch.
/// Paid/owed is matched by whether a payment's `date` falls in the period's
/// [start, end) — lexical compare of "YYYY-MM-DD" — so no data migration.
data class PeriodConfig(
    val mode: String,
    val startDay: Int,
    val length: Int,
    val anchor: String? = null, // "YYYY-MM-DD" rolling start; null = epoch
) {
    companion object {
        private val ANCHOR_RE = Regex("""^\d{4}-\d{2}-\d{2}$""")
        fun normalized(mode: String?, startDay: Int?, length: Int?, anchor: String? = null) = PeriodConfig(
            mode = if (mode == "startDay" || mode == "rolling") mode else "calendar",
            startDay = (startDay ?: 1).coerceIn(1, 28),
            length = (length ?: 35).coerceIn(7, 90),
            anchor = anchor?.takeIf { ANCHOR_RE.matches(it) },
        )
    }
}

data class PeriodBounds(
    val startKey: String,   // "YYYY-MM-DD" inclusive
    val endKey: String,     // "YYYY-MM-DD" exclusive
    val key: String,        // period key (calendar: "YYYY-MM", else start date)
    val start: LocalDate,
    val end: LocalDate,
    val mode: String,
) {
    fun contains(p: Payment): Boolean =
        if (p.date.isNotEmpty()) p.date >= startKey && p.date < endKey
        else mode == "calendar" && p.monthKey == key
}

object Period {
    private val ROLL_EPOCH: LocalDate = LocalDate.of(2020, 1, 1)
    private fun iso(d: LocalDate) = "%04d-%02d-%02d".format(d.year, d.monthValue, d.dayOfMonth)

    fun config(settings: JsonObject): PeriodConfig =
        PeriodConfig.normalized(settings.periodMode, settings.periodStartDay, settings.periodLength,
            settings.periodAnchor)

    fun bounds(date: LocalDate, cfg: PeriodConfig): PeriodBounds = when (cfg.mode) {
        "startDay" -> {
            val candidate = date.withDayOfMonth(cfg.startDay)
            val start = if (date.isBefore(candidate)) date.minusMonths(1).withDayOfMonth(cfg.startDay) else candidate
            val end = start.plusMonths(1)
            PeriodBounds(iso(start), iso(end), iso(start), start, end, cfg.mode)
        }
        "rolling" -> {
            val len = cfg.length.toLong()
            val epoch = cfg.anchor?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: ROLL_EPOCH
            val daysSince = ChronoUnit.DAYS.between(epoch, date)
            val idx = Math.floorDiv(daysSince, len)
            val start = epoch.plusDays(idx * len)
            val end = start.plusDays(len)
            PeriodBounds(iso(start), iso(end), iso(start), start, end, cfg.mode)
        }
        else -> {
            val start = date.withDayOfMonth(1)
            val end = start.plusMonths(1)
            PeriodBounds(iso(start), iso(end), DateLogic.monthKey(start), start, end, "calendar")
        }
    }

    fun currentBounds(cfg: PeriodConfig, zone: ZoneId): PeriodBounds =
        bounds(DateLogic.today(zone), cfg)

    fun currentKey(cfg: PeriodConfig, zone: ZoneId): String = currentBounds(cfg, zone).key

    fun boundsForKey(key: String, cfg: PeriodConfig): PeriodBounds {
        val parts = key.split('-').mapNotNull { it.toIntOrNull() }
        val date = when {
            parts.size >= 3 -> runCatching { LocalDate.of(parts[0], parts[1], 1).plusDays((parts[2] - 1).toLong()) }
                .getOrDefault(LocalDate.now())
            parts.size == 2 -> LocalDate.of(parts[0], parts[1], 1)
            else -> LocalDate.now()
        }
        return bounds(date, cfg)
    }

    fun shift(b: PeriodBounds, offset: Int, cfg: PeriodConfig): PeriodBounds {
        if (offset == 0) return b
        val pivot = if (cfg.mode == "rolling") b.start.plusDays(offset.toLong() * cfg.length)
        else b.start.plusMonths(offset.toLong())
        return bounds(pivot, cfg)
    }

    fun keyForPayment(p: Payment, cfg: PeriodConfig): String {
        val d = DateLogic.parseDate(p.date)
        return if (d != null) bounds(d, cfg).key else p.monthKey
    }

    fun label(b: PeriodBounds, cfg: PeriodConfig): String {
        if (cfg.mode == "calendar") return DateLogic.monthKeyLabel(b.key)
        val last = b.end.minusDays(1)
        val startFmt = DateTimeFormatter.ofPattern("MMM d", Locale.US)
        val lastFmt = DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.US)
        return "${b.start.format(startFmt)} – ${last.format(lastFmt)}"
    }

    fun labelForKey(key: String, cfg: PeriodConfig): String = label(boundsForKey(key, cfg), cfg)
}
