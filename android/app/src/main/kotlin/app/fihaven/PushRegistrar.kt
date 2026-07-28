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
    private const val KEY_REGISTERED_AT = "registered_at"
    private const val KEY_SERVER_READY = "server_ready"

    /** Re-claim the token this often even when it hasn't changed, so a token the
     *  server pruned after a delivery failure gets restored. */
    private const val REREGISTER_MS = 24L * 60 * 60 * 1000

    /** How long a successful registration vouches for push. Past this we assume
     *  push is broken and let local reminders take over — see [healthy]. */
    private const val STALE_MS = 7L * 24 * 60 * 60 * 1000

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

    /** Record a registration the server accepted, with what it said about its
     *  own ability to send. Cleared alongside the token when push goes off. */
    private fun setRegistered(context: Context?, ready: Boolean?) {
        val editor = prefs(context)?.edit() ?: return
        if (ready == null) {
            editor.remove(KEY_REGISTERED_AT).remove(KEY_SERVER_READY)
        } else {
            editor.putLong(KEY_REGISTERED_AT, System.currentTimeMillis())
                .putBoolean(KEY_SERVER_READY, ready)
        }
        editor.apply()
    }

    /**
     * Whether push can be trusted to deliver this device's reminders, which is
     * what lets [NotificationScheduler] stand its local copies down.
     *
     * Nothing on the device ever observes an *arriving* push — a `notification`
     * payload is drawn by the system without waking the app — so this is
     * registration health, not delivery health: we hold a token the server
     * accepted recently, and it told us it has credentials for this platform.
     * That covers the failure modes that persist silently (missing or expired
     * server credentials, no `google-services.json`, a registration that never
     * succeeded, a token pruned after repeated delivery failures). It does not
     * catch a single dropped push, which nothing on-device can see.
     */
    fun healthy(context: Context): Boolean {
        if (!BuildConfig.FCM_ENABLED) return false
        val p = prefs(context) ?: return false
        if (p.getString(KEY_LAST_TOKEN, null) == null) return false
        if (!p.getBoolean(KEY_SERVER_READY, false)) return false
        val at = p.getLong(KEY_REGISTERED_AT, 0L)
        return at > 0L && System.currentTimeMillis() - at < STALE_MS
    }

    /**
     * Retire [stale] server-side, then claim [token]. The new token is recorded
     * only once the server has accepted it, so a failed registration is retried
     * on the next sync instead of being remembered as done.
     */
    private suspend fun replace(context: Context?, client: ApiClient, stale: String?, token: String) {
        if (stale != null && stale != token) runCatching { client.unregisterPushDevice(stale) }
        runCatching { client.registerPushDevice("android", token) }
            .onSuccess { ready ->
                setLastToken(context, token)
                setRegistered(context, ready)
            }
    }

    suspend fun sync(context: Context, settings: JsonObject) {
        if (!BuildConfig.FCM_ENABLED) return
        val client = api ?: return
        val stored = lastToken(context)

        if (!settings.pushNotifications) {
            // Drop whatever we last registered, even if that was a previous run.
            stored?.let { runCatching { client.unregisterPushDevice(it) } }
            setLastToken(context, null)
            setRegistered(context, null)
            return
        }

        val token = runCatching {
            FirebaseMessaging.getInstance().token.await()
        }.getOrNull() ?: return
        // An unchanged token still gets re-claimed once a day: the server drops
        // tokens that fail to deliver, and re-registering is how we'd find out
        // (and how the entry comes back). It also refreshes the `ready` flag and
        // the timestamp [healthy] leans on.
        if (token == stored && !registrationDue(context)) return
        replace(context, client, stored, token)
    }

    private fun registrationDue(context: Context?): Boolean {
        val at = prefs(context)?.getLong(KEY_REGISTERED_AT, 0L) ?: return true
        return System.currentTimeMillis() - at >= REREGISTER_MS
    }

    suspend fun clear() {
        val client = api ?: return
        lastToken(null)?.let { runCatching { client.unregisterPushDevice(it) } }
        setLastToken(null, null)
        setRegistered(null, null)
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
