import Foundation
import LocalAuthentication

/// Thin wrapper over LocalAuthentication for the app lock. Uses
/// `.deviceOwnerAuthentication` so Face ID / Touch ID falls back to the
/// device passcode if biometrics fail.
enum BiometricAuth {
    /// What the device offers, for labeling the setting.
    static var biometryType: LABiometryType {
        let c = LAContext()
        _ = c.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
        return c.biometryType
    }

    static var label: String {
        switch biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        case .opticID: return "Optic ID"
        default: return "Biometrics"
        }
    }

    /// SF Symbol matching the biometry type.
    static var symbol: String {
        switch biometryType {
        case .faceID, .opticID: return "faceid"
        case .touchID: return "touchid"
        default: return "lock.fill"
        }
    }

    static var isAvailable: Bool {
        var err: NSError?
        return LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: &err)
    }

    static func authenticate(reason: String) async -> Bool {
        let context = LAContext()
        do {
            return try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)
        } catch {
            return false
        }
    }
}

/// App-lock state + the local "require Face ID" preference. Stored per
/// device in UserDefaults (mirrors the web's local prefs). The signed-in
/// content is gated on `locked` (see RootView).
@MainActor
final class BiometricStore: ObservableObject {
    private static let key = "ct_biometric"

    @Published private(set) var enabled: Bool
    @Published private(set) var locked: Bool

    var label: String { BiometricAuth.label }
    var symbol: String { BiometricAuth.symbol }
    var isAvailable: Bool {
        #if DEBUG
        // Screenshot/demo aid: show the toggle even on a simulator without
        // enrolled biometrics.
        if ProcessInfo.processInfo.environment["CT_BIO_DEMO"] == "1" { return true }
        #endif
        return BiometricAuth.isAvailable
    }

    init() {
        let on = UserDefaults.standard.bool(forKey: Self.key)
        enabled = on
        // Cold launch starts locked when enabled; a fresh interactive
        // login clears it (AppEnvironment calls markUnlocked).
        locked = on
    }

    /// Toggle the setting. Enabling first requires a successful auth.
    func setEnabled(_ on: Bool) async {
        if on {
            guard await BiometricAuth.authenticate(reason: "Enable \(label) lock") else { return }
        }
        enabled = on
        UserDefaults.standard.set(on, forKey: Self.key)
        locked = false
    }

    /// Re-lock on background / resume.
    func lockIfEnabled() { if enabled { locked = true } }

    /// Cleared after a fresh password/MFA sign-in (already authenticated).
    func markUnlocked() { locked = false }

    /// Prompt to unlock; on success reveals the app.
    func unlock() async {
        if await BiometricAuth.authenticate(reason: "Unlock FiHaven") { locked = false }
    }
}
