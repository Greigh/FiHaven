import SwiftUI

/// The user's appearance choice. Stored locally per device — mirroring
/// the web app's `fh_theme` localStorage value — with "system" added as
/// the mobile-idiomatic default that follows the OS. Driving
/// `.preferredColorScheme` at the root flips every dynamic color in
/// `Theme` (they resolve off the trait collection's userInterfaceStyle).
enum ThemePreference: String, CaseIterable, Identifiable {
    case system, light, dark

    var id: String { rawValue }

    var label: String {
        switch self {
        case .system: return "System"
        case .light: return "Light"
        case .dark: return "Dark"
        }
    }

    /// nil → follow the system; otherwise force light/dark.
    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

/// Persists the appearance choice and republishes so the root can
/// re-apply `.preferredColorScheme`.
@MainActor
final class ThemeStore: ObservableObject {
    private static let key = "fh_theme"

    @Published var preference: ThemePreference {
        didSet { UserDefaults.standard.set(preference.rawValue, forKey: Self.key) }
    }

    init() {
        let raw = UserDefaults.standard.string(forKey: Self.key) ?? ""
        preference = ThemePreference(rawValue: raw) ?? .system
    }
}
