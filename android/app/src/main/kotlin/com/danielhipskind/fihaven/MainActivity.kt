package com.danielhipskind.fihaven

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.viewmodel.compose.viewModel
import com.danielhipskind.fihaven.ui.BiometricAuth
import com.danielhipskind.fihaven.ui.RootScreen
import com.danielhipskind.fihaven.ui.theme.FiHavenTheme
import com.danielhipskind.fihaven.ui.theme.LocalThemeController
import com.danielhipskind.fihaven.ui.theme.ThemeController
import com.danielhipskind.fihaven.ui.theme.ThemePref

// FragmentActivity (not ComponentActivity) so androidx BiometricPrompt can attach.
class MainActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
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
