package app.fihaven.ui

import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import app.fihaven.BuildConfig
import java.util.UUID
import androidx.core.net.toUri

/**
 * Sign in with Apple on Android — a web flow (Apple has no native SDK).
 *
 * We open Apple's authorize page in a Custom Tab. Apple form-posts the result
 * to the server callback (`/api/auth/oauth/apple/callback`), which 302-redirects
 * to `fihaven://oauth/apple?idToken=…` — caught by MainActivity's intent filter,
 * which hands the token to [app.fihaven.AppViewModel.oauthSignIn].
 */
object AppleWebSignIn {
    /** CSRF guard: the `state` we sent, checked when the deep link returns.
     *  Null after a process death — acceptable, since the server still verifies
     *  the token's signature + audience. */
    @Volatile var pendingState: String? = null
        private set

    fun launch(context: Context) {
        val state = UUID.randomUUID().toString()
        pendingState = state
        val redirectUri = BuildConfig.API_BASE.trimEnd('/') + "/api/auth/oauth/apple/callback"
        val url = "https://appleid.apple.com/auth/authorize".toUri().buildUpon()
            // form_post is required once name/email scopes are requested.
            .appendQueryParameter("response_type", "code id_token")
            .appendQueryParameter("response_mode", "form_post")
            .appendQueryParameter("client_id", BuildConfig.APPLE_SERVICES_ID)
            .appendQueryParameter("redirect_uri", redirectUri)
            .appendQueryParameter("scope", "name email")
            .appendQueryParameter("state", state)
            .build()
        CustomTabsIntent.Builder().build().launchUrl(context, url)
    }

    /** True when `state` matches what we sent (or we have none to compare). */
    fun consumeState(state: String?): Boolean {
        val expected = pendingState
        pendingState = null
        return expected == null || expected == state
    }
}
