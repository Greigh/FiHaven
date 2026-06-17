package app.fihaven.ui.theme

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.core.content.edit

/** Appearance choice. Stored locally per device — mirroring the web app's
 *  `fh_theme` localStorage value — with SYSTEM following the OS. */
enum class ThemePref {
    SYSTEM, LIGHT, DARK;

    val label: String
        get() = when (this) {
            SYSTEM -> "System"
            LIGHT -> "Light"
            DARK -> "Dark"
        }
}

/** Persists the appearance choice in SharedPreferences and exposes it as
 *  Compose state so changing it recomposes the theme. */
class ThemeController(context: Context) {
    private val prefs = context.getSharedPreferences("fh_prefs", Context.MODE_PRIVATE)

    var pref by mutableStateOf(load())
        private set

    fun set(value: ThemePref) {
        pref = value
        prefs.edit { putString(KEY, value.name) }
    }

    private fun load(): ThemePref =
        runCatching { ThemePref.valueOf(prefs.getString(KEY, null) ?: SYSTEM_NAME) }
            .getOrDefault(ThemePref.SYSTEM)

    companion object {
        private const val KEY = "fh_theme"
        private const val SYSTEM_NAME = "SYSTEM"
    }
}

val LocalThemeController = staticCompositionLocalOf<ThemeController> {
    error("ThemeController not provided")
}
