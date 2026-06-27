package app.fihaven

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Posts a bill-reminder notification when an alarm scheduled by
 * [NotificationScheduler] fires. If the user has revoked the POST_NOTIFICATIONS
 * permission, NotificationManagerCompat.notify is a no-op (no crash).
 */
class BillReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val title = intent.getStringExtra("title") ?: "Bill reminder"
        val body = intent.getStringExtra("body") ?: "A bill is due soon."
        val code = intent.getIntExtra("code", 1)

        NotificationScheduler.ensureChannel(context)

        // Explicit (Context, Class) constructor so the destination component is
        // fixed at creation — CodeQL's implicit-PendingIntent check doesn't
        // track an apply-block `component =` setter.
        val launch = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val contentPi = PendingIntent.getActivity(
            context, code, launch,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        val notification = NotificationCompat.Builder(context, NotificationScheduler.CHANNEL_ID)
            .setSmallIcon(context.applicationInfo.icon)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(contentPi)
            .build()

        try {
            NotificationManagerCompat.from(context).notify(code, notification)
        } catch (_: SecurityException) {
            // Permission revoked between scheduling and firing — ignore.
        }
    }
}
