package app.fihaven

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Re-arms persisted bill reminders after a device reboot. AlarmManager alarms
 * don't survive a restart, so [NotificationScheduler] saves the full schedule
 * and we replay it here — no app launch or network needed.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            // Some OEMs / app updates send these instead of BOOT_COMPLETED.
            "android.intent.action.QUICKBOOT_POWERON",
            Intent.ACTION_MY_PACKAGE_REPLACED ->
                NotificationScheduler.rescheduleFromSaved(context)
        }
    }
}
