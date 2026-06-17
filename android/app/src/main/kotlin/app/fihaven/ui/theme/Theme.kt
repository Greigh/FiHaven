package app.fihaven.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

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
)

val LightCt = CtColors(
    bg = Color(0xFFFAFAFB), surface = Color(0xFFFFFFFF), surface2 = Color(0xFFF2F3F6),
    border = Color(0xFFE5E7EB), text = Color(0xFF15161A), muted = Color(0xFF6C6E77),
    accent = Color(0xFF3D6FE1), accentHover = Color(0xFF2F5DCB), accentBg = Color(0xFFEAF0FE),
    green = Color(0xFF15803D), greenBg = Color(0xFFE7F4EC), red = Color(0xFFDC2626), redBg = Color(0xFFFDECEC),
    orange = Color(0xFFC2410C), orangeBg = Color(0xFFFDEEE3), yellow = Color(0xFFA16207), yellowBg = Color(0xFFFBF5DC),
)

val DarkCt = CtColors(
    bg = Color(0xFF0C0D0F), surface = Color(0xFF17181B), surface2 = Color(0xFF1F2126),
    border = Color(0xFF292B31), text = Color(0xFFECEDF0), muted = Color(0xFF868892),
    accent = Color(0xFF6098F6), accentHover = Color(0xFF82AEFA), accentBg = Color(0xFF122544),
    green = Color(0xFF34C57B), greenBg = Color(0xFF0E2B1A), red = Color(0xFFF87171), redBg = Color(0xFF2B1414),
    orange = Color(0xFFFB923C), orangeBg = Color(0xFF2B1A0C), yellow = Color(0xFFFBBF24), yellowBg = Color(0xFF2B2008),
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
