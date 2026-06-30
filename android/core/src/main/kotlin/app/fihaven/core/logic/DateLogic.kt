package app.fihaven.core.logic

import app.fihaven.core.model.Bill
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

    fun effectiveDaysUntilDue(
        dueDay: Int,
        fullyPaid: Boolean,
        zone: ZoneId,
        now: Instant = Instant.now(),
    ): Int {
        if (dueDay <= 0) return 9999
        if (fullyPaid) {
            val today = today(zone, now)
            val firstThis = today.withDayOfMonth(1)
            val thisMonth = dateForDay(firstThis, dueDay)
            val target = if (thisMonth.isAfter(today)) thisMonth
            else dateForDay(firstThis.plusMonths(1), dueDay)
            return ChronoUnit.DAYS.between(today, target).toInt()
        }
        return daysUntilDue(dueDay, zone, now)
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

    /// A date as "YYYY-MM-DD" — compared against a bill's start/end dates
    /// with a plain lexicographic comparison.
    fun ymd(date: LocalDate): String =
        "%04d-%02d-%02d".format(date.year, date.monthValue, date.dayOfMonth)

    // A bill's optional active window (bills-only feature). "First bill due
    // on" (startDate) gates when it begins; "Stops on" (endDate) retires it.
    // An out-of-window bill is excluded from due/overdue, totals, the
    // calendar, and reminders (it still shows in the list with a badge).
    fun billNotStarted(bill: Bill, ymd: String): Boolean {
        val s = bill.startDate
        return !s.isNullOrEmpty() && ymd < s
    }
    fun billEnded(bill: Bill, ymd: String): Boolean {
        val e = bill.endDate
        return !e.isNullOrEmpty() && ymd > e
    }
    fun billActive(bill: Bill, ymd: String): Boolean =
        !billNotStarted(bill, ymd) && !billEnded(bill, ymd)

    fun billNotStarted(bill: Bill, zone: ZoneId, now: Instant = Instant.now()): Boolean =
        billNotStarted(bill, ymd(today(zone, now)))
    fun billEnded(bill: Bill, zone: ZoneId, now: Instant = Instant.now()): Boolean =
        billEnded(bill, ymd(today(zone, now)))
    fun billActive(bill: Bill, zone: ZoneId, now: Instant = Instant.now()): Boolean =
        billActive(bill, ymd(today(zone, now)))

    /** True if a bill's active window overlaps a budgeting period. */
    fun billInPeriod(bill: Bill, bounds: PeriodBounds): Boolean {
        val lastDay = bounds.end.minusDays(1)
        return !billEnded(bill, ymd(bounds.start)) && !billNotStarted(bill, ymd(lastDay))
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
