package app.fihaven

import android.content.Context
import app.fihaven.core.net.ApiClient
import app.fihaven.core.model.pushNotifications
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.json.JsonObject

/**
 * Uploads the FCM device token when [pushNotifications] is on. Requires
 * `google-services.json` (see [google-services.json.example]); without it
 * [BuildConfig.FCM_ENABLED] is false and this is a no-op.
 */
object PushRegistrar {
    private var api: ApiClient? = null
    private var lastToken: String? = null

    fun configure(api: ApiClient) {
        this.api = api
    }

    suspend fun sync(context: Context, settings: JsonObject) {
        if (!BuildConfig.FCM_ENABLED) return
        val client = api ?: return
        if (!settings.pushNotifications) {
            lastToken?.let { runCatching { client.unregisterPushDevice(it) } }
            lastToken = null
            return
        }
        val token = runCatching {
            FirebaseMessaging.getInstance().token.await()
        }.getOrNull() ?: return
        if (token == lastToken) return
        runCatching { client.registerPushDevice("android", token) }
        lastToken = token
    }

    suspend fun clear() {
        val client = api ?: return
        lastToken?.let { runCatching { client.unregisterPushDevice(it) } }
        lastToken = null
    }

    /** Called when FCM rotates the token while push is enabled. */
    suspend fun onNewToken(token: String) {
        val client = api ?: return
        lastToken?.let { runCatching { client.unregisterPushDevice(it) } }
        runCatching { client.registerPushDevice("android", token) }
        lastToken = token
    }
}
