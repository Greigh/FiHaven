import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// Design tokens ported from client/css/tokens.css. Each color resolves
/// light/dark from the system appearance, matching the web's
/// `:root` / `[data-theme="dark"]` palettes (docs/native-contract.md §8).
enum Theme {
    // ── Palette ──────────────────────────────────────────────────────
    static let bg          = dyn(0xFAFAFB, 0x0C0D0F)
    static let surface     = dyn(0xFFFFFF, 0x17181B)
    static let surface2    = dyn(0xF2F3F6, 0x1F2126)
    static let border      = dyn(0xE5E7EB, 0x292B31)
    static let text        = dyn(0x15161A, 0xECEDF0)
    static let muted       = dyn(0x555661, 0x9496A3)
    static let accent      = dyn(0x3D6FE1, 0x6098F6)
    static let accentHover = dyn(0x2F5DCB, 0x82AEFA)
    static let accentBg    = dyn(0xEAF0FE, 0x122544)
    static let green       = dyn(0x15803D, 0x34C57B)
    static let greenBg     = dyn(0xE7F4EC, 0x0E2B1A)
    static let red         = dyn(0xDC2626, 0xF87171)
    static let redBg       = dyn(0xFDECEC, 0x2B1414)
    static let orange      = dyn(0xC2410C, 0xFB923C)
    static let orangeBg    = dyn(0xFDEEE3, 0x2B1A0C)
    static let yellow      = dyn(0xA16207, 0xFBBF24)
    static let yellowBg    = dyn(0xFBF5DC, 0x2B2008)

    // ── Radii (px → pt) ──────────────────────────────────────────────
    static let radius: CGFloat = 10
    static let radiusCard: CGFloat = 14
    static let radiusPill: CGFloat = 11

    // ── Type ─────────────────────────────────────────────────────────
    // Bundled OFL fonts: Manrope (variable wght axis) for UI, IBM Plex
    // Mono for numbers. Manrope's default instance is ExtraLight, so we
    // always pin an explicit weight. `relativeTo` ties each size to a
    // Dynamic Type text style so Larger Text scales across the app.
    static func title(_ size: CGFloat, relativeTo style: Font.TextStyle = .title) -> Font {
        .custom("Manrope", size: size, relativeTo: style).weight(.heavy)
    }
    static func ui(
        _ size: CGFloat,
        weight: Font.Weight = .regular,
        relativeTo style: Font.TextStyle = .body
    ) -> Font {
        .custom("Manrope", size: size, relativeTo: style).weight(weight)
    }
    static func mono(
        _ size: CGFloat,
        weight: Font.Weight = .regular,
        relativeTo style: Font.TextStyle = .body
    ) -> Font {
        // Two static faces bundled (Regular + Medium); map heavier UI
        // weights onto Medium.
        .custom(
            weight == .regular ? "IBMPlexMono-Regular" : "IBMPlexMono-Medium",
            size: size,
            relativeTo: style
        )
    }

    // ── Color resolution ─────────────────────────────────────────────
    static func dyn(_ light: UInt, _ dark: UInt) -> Color {
        #if canImport(UIKit)
        return Color(UIColor { traits in
            uiColor(traits.userInterfaceStyle == .dark ? dark : light)
        })
        #else
        return rgb(light)
        #endif
    }

    #if canImport(UIKit)
    private static func uiColor(_ hex: UInt) -> UIColor {
        UIColor(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
    #endif

    private static func rgb(_ hex: UInt) -> Color {
        Color(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}
