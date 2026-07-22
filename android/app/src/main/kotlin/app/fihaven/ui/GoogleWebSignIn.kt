package app.fihaven.ui

import android.content.Context
import androidx.browser.customtabs.CustomTabsIntent
import app.fihaven.BuildConfig
import androidx.core.net.toUri
import java.util.UUID

/**
 * Google sign-in via Custom Tab when Credential Manager can't mint a token
 * (common on Play builds until an Android OAuth client has the Play App
 * Signing SHA-1). Opens a FiHaven page that runs Google Identity Services,
 * deposits the JWT under a one-time handoff code, then returns via
 * package-locked `fihaven://oauth/google?code=…` (Custom Tabs keep same-host
 * https App Links in the tab). The GIS page form-POSTs to
 * `/api/auth/oauth/google/callback`, which 302-redirects like Apple — more
 * reliable than async JS `location.replace(intent://…)`.
 */
object GoogleWebSignIn {
    @Volatile var pendingState: String? = null
        private set

    fun launch(context: Context) {
        val state = UUID.randomUUID().toString()
        pendingState = state
        val url = BuildConfig.API_BASE.trimEnd('/').toUri().buildUpon()
            .appendPath("oauth-google-android.html")
            .appendQueryParameter("state", state)
            .build()
        CustomTabsIntent.Builder().build().launchUrl(context, url)
    }

    fun consumeState(state: String?): Boolean {
        val expected = pendingState
        pendingState = null
        return expected == null || expected == state
    }
}
