package app.fihaven.ui.theme

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView

/// Design tokens ported from client/css/tokens.css (docs/native-contract.md §8).
data class CtColors(
    val bg: Color,
    val surface: Color,
    val surface2: Color,
    val border: Color,
    val text: Color,
    val muted: Color,
    val accent: Color,
    val accentHover: Color,
    val accentBg: Color,
    val green: Color,
    val greenBg: Color,
    val red: Color,
    val redBg: Color,
    val orange: Color,
    val orangeBg: Color,
    val yellow: Color,
    val yellowBg: Color,
    /// Chart series. Deliberately NOT green/red: that pair reads as ΔE 2.1 under
    /// deuteranopia on the dark surface — effectively one color. Blue/orange holds
    /// ΔE >= 26 in both modes. The dark steps are chosen against the dark surface,
    /// not flipped from light (the light steps sit above the dark lightness band).
    val chartIncome: Color,
    val chartSpend: Color,
    /// Plate behind a full-color brand mark. White in both themes on purpose:
    /// these logos are drawn for a white page, and a black wordmark would
    /// disappear if the plate followed the dark surface.
    val logoPlate: Color,
    /// Neutral floor under an issuer tile's brand-colored ring (web
    /// `--chip-edge`). It flips to light on the dark theme because a
    /// near-black tile — Apple's, Bilt's — has no edge of its own there.
    val tileEdge: Color,
)

val LightCt = CtColors(
    bg = Color(0xFFFAFAFB), surface = Color(0xFFFFFFFF), surface2 = Color(0xFFF2F3F6),
    border = Color(0xFFE5E7EB), text = Color(0xFF15161A), muted = Color(0xFF6C6E77),
    accent = Color(0xFF3D6FE1), accentHover = Color(0xFF2F5DCB), accentBg = Color(0xFFEAF0FE),
    green = Color(0xFF15803D), greenBg = Color(0xFFE7F4EC), red = Color(0xFFDC2626), redBg = Color(0xFFFDECEC),
    orange = Color(0xFFC2410C), orangeBg = Color(0xFFFDEEE3), yellow = Color(0xFFA16207), yellowBg = Color(0xFFFBF5DC),
    chartIncome = Color(0xFF3D6FE1), chartSpend = Color(0xFFC2410C),
    logoPlate = Color(0xFFFFFFFF), tileEdge = Color(0x1A000000),
)

val DarkCt = CtColors(
    bg = Color(0xFF0C0D0F), surface = Color(0xFF17181B), surface2 = Color(0xFF1F2126),
    border = Color(0xFF292B31), text = Color(0xFFECEDF0), muted = Color(0xFF868892),
    accent = Color(0xFF6098F6), accentHover = Color(0xFF82AEFA), accentBg = Color(0xFF122544),
    green = Color(0xFF34C57B), greenBg = Color(0xFF0E2B1A), red = Color(0xFFF87171), redBg = Color(0xFF2B1414),
    orange = Color(0xFFFB923C), orangeBg = Color(0xFF2B1A0C), yellow = Color(0xFFFBBF24), yellowBg = Color(0xFF2B2008),
    chartIncome = Color(0xFF4A87EE), chartSpend = Color(0xFFD9700F),
    logoPlate = Color(0xFFFFFFFF), tileEdge = Color(0x2BFFFFFF),
)

val LocalCt = staticCompositionLocalOf { LightCt }

/// Convenience accessor: `Ct.colors`.
object Ct {
    val colors: CtColors
        @Composable @ReadOnlyComposable get() = LocalCt.current
}

@Composable
fun FiHavenTheme(pref: ThemePref = ThemePref.SYSTEM, content: @Composable () -> Unit) {
    val dark = when (pref) {
        ThemePref.SYSTEM -> isSystemInDarkTheme()
        ThemePref.LIGHT -> false
        ThemePref.DARK -> true
    }
    val ct = if (dark) DarkCt else LightCt
    // Re-apply edge-to-edge whenever `dark` flips. enableEdgeToEdge()'s default
    // styles decide the system bars' icon color and scrim from the *system*
    // dark-mode setting, but `dark` above is the user's in-app preference, which
    // is free to disagree with it — so a Dark app on a Light phone drew dark
    // status-bar icons onto our dark background, and vice versa. Handing the
    // styles an explicit detectDarkMode is the supported way to bind them to
    // something other than uiMode. MainActivity's bare call covers the frames
    // before this runs.
    val view = LocalView.current
    if (!view.isInEditMode) {
        val activity = view.context.findActivity() as? ComponentActivity
        DisposableEffect(activity, dark) {
            activity?.enableEdgeToEdge(
                statusBarStyle = SystemBarStyle.auto(TRANSPARENT, TRANSPARENT) { dark },
                navigationBarStyle = SystemBarStyle.auto(NavBarLightScrim, NavBarDarkScrim) { dark },
            )
            onDispose {}
        }
    }
    val scheme = if (dark) {
        darkColorScheme(
            primary = ct.accent, background = ct.bg, surface = ct.surface,
            onPrimary = Color.White, onBackground = ct.text, onSurface = ct.text,
        )
    } else {
        lightColorScheme(
            primary = ct.accent, background = ct.bg, surface = ct.surface,
            onPrimary = Color.White, onBackground = ct.text, onSurface = ct.text,
        )
    }
    CompositionLocalProvider(LocalCt provides ct) {
        MaterialTheme(colorScheme = scheme, typography = fihavenTypography()) {
            // Make Manrope the default for every Text() that doesn't set its own.
            CompositionLocalProvider(
                LocalTextStyle provides LocalTextStyle.current.copy(fontFamily = Manrope),
                content = content,
            )
        }
    }
}

/// A composable's context is not always the Activity — Compose wraps it, and
/// inside a Dialog it is the dialog's own themed context — so walk the wrappers
/// rather than casting.
private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

private const val TRANSPARENT = 0

/// Navigation-bar fill below API 29, which has no contrast enforcement to keep
/// the buttons legible over app content (and on API 26, no light-button mode
/// either). Copied from androidx.activity's own defaults so the bar looks
/// identical to what plain enableEdgeToEdge() produced — only which of the two
/// gets picked changes. Both are unused from API 29 up: there the bar is simply
/// transparent.
private const val NavBarLightScrim = 0xE6FFFFFF.toInt()
private const val NavBarDarkScrim = 0x801B1B1B.toInt()
