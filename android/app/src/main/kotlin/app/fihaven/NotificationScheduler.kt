package app.fihaven

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import app.fihaven.core.Money
import app.fihaven.core.logic.BillSchedule
import app.fihaven.core.logic.DateLogic
import app.fihaven.core.model.Bill
import app.fihaven.core.model.localNotifications
import app.fihaven.core.model.notifyHour
import app.fihaven.core.model.reminderLeadDays
import app.fihaven.core.model.remindOnDueDay
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.put
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Schedules on-device bill-due reminders from synced data. There's no server
 * push: each device mirrors the user's reminder settings as local
 * notifications (AlarmManager → [BillReminderReceiver]), so they fire even
 * offline. We reschedule whenever the data or settings change (AppViewModel).
 *
 * AlarmManager alarms don't survive a reboot, so we persist the full schedule
 * (fire time + copy) to SharedPreferences and re-arm it from [BootReceiver] on
 * BOOT_COMPLETED — no app launch or network needed.
 */
object NotificationScheduler {
    const val CHANNEL_ID = "bill-reminders"
    private const val PREFS = "fihaven_notifications"
    private const val KEY_SCHEDULE = "schedule"
    private const val MAX = 60 // keep the pending-alarm count bounded

    /** A single scheduled reminder, persisted so a reboot can replay it. */
    private data class Scheduled(val code: Int, val at: Long, val title: String, val body: String)

    fun ensureChannel(context: Context) {
        val mgr = context.getSystemService(NotificationManager::class.java) ?: return
        if (mgr.getNotificationChannel(CHANNEL_ID) == null) {
            mgr.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Bill reminders", NotificationManager.IMPORTANCE_DEFAULT)
                    .apply { description = "Reminders before your bills are due." }
            )
        }
    }

    /** Cancel existing reminders and reschedule from the current bills. */
    fun reschedule(context: Context, bills: List<Bill>, settings: JsonObject, zone: ZoneId) {
        val am = context.getSystemService(AlarmManager::class.java) ?: return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

        // Cancel everything we previously scheduled (PendingIntent matching
        // ignores extras, so the request code alone is enough).
        readSchedule(prefs).forEach { am.cancel(pendingIntent(context, it.code)) }
        prefs.edit().remove(KEY_SCHEDULE).apply()

        if (!settings.localNotifications) return
        ensureChannel(context)

        val lead = settings.reminderLeadDays
        val hour = settings.notifyHour
        val offsets = (if (settings.remindOnDueDay) setOf(lead, 0) else setOf(lead)).sortedDescending()
        val now = ZonedDateTime.now(zone)

        // Soonest-due first so a long list still gets the most relevant
        // reminders within the alarm budget.
        val upcoming = bills.mapNotNull { b -> BillSchedule.nextDueDate(b, zone)?.let { b to it } }
            .sortedBy { it.second }

        val scheduled = mutableListOf<Scheduled>()
        for ((bill, due) in upcoming) {
            if (scheduled.size >= MAX) break
            for (off in offsets) {
                if (scheduled.size >= MAX) break
                val fire = due.minusDays(off.toLong()).atStartOfDay(zone).withHour(hour)
                if (!fire.isAfter(now)) continue
                scheduled.add(
                    Scheduled(bill.id * 31 + off, fire.toInstant().toEpochMilli(), "Bill reminder", bodyFor(bill, off))
                )
            }
        }
        scheduleTrials(bills, settings, zone, scheduled)
        scheduled.forEach { arm(am, context, it) }
        writeSchedule(prefs, scheduled)
    }

    private fun trialEndDate(bill: Bill, zone: ZoneId): ZonedDateTime? {
        val raw = bill.trialEnds ?: return null
        if (!raw.matches(Regex("""^\d{4}-\d{2}-\d{2}$"""))) return null
        return DateLogic.parseDate(raw)?.atStartOfDay(zone)
    }

    private fun scheduleTrials(
        bills: List<Bill>,
        settings: JsonObject,
        zone: ZoneId,
        scheduled: MutableList<Scheduled>,
    ) {
        val lead = settings.reminderLeadDays
        val hour = settings.notifyHour
        val offsets = (if (settings.remindOnDueDay) setOf(lead, 0) else setOf(lead)).sortedDescending()
        val now = ZonedDateTime.now(zone)
        val upcoming = bills.mapNotNull { b -> trialEndDate(b, zone)?.let { b to it } }.sortedBy { it.second }
        for ((bill, end) in upcoming) {
            if (scheduled.size >= MAX) break
            for (off in offsets) {
                if (scheduled.size >= MAX) break
                val fire = end.minusDays(off.toLong()).withHour(hour).withMinute(0)
                if (!fire.isAfter(now)) continue
                scheduled.add(
                    Scheduled(bill.id * 37 + off + 10000, fire.toInstant().toEpochMilli(),
                        "Trial ending soon", trialBodyFor(bill, off))
                )
            }
        }
    }

    private fun trialBodyFor(bill: Bill, off: Int): String {
        val phrase = when {
            off <= 0 -> "ends today"
            off == 1 -> "ends tomorrow"
            else -> "ends in $off days"
        }
        val name = bill.name.ifBlank { "A subscription" }
        return "$name free trial $phrase."
    }

    /** Re-arm the persisted schedule after a reboot (drops past-due entries). */
    fun rescheduleFromSaved(context: Context) {
        val am = context.getSystemService(AlarmManager::class.java) ?: return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        val kept = readSchedule(prefs).filter { it.at > now }
        if (kept.isEmpty()) {
            prefs.edit().remove(KEY_SCHEDULE).apply()
            return
        }
        ensureChannel(context)
        kept.forEach { arm(am, context, it) }
        writeSchedule(prefs, kept)
    }

    private fun arm(am: AlarmManager, context: Context, s: Scheduled) {
        am.setAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP, s.at, pendingIntent(context, s.code, s.title, s.body)
        )
    }

    private fun readSchedule(prefs: SharedPreferences): List<Scheduled> {
        val raw = prefs.getString(KEY_SCHEDULE, null) ?: return emptyList()
        return runCatching {
            (Json.parseToJsonElement(raw) as JsonArray).map {
                val o = it.jsonObject
                Scheduled(
                    o["code"]!!.jsonPrimitive.int,
                    o["at"]!!.jsonPrimitive.long,
                    o["title"]!!.jsonPrimitive.content,
                    o["body"]!!.jsonPrimitive.content,
                )
            }
        }.getOrDefault(emptyList())
    }

    private fun writeSchedule(prefs: SharedPreferences, list: List<Scheduled>) {
        val arr = buildJsonArray {
            list.forEach { s ->
                add(buildJsonObject {
                    put("code", s.code); put("at", s.at); put("title", s.title); put("body", s.body)
                })
            }
        }
        prefs.edit().putString(KEY_SCHEDULE, arr.toString()).apply()
    }

    private fun bodyFor(bill: Bill, off: Int): String {
        val phrase = when {
            off <= 0 -> "is due today"
            off == 1 -> "is due tomorrow"
            else -> "is due in $off days"
        }
        val name = bill.name.ifBlank { "A bill" }
        return "$name $phrase — ${Money.fmt(bill.amount)}."
    }

    private fun pendingIntent(
        context: Context,
        code: Int,
        title: String? = null,
        body: String? = null,
    ): PendingIntent {
        // Use the explicit (Context, Class) constructor so the destination
        // component is fixed at creation — CodeQL's implicit-PendingIntent
        // check doesn't track an apply-block `component =` setter.
        val intent = Intent(context, BillReminderReceiver::class.java).apply {
            putExtra("code", code)
            title?.let { putExtra("title", it) }
            body?.let { putExtra("body", it) }
        }
        return PendingIntent.getBroadcast(
            context, code, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}
