package app.fihaven.core.logic

import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * Keep a brand color readable on whichever surface it lands on.
 *
 * The bundled issuer marks are authored for a white page — Visa's navy
 * (#1A1F71) and Apple's black all but disappear on the dark theme's
 * #17181B card. Rather than dropping the brand color, lift it toward the
 * nearest extreme until it clears a contrast floor, which keeps the hue
 * (navy → periwinkle) and so keeps the mark recognizable.
 *
 * Colors are packed 0xRRGGBB. Keep in sync with iOS `BrandColor.swift`.
 */
object BrandColor {
    /** WCAG relative luminance (0 = black, 1 = white). */
    fun relativeLuminance(color: Int): Double {
        fun channel(raw: Int): Double {
            val v = raw / 255.0
            return if (v <= 0.04045) v / 12.92 else ((v + 0.055) / 1.055).pow(2.4)
        }
        val r = channel((color shr 16) and 0xFF)
        val g = channel((color shr 8) and 0xFF)
        val b = channel(color and 0xFF)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    /** WCAG contrast ratio between two colors (1..21). */
    fun contrastRatio(a: Int, b: Int): Double {
        val la = relativeLuminance(a)
        val lb = relativeLuminance(b)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
    }

    /**
     * [color] blended toward white (on a dark background) or black (on a
     * light one) just far enough to reach [minContrast]. Returns the input
     * unchanged when it already has enough contrast.
     *
     * 3:1 is the WCAG floor for non-text graphics, which is what a logo is.
     */
    fun legible(color: Int, background: Int, minContrast: Double = 3.0): Int {
        if (contrastRatio(color, background) >= minContrast) return color
        val target = if (relativeLuminance(background) < 0.5) 0xFFFFFF else 0x000000

        // Walk the blend in 5% steps and stop at the first shade that clears
        // the floor — the least distortion of the brand color that works.
        for (step in 1..20) {
            val mixed = mix(color, target, step / 20.0)
            if (contrastRatio(mixed, background) >= minContrast) return mixed
        }
        return target
    }

    /** Linear blend between two packed colors; [amount] 0 = [a], 1 = [b]. */
    fun mix(a: Int, b: Int, amount: Double): Int {
        val t = min(1.0, max(0.0, amount))
        fun blend(shift: Int): Int {
            val from = ((a shr shift) and 0xFF).toDouble()
            val to = ((b shr shift) and 0xFF).toDouble()
            return (from + (to - from) * t).roundToInt()
        }
        return (blend(16) shl 16) or (blend(8) shl 8) or blend(0)
    }
}
