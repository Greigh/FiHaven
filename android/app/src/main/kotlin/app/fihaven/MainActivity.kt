package app.fihaven

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.viewmodel.compose.viewModel
import app.fihaven.ui.AppleWebSignIn
import app.fihaven.ui.BiometricAuth
import app.fihaven.ui.GoogleWebSignIn
import app.fihaven.ui.RootScreen
import app.fihaven.ui.theme.FiHavenTheme
import app.fihaven.ui.theme.LocalThemeController
import app.fihaven.ui.theme.ThemeController
import app.fihaven.ui.theme.ThemePref

// FragmentActivity (not ComponentActivity) so androidx BiometricPrompt can attach.
class MainActivity : FragmentActivity() {
    // Latest OAuth App Link / deep link (web OAuth flows), observed in
    // composition and handed to the view-model.
    private val oauthDeepLink = mutableStateOf<Uri?>(null)

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.data?.let { oauthDeepLink.value = it }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        oauthDeepLink.value = intent?.data
        // DEBUG screenshot helpers: `adb ... --ez autologin true --es tab bills --es theme dark`.
        val autoLogin = intent.getBooleanExtra("autologin", false)
        val tab = intent.getStringExtra("tab")
        val route = intent.getStringExtra("route")
        val themeOverride = intent.getStringExtra("theme")
        val bioDemo = intent.getBooleanExtra("biodemo", false)
        val bioLock = intent.getBooleanExtra("biolock", false)
        setContent {
            val vm: AppViewModel = viewModel()
            if (BuildConfig.DEBUG && (bioDemo || bioLock)) {
                BiometricAuth.demoMode = true
                LaunchedEffect(Unit) { if (bioLock) vm.demoLock() }
            }
            // Web OAuth returns via https://fihaven.app/oauth/{provider}?code=…
            // (App Links) or legacy fihaven://oauth/{provider}?code=….
            val link = oauthDeepLink.value
            LaunchedEffect(link) {
                val parsed = link?.let { parseOauthReturn(it) }
                if (parsed != null) {
                    val stateOk = when (parsed.provider) {
                        "apple" -> AppleWebSignIn.consumeState(parsed.state)
                        "google" -> GoogleWebSignIn.consumeState(parsed.state)
                        else -> false
                    }
                    when {
                        !stateOk -> vm.reportAuthError(
                            "That sign-in link expired. Tap Continue with Google and try again.",
                        )
                        !parsed.handoffCode.isNullOrBlank() ->
                            vm.oauthSignInHandoff(parsed.provider, parsed.handoffCode, parsed.state)
                        !parsed.idToken.isNullOrBlank() ->
                            vm.oauthSignIn(
                                parsed.provider,
                                parsed.idToken,
                                parsed.name,
                            )
                        else -> vm.reportAuthError(
                            "Google sign-in did not return a code. Close the browser tab and try again.",
                        )
                    }
                    oauthDeepLink.value = null
                }
            }
            val themeController = remember { ThemeController(applicationContext) }
            remember(themeOverride) {
                themeOverride?.let {
                    runCatching { themeController.set(ThemePref.valueOf(it.uppercase())) }
                }
                true
            }
            CompositionLocalProvider(LocalThemeController provides themeController) {
                FiHavenTheme(pref = themeController.pref) {
                    RootScreen(vm = vm, autoLogin = autoLogin, initialTab = tab, initialRoute = route)
                }
            }
        }
    }

    private data class OAuthReturn(
        val provider: String,
        val handoffCode: String?,
        val idToken: String?,
        val state: String?,
        val name: String?,
    )

    /** Accept https://fihaven.app/oauth/{provider} and fihaven://oauth/{provider}. */
    private fun parseOauthReturn(uri: Uri): OAuthReturn? {
        val provider = when {
            uri.scheme == "fihaven" && uri.host == "oauth" ->
                uri.pathSegments.firstOrNull()
            uri.scheme == "https" &&
                (uri.host == "fihaven.app" || uri.host == "www.fihaven.app") &&
                uri.pathSegments.getOrNull(0) == "oauth" ->
                uri.pathSegments.getOrNull(1)
            else -> null
        } ?: return null
        if (provider != "apple" && provider != "google") return null
        return OAuthReturn(
            provider = provider,
            handoffCode = uri.getQueryParameter("code"),
            idToken = uri.getQueryParameter("idToken"),
            state = uri.getQueryParameter("state"),
            name = uri.getQueryParameter("name")?.ifBlank { null },
        )
    }
}
