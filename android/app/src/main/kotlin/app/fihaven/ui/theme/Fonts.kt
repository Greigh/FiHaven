package app.fihaven.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import app.fihaven.R

// Bundled OFL fonts: Manrope (variable wght axis) for UI text, IBM Plex
// Mono for numbers/labels. See docs/native-contract.md §8.

@OptIn(ExperimentalTextApi::class)
private fun manrope(weight: Int) = Font(
    resId = R.font.manrope_variable,
    weight = FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
)

/** Manrope (variable) — UI text. */
val Manrope = FontFamily(
    manrope(400), manrope(500), manrope(600), manrope(700), manrope(800),
)

/** IBM Plex Mono — numbers / mono labels. */
val PlexMono = FontFamily(
    Font(R.font.ibm_plex_mono_regular, FontWeight.Normal),
    Font(R.font.ibm_plex_mono_medium, FontWeight.Medium),
)

/** Material typography with Manrope as the family across every style. */
fun fihavenTypography(): Typography {
    val d = Typography()
    return Typography(
        displayLarge = d.displayLarge.copy(fontFamily = Manrope),
        displayMedium = d.displayMedium.copy(fontFamily = Manrope),
        displaySmall = d.displaySmall.copy(fontFamily = Manrope),
        headlineLarge = d.headlineLarge.copy(fontFamily = Manrope),
        headlineMedium = d.headlineMedium.copy(fontFamily = Manrope),
        headlineSmall = d.headlineSmall.copy(fontFamily = Manrope),
        titleLarge = d.titleLarge.copy(fontFamily = Manrope),
        titleMedium = d.titleMedium.copy(fontFamily = Manrope),
        titleSmall = d.titleSmall.copy(fontFamily = Manrope),
        bodyLarge = d.bodyLarge.copy(fontFamily = Manrope),
        bodyMedium = d.bodyMedium.copy(fontFamily = Manrope),
        bodySmall = d.bodySmall.copy(fontFamily = Manrope),
        labelLarge = d.labelLarge.copy(fontFamily = Manrope),
        labelMedium = d.labelMedium.copy(fontFamily = Manrope),
        labelSmall = d.labelSmall.copy(fontFamily = Manrope),
    )
}
