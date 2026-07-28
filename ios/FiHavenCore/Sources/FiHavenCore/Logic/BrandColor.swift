import Foundation

/// Keep a brand color readable on whichever surface it lands on.
///
/// The bundled issuer marks are authored for a white page — Visa's navy
/// (#1A1F71) and Apple's black all but disappear on the dark theme's
/// #17181B card. Rather than dropping the brand color, lift it toward the
/// nearest extreme until it clears a contrast floor, which keeps the hue
/// (navy → periwinkle) and so keeps the mark recognizable.
///
/// Colors are packed 0xRRGGBB. Keep in sync with Android `BrandColor.kt`.
public enum BrandColor {
    /// WCAG relative luminance (0 = black, 1 = white).
    public static func relativeLuminance(_ color: UInt32) -> Double {
        func channel(_ raw: UInt32) -> Double {
            let v = Double(raw) / 255
            return v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4)
        }
        let r = channel((color >> 16) & 0xFF)
        let g = channel((color >> 8) & 0xFF)
        let b = channel(color & 0xFF)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    /// WCAG contrast ratio between two colors (1…21).
    public static func contrastRatio(_ a: UInt32, _ b: UInt32) -> Double {
        let la = relativeLuminance(a)
        let lb = relativeLuminance(b)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
    }

    /// `color` blended toward white (on a dark background) or black (on a
    /// light one) just far enough to reach `minContrast`. Returns the input
    /// unchanged when it already has enough contrast.
    ///
    /// 3:1 is the WCAG floor for non-text graphics, which is what a logo is.
    public static func legible(_ color: UInt32, on background: UInt32, minContrast: Double = 3.0) -> UInt32 {
        guard contrastRatio(color, background) < minContrast else { return color }
        let target: UInt32 = relativeLuminance(background) < 0.5 ? 0xFFFFFF : 0x000000

        // Walk the blend in 5% steps and stop at the first shade that clears
        // the floor — the least distortion of the brand color that works.
        var best = target
        for step in 1...20 {
            let mixed = mix(color, target, amount: Double(step) / 20)
            if contrastRatio(mixed, background) >= minContrast {
                best = mixed
                break
            }
        }
        return best
    }

    /// Linear blend between two packed colors; `amount` 0 = `a`, 1 = `b`.
    public static func mix(_ a: UInt32, _ b: UInt32, amount: Double) -> UInt32 {
        let t = min(1, max(0, amount))
        func blend(_ shift: UInt32) -> UInt32 {
            let from = Double((a >> shift) & 0xFF)
            let to = Double((b >> shift) & 0xFF)
            return UInt32((from + (to - from) * t).rounded())
        }
        return (blend(16) << 16) | (blend(8) << 8) | blend(0)
    }
}
