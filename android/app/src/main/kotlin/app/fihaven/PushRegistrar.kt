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
 *
 * The last registered token is persisted rather than held in memory. FCM
 * rotates tokens on reinstall, restore-to-a-new-device, and data clear —
 * usually while the process isn't running — so an in-memory record is empty
 * exactly when it matters. Without a durable one the previous token is never
 * retired and the server accumulates every token the device has ever had, and
 * turning push off after a restart unregisters nothing, so notifications keep
 * arriving after the user opted out.
 */
object PushRegistrar {
    private const val PREFS = "fihaven_push"
    private const val KEY_LAST_TOKEN = "last_token"

    private var api: ApiClient? = null
    private var appContext: Context? = null

    fun configure(context: Context, api: ApiClient) {
        this.appContext = context.applicationContext
        this.api = api
    }

    private fun prefs(context: Context?) =
        (context ?: appContext)?.applicationContext
            ?.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun lastToken(context: Context?): String? =
        prefs(context)?.getString(KEY_LAST_TOKEN, null)

    private fun setLastToken(context: Context?, token: String?) {
        val editor = prefs(context)?.edit() ?: return
        if (token == null) editor.remove(KEY_LAST_TOKEN) else editor.putString(KEY_LAST_TOKEN, token)
        editor.apply()
    }

    /**
     * Retire [stale] server-side, then claim [token]. The new token is recorded
     * only once the server has accepted it, so a failed registration is retried
     * on the next sync instead of being remembered as done.
     */
    private suspend fun replace(context: Context?, client: ApiClient, stale: String?, token: String) {
        if (stale != null && stale != token) runCatching { client.unregisterPushDevice(stale) }
        runCatching { client.registerPushDevice("android", token) }
            .onSuccess { setLastToken(context, token) }
    }

    suspend fun sync(context: Context, settings: JsonObject) {
        if (!BuildConfig.FCM_ENABLED) return
        val client = api ?: return
        val stored = lastToken(context)

        if (!settings.pushNotifications) {
            // Drop whatever we last registered, even if that was a previous run.
            stored?.let { runCatching { client.unregisterPushDevice(it) } }
            setLastToken(context, null)
            return
        }

        val token = runCatching {
            FirebaseMessaging.getInstance().token.await()
        }.getOrNull() ?: return
        if (token == stored) return
        replace(context, client, stored, token)
    }

    suspend fun clear() {
        val client = api ?: return
        lastToken(null)?.let { runCatching { client.unregisterPushDevice(it) } }
        setLastToken(null, null)
    }

    /**
     * Called when FCM rotates the token. Firebase can start the messaging
     * service without the rest of the app, so [api] may be null here — that is
     * fine, the stored token still names the stale one and the next [sync]
     * reconciles. A null stored token means push is off or was never
     * registered, so there is nothing to move and we must not opt the user in.
     */
    suspend fun onNewToken(context: Context, token: String) {
        val client = api ?: return
        val stored = lastToken(context) ?: return
        if (token == stored) return
        replace(context, client, stored, token)
    }
}
