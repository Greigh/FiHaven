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
    // Latest fihaven://oauth/{apple|google} deep link (web OAuth flows),
    // observed in composition and handed to the view-model.
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
            // Web OAuth (Apple / Google Custom Tab) returns via fihaven://oauth/{provider}.
            val link = oauthDeepLink.value
            LaunchedEffect(link) {
                if (link != null && link.scheme == "fihaven" && link.host == "oauth") {
                    val provider = link.pathSegments.firstOrNull()
                    val idToken = link.getQueryParameter("idToken")
                    val state = link.getQueryParameter("state")
                    val stateOk = when (provider) {
                        "apple" -> AppleWebSignIn.consumeState(state)
                        "google" -> GoogleWebSignIn.consumeState(state)
                        else -> false
                    }
                    if (provider != null && !idToken.isNullOrBlank() && stateOk) {
                        vm.oauthSignIn(
                            provider,
                            idToken,
                            link.getQueryParameter("name")?.ifBlank { null },
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
}
