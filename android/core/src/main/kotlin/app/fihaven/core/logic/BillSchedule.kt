package app.fihaven.core.logic

import app.fihaven.core.model.Bill
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/** When a bill is actually due, honoring its frequency label. Cards stay monthly-on-dueDay. */
object BillSchedule {
    private data class Spec(val unit: String, val step: Int)

    private const val MAX_LOOKAHEAD = 400

    private fun frequencySpec(frequency: String): Spec = when (frequency) {
        "Weekly" -> Spec("day", 7)
        "Bi-weekly" -> Spec("day", 14)
        "Quarterly" -> Spec("month", 3)
        "Annually" -> Spec("month", 12)
        else -> Spec("month", 1)
    }

    /** Billing-cycle noun for labels like "Paid this quarter". Cards are always monthly. */
    fun periodNoun(frequency: String): String = when (frequency) {
        "Weekly" -> "week"
        "Bi-weekly" -> "cycle"
        "Quarterly" -> "quarter"
        "Annually" -> "year"
        else -> "month"
    }

    fun anchor(bill: Bill, zone: ZoneId, now: java.time.Instant = java.time.Instant.now()): LocalDate {
        bill.startDate?.takeIf { it.isNotEmpty() }?.let { DateLogic.parseDate(it) }?.let { return it }
        val dd = bill.dueDay ?: 1
        val t = DateLogic.today(zone, now)
        return LocalDate.of(t.year, 1, 1).plusDays((dd - 1).toLong())
    }

    fun dueOn(bill: Bill, date: LocalDate, zone: ZoneId): Boolean {
        if (bill.dueDay == null && bill.startDate.isNullOrEmpty()) return false
        if (!DateLogic.billActive(bill, DateLogic.ymd(date))) return false

        val spec = frequencySpec(bill.frequency)
        val a = anchor(bill, zone)

        if (spec.unit == "day") {
            val days = ChronoUnit.DAYS.between(a, date)
            return days >= 0 && days % spec.step == 0L
        }

        val dueDay = bill.dueDay ?: a.dayOfMonth
        val dueThisMonth = date.withDayOfMonth(1).plusDays((dueDay - 1).toLong())
        if (DateLogic.ymd(dueThisMonth) != DateLogic.ymd(date)) return false
        val monthsDiff = (date.year - a.year) * 12 + (date.monthValue - a.monthValue)
        return monthsDiff >= 0 && monthsDiff % spec.step == 0
    }

    fun nextDueDate(bill: Bill, zone: ZoneId, from: LocalDate = DateLogic.today(zone)): LocalDate? {
        if (bill.dueDay == null && bill.startDate.isNullOrEmpty()) return null
        var cursor = from
        bill.startDate?.let { DateLogic.parseDate(it) }?.let { start ->
            if (cursor.isBefore(start)) cursor = start
        }
        repeat(MAX_LOOKAHEAD + 1) {
            if (dueOn(bill, cursor, zone)) return cursor
            cursor = cursor.plusDays(1)
        }
        return null
    }

    fun daysUntilDue(bill: Bill, zone: ZoneId, now: java.time.Instant = java.time.Instant.now()): Int {
        val next = nextDueDate(bill, zone, DateLogic.today(zone, now)) ?: return 9999
        return ChronoUnit.DAYS.between(DateLogic.today(zone, now), next).toInt()
    }

    fun effectiveDaysUntilDue(
        bill: Bill,
        fullyPaid: Boolean,
        zone: ZoneId,
        now: java.time.Instant = java.time.Instant.now(),
    ): Int {
        if (fullyPaid) {
            val next = nextDueDate(bill, zone, DateLogic.today(zone, now)) ?: return 9999
            return ChronoUnit.DAYS.between(DateLogic.today(zone, now), next).toInt()
        }
        return daysUntilDue(bill, zone, now)
    }

    fun dueInPeriod(bill: Bill, bounds: PeriodBounds, zone: ZoneId): Boolean {
        var d = bounds.start
        while (d.isBefore(bounds.end)) {
            if (dueOn(bill, d, zone)) return true
            d = d.plusDays(1)
        }
        return false
    }

    fun dueOnOrBeforeInPeriod(
        bill: Bill,
        bounds: PeriodBounds,
        zone: ZoneId,
        asOf: LocalDate = DateLogic.today(zone),
    ): LocalDate? {
        var d = bounds.start
        var last: LocalDate? = null
        while (d.isBefore(bounds.end)) {
            if (dueOn(bill, d, zone) && !d.isAfter(asOf)) last = d
            d = d.plusDays(1)
        }
        return last
    }
}
