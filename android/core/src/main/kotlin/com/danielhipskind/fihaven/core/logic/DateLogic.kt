package com.danielhipskind.fihaven.core.logic

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

/// Date / month-key helpers ported from utils.js + tz.js. Everything is
/// computed in the user's zone with whole-day differences (DST-safe).
object DateLogic {
    fun zone(tz: String?): ZoneId =
        if (tz.isNullOrEmpty() || tz == "auto") ZoneId.systemDefault()
        else runCatching { ZoneId.of(tz) }.getOrDefault(ZoneId.systemDefault())

    fun today(zone: ZoneId, now: Instant = Instant.now()): LocalDate =
        now.atZone(zone).toLocalDate()

    fun monthKey(date: LocalDate): String =
        "%04d-%02d".format(date.year, date.monthValue)

    fun currentMonthKey(zone: ZoneId, now: Instant = Instant.now()): String =
        monthKey(today(zone, now))

    /// Day-of-month within a given month's frame, rolling over out-of-range
    /// days like JS `new Date(y, m, dueDay)` (e.g. day 31 of a 30-day month
    /// becomes the 1st of the next month).
    private fun dateForDay(firstOfMonth: LocalDate, dueDay: Int): LocalDate =
        firstOfMonth.plusDays((dueDay - 1).toLong())

    fun daysUntilDue(dueDay: Int, zone: ZoneId, now: Instant = Instant.now()): Int {
        val today = today(zone, now)
        val firstThis = today.withDayOfMonth(1)
        val thisMonth = dateForDay(firstThis, dueDay)
        val diff = ChronoUnit.DAYS.between(today, thisMonth).toInt()
        if (diff < -1) {
            val nextMonth = dateForDay(firstThis.plusMonths(1), dueDay)
            return ChronoUnit.DAYS.between(today, nextMonth).toInt()
        }
        return diff
    }

    fun nextDueDate(dueDay: Int, zone: ZoneId, now: Instant = Instant.now()): LocalDate? {
        if (dueDay <= 0) return null
        val today = today(zone, now)
        val firstThis = today.withDayOfMonth(1)
        val thisMonth = dateForDay(firstThis, dueDay)
        return if (!thisMonth.isBefore(today)) thisMonth
        else dateForDay(firstThis.plusMonths(1), dueDay)
    }

    fun parseDate(s: String?): LocalDate? {
        if (s.isNullOrEmpty()) return null
        val head = s.substringBefore('T')
        val parts = head.split('-')
        if (parts.size >= 3) {
            val y = parts[0].toIntOrNull() ?: return null
            val m = parts[1].toIntOrNull() ?: return null
            val d = parts[2].take(2).toIntOrNull() ?: return null
            return runCatching { LocalDate.of(y, m, 1).plusDays((d - 1).toLong()) }.getOrNull()
        }
        return runCatching { LocalDate.parse(s) }.getOrNull()
    }

    fun monthsUntil(dateStr: String?, zone: ZoneId, now: Instant = Instant.now()): Int {
        val end = parseDate(dateStr) ?: return 0
        val today = today(zone, now)
        val months = (end.year - today.year) * 12 + (end.monthValue - today.monthValue)
        return maxOf(0, months)
    }

    fun monthKeyLabel(mk: String): String {
        val parts = mk.split('-')
        if (parts.size < 2) return ""
        val y = parts[0].toIntOrNull() ?: return ""
        val m = parts[1].toIntOrNull() ?: return ""
        return LocalDate.of(y, m, 1)
            .format(DateTimeFormatter.ofPattern("LLLL yyyy", Locale.US))
    }
}
