package app.fihaven.ui

import android.content.Context
import java.util.UUID

/**
 * The OAuth `state` nonce for the Custom Tab sign-in flows, persisted so the
 * check survives process death.
 *
 * The guard used to be a `@Volatile` field with an `expected == null || …`
 * escape hatch, because a Custom Tab return genuinely can outlive the process.
 * The cost of that hatch was that the check was OPTIONAL for anyone who could
 * deliver a deep link: MainActivity is exported and the `fihaven://` scheme is
 * claimable by any app on the device, so a forged link carrying no state passed
 * outright. Persisting the value keeps the guard mandatory without breaking the
 * legitimate cross-process return.
 *
 * A mismatch is deliberately NOT cleared. Clearing on a bad value would let a
 * forged link burn the real pending state and break the user's sign-in; the
 * value is only spent once it actually matches.
 */
internal object OAuthStateStore {
    private const val PREFS = "fh_oauth_state"

    /** Mint and persist a fresh state for `provider`; returns it for the URL. */
    fun issue(context: Context, provider: String): String {
        val state = UUID.randomUUID().toString()
        prefs(context).edit().putString(key(provider), state).apply()
        return state
    }

    /**
     * Consume the stored state. True only when one was issued, it is non-blank,
     * and it matches `state` exactly.
     */
    fun consume(context: Context, provider: String, state: String?): Boolean {
        if (state.isNullOrBlank()) return false
        val store = prefs(context)
        val k = key(provider)
        val expected = store.getString(k, null) ?: return false
        if (expected != state) return false
        store.edit().remove(k).apply()
        return true
    }

    private fun key(provider: String) = "state_$provider"

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
