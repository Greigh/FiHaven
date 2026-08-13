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
import app.fihaven.core.logic.Period
import app.fihaven.core.logic.PeriodConfig
import app.fihaven.core.logic.Schedule
import app.fihaven.core.model.Bill
import app.fihaven.core.model.Card
import app.fihaven.core.model.Payment
import app.fihaven.core.model.billReminders
import app.fihaven.core.model.localNotifications
import app.fihaven.core.model.notifyHour
import app.fihaven.core.model.offerReminders
import app.fihaven.core.model.pushNotifications
import app.fihaven.core.model.reminderOffsets
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
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Schedules on-device bill-due reminders from synced data (AlarmManager →
 * [BillReminderReceiver]), so they fire even offline. We reschedule whenever
 * the data or settings change (AppViewModel).
 *
 * The server also pushes these reminders over FCM. Local and push are separate
 * user toggles, and when both are on the same event would arrive twice — so a
 * category the server will push is *not* scheduled locally, leaving local as
 * the offline fallback for whatever push doesn't cover. The suppression gates
 * mirror server/scheduler.js exactly; see [reschedule].
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

    /**
     * Cancel existing reminders and reschedule from the current bills + cards.
     *
     * [pro] is the server-derived entitlement, needed because the server only
     * pushes offer reminders to Pro users — a free user with offers + push on
     * gets nothing from the server, so we must still schedule those locally.
     */
    fun reschedule(
        context: Context,
        bills: List<Bill>,
        cards: List<Card>,
        settings: JsonObject,
        zone: ZoneId,
        pro: Boolean,
        payments: List<Payment> = emptyList(),
    ) {
        val am = context.getSystemService(AlarmManager::class.java) ?: return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

        // Cancel everything we previously scheduled (PendingIntent matching
        // ignores extras, so the request code alone is enough).
        readSchedule(prefs).forEach { am.cancel(pendingIntent(context, it.code)) }
        prefs.edit().remove(KEY_SCHEDULE).apply()

        // Before the localNotifications gate, not after. The channel also backs
        // SERVER push: a backgrounded FCM notification payload is drawn by the
        // system against the manifest's default_notification_channel_id, and if
        // that channel doesn't exist yet FCM silently substitutes its own
        // "Miscellaneous" one. Creating it only for local reminders left every
        // push-on/reminders-off user's notifications in a channel the app never
        // named and the user can't recognise. It's idempotent and cheap.
        ensureChannel(context)
        if (!settings.localNotifications) return

        // Categories the server will push for this user, which we therefore skip
        // locally to avoid a duplicate. These mirror server/scheduler.js: the
        // bill and trial pushes both sit inside `billReminders`, and the offer
        // push additionally requires Pro. Anything the server won't send still
        // gets scheduled here, so no category can end up silent.
        //
        // [PushRegistrar.healthy] is the safety net: if push looks broken we
        // schedule everything locally and accept the risk of a duplicate over
        // the risk of no reminder at all.
        val push = settings.pushNotifications && PushRegistrar.healthy(context)
        val pushCoversBills = push && settings.billReminders
        val pushCoversOffers = push && settings.offerReminders && pro

        val hour = settings.notifyHour
        // One alarm per reminder day the user picked, longest lead first.
        val offsets = settings.reminderOffsets
        val now = ZonedDateTime.now(zone)

        val scheduled = mutableListOf<Scheduled>()
        if (!pushCoversBills) {
            // Soonest-due first so a long list still gets the most relevant
            // reminders within the alarm budget.
            val upcoming = bills.mapNotNull { b -> BillSchedule.nextDueDate(b, zone)?.let { b to it } }
                .sortedBy { it.second }

            val periodCfg = Period.config(settings)
            for ((bill, due) in upcoming) {
                if (scheduled.size >= MAX) break
                // Already handled for the cycle it's about to hit — reminding
                // anyway is the noise that teaches people to ignore these.
                if (settled(bill, due, payments, periodCfg)) continue
                for (off in offsets) {
                    if (scheduled.size >= MAX) break
                    val fire = due.minusDays(off.toLong()).atStartOfDay(zone).withHour(hour)
                    if (!fire.isAfter(now)) continue
                    scheduled.add(
                        Scheduled(bill.id.hashCode() * 31 + off, fire.toInstant().toEpochMilli(), "Bill reminder", bodyFor(bill, off))
                    )
                }
            }
            scheduleTrials(bills, settings, zone, scheduled)
        }
        if (!pushCoversOffers) scheduleOffers(cards, settings, zone, scheduled)
        scheduled.forEach { arm(am, context, it) }
        writeSchedule(prefs, scheduled)
    }

    /**
     * True when [bill]'s cycle around [due] is already settled — skipped, or
     * paid up to its full amount — so no reminder is warranted.
     *
     * Measured over the period containing the DUE date, not today's: at a
     * 7-day lead the due date can sit in the next period, and matching on the
     * current one would read the last cycle's payment and silence a reminder
     * that should fire.
     *
     * A PARTIAL payment still reminds — money is still owed. The `paid > 0`
     * gate covers a bill with no amount set: its goal is 0, which `paid >=
     * goal` satisfies with no payment at all, so without it every amount-less
     * bill would go silent forever (the zero-goal trap [Schedule.needsAmount]
     * guards against in the UI). Mirrors billSettledForDue in
     * server/scheduler.js.
     */
    private fun settled(
        bill: Bill,
        due: LocalDate,
        payments: List<Payment>,
        cfg: PeriodConfig,
    ): Boolean {
        if (payments.isEmpty()) return false
        val ref = bill.id.toString()
        val bounds = Period.bounds(due, cfg)
        if (Schedule.isSkipped(payments, "bill", ref, bounds)) return true
        val paid = Schedule.paidAmount(payments, "bill", ref, bounds)
        if (paid <= 0.0) return false
        return paid >= Schedule.goalAmount(bill) - Schedule.PAID_EPSILON
    }

    /** Local notifications before activated card-linked offers expire (Pro;
     *  mirrors the server email reminder, gated on the `offerReminders` flag). */
    private fun scheduleOffers(
        cards: List<Card>,
        settings: JsonObject,
        zone: ZoneId,
        scheduled: MutableList<Scheduled>,
    ) {
        if (!settings.offerReminders) return
        val hour = settings.notifyHour
        // One alarm per reminder day the user picked, longest lead first.
        val offsets = settings.reminderOffsets
        val now = ZonedDateTime.now(zone)
        // (card, offer, expiry-date) for unused offers with a parseable expiry.
        val upcoming = cards.flatMap { c ->
            c.offers.filter { !it.used && it.expires.isNotBlank() }
                .mapNotNull { o -> DateLogic.parseDate(o.expires)?.let { Triple(c, o, it.atStartOfDay(zone)) } }
        }.sortedBy { it.third }
        for ((_, offer, end) in upcoming) {
            if (scheduled.size >= MAX) break
            for (off in offsets) {
                if (scheduled.size >= MAX) break
                val fire = end.minusDays(off.toLong()).withHour(hour).withMinute(0)
                if (!fire.isAfter(now)) continue
                scheduled.add(
                    Scheduled(offer.id.hashCode() * 41 + off + 20000, fire.toInstant().toEpochMilli(),
                        "Offer expiring soon", offerBodyFor(offer, off))
                )
            }
        }
    }

    private fun offerBodyFor(offer: app.fihaven.core.model.CardOffer, off: Int): String {
        val phrase = when {
            off <= 0 -> "expires today"
            off == 1 -> "expires tomorrow"
            else -> "expires in $off days"
        }
        val merchant = offer.merchant.ifBlank { "A card offer" }
        return if (offer.detail.isBlank()) "$merchant offer $phrase." else "$merchant (${offer.detail}) $phrase."
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
        val hour = settings.notifyHour
        // One alarm per reminder day the user picked, longest lead first.
        val offsets = settings.reminderOffsets
        val now = ZonedDateTime.now(zone)
        val upcoming = bills.mapNotNull { b -> trialEndDate(b, zone)?.let { b to it } }.sortedBy { it.second }
        for ((bill, end) in upcoming) {
            if (scheduled.size >= MAX) break
            for (off in offsets) {
                if (scheduled.size >= MAX) break
                val fire = end.minusDays(off.toLong()).withHour(hour).withMinute(0)
                if (!fire.isAfter(now)) continue
                scheduled.add(
                    Scheduled(bill.id.hashCode() * 37 + off + 10000, fire.toInstant().toEpochMilli(),
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

    /**
     * Drop every scheduled reminder and forget the schedule. Called on sign-out
     * and account deletion: the alarms and the copy they carry (bill names and
     * amounts) live on the device, not in the session, so without this they
     * keep firing for a signed-out user — and [rescheduleFromSaved] re-arms
     * them from SharedPreferences after every reboot, indefinitely.
     */
    fun cancelAll(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        context.getSystemService(AlarmManager::class.java)?.let { am ->
            readSchedule(prefs).forEach { am.cancel(pendingIntent(context, it.code)) }
        }
        prefs.edit().remove(KEY_SCHEDULE).apply()
        // Anything already posted is on-screen copy from the same source.
        runCatching { androidx.core.app.NotificationManagerCompat.from(context).cancelAll() }
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
        // A bill with no amount set drops the figure rather than claiming
        // "$0.00" — that reads as "this costs nothing" and contradicts the row,
        // which says "No amount set".
        return if (bill.amount == null) "$name $phrase."
        else "$name $phrase — ${Money.fmt(bill.amountOrZero)}."
    }

    private fun pendingIntent(
        context: Context,
        code: Int,
        title: String? = null,
        body: String? = null,
    ): PendingIntent {
        // Explicit destination set inline via direct setters (no helper / `apply`)
        // so CodeQL's implicit-PendingIntent dataflow sees the fixed component.
        val intent = Intent()
        intent.setClassName(context.packageName, BillReminderReceiver::class.java.name)
        intent.setPackage(context.packageName)
        intent.putExtra("code", code)
        title?.let { intent.putExtra("title", it) }
        body?.let { intent.putExtra("body", it) }
        return PendingIntent.getBroadcast(
            context, code, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /** Show a server push immediately (FCM foreground delivery). */
    fun showImmediate(context: Context, title: String, body: String) {
        ensureChannel(context)
        val code = (title + body).hashCode()
        // Explicit destination set inline via direct setters (no helper / `apply`)
        // so CodeQL's implicit-PendingIntent dataflow sees the fixed component.
        val launch = Intent()
        launch.setClassName(context.packageName, MainActivity::class.java.name)
        launch.setPackage(context.packageName)
        launch.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        val contentPi = PendingIntent.getActivity(
            context, code, launch,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = androidx.core.app.NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_fihaven)
            .setColor(androidx.core.content.ContextCompat.getColor(context, R.color.fh_brand))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(androidx.core.app.NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(contentPi)
            .build()
        try {
            androidx.core.app.NotificationManagerCompat.from(context).notify(code, notification)
        } catch (_: SecurityException) { /* POST_NOTIFICATIONS revoked */ }
    }
}
