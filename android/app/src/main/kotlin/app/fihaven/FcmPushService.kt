package app.fihaven

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/** Receives FCM messages and token refresh events from Firebase. */
class FcmPushService : FirebaseMessagingService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        scope.launch { PushRegistrar.onNewToken(token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        // Notification payloads are shown by the system when the app is in
        // background; foreground display is handled by NotificationScheduler
        // for local reminders. Server push copy mirrors email reminders.
        val notification = message.notification ?: return
        NotificationScheduler.showImmediate(
            this,
            notification.title ?: "FiHaven",
            notification.body ?: "",
        )
    }
}
