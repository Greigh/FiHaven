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

/// How long the app may stay unlocked after leaving the foreground.
/// Stored locally as minutes in UserDefaults (`fh_bio_lock_after`):
///   -1 = never lock, 0 = immediately, N > 0 = after N minutes.
enum BioLockDelay {
    static let never = -1
    static let immediately = 0
    static let presets = [1, 5, 15, 30]
    static let preferredKey = "fh_bio_lock_after_preferred"

    static func label(for minutes: Int) -> String {
        switch minutes {
        case never: return "Never"
        case immediately: return "Immediately"
        case 1: return "1 minute"
        default: return "\(minutes) minutes"
        }
    }

    static func migrate(from defaults: UserDefaults) -> Int {
        if defaults.object(forKey: "fh_bio_lock_after") != nil {
            return defaults.integer(forKey: "fh_bio_lock_after")
        }
        // Legacy boolean toggle: on → immediately, off → never.
        if defaults.object(forKey: "fh_biometric") != nil {
            return defaults.bool(forKey: "fh_biometric") ? immediately : never
        }
        return BiometricAuth.isAvailable ? immediately : never
    }

    static func preferred(from defaults: UserDefaults) -> Int {
        if defaults.object(forKey: preferredKey) != nil {
            let v = defaults.integer(forKey: preferredKey)
            return v >= 0 ? min(max(v, 0), 60) : 5
        }
        return 5
    }
}

/// App-lock state + the local lock-delay preference. Stored per device in
/// UserDefaults (mirrors the web's local prefs). The signed-in content is
/// gated on `locked` (see RootView).
@MainActor
final class BiometricStore: ObservableObject {
    private static let lockAfterKey = "fh_bio_lock_after"
    private static let legacyKey = "fh_biometric"

    @Published private(set) var lockAfterMinutes: Int
    @Published private(set) var locked: Bool

    private var backgroundedAt: Date?

    var label: String { BiometricAuth.label }
    var symbol: String { BiometricAuth.symbol }
    var isAvailable: Bool {
        #if DEBUG
        if ProcessInfo.processInfo.environment["FH_BIO_DEMO"] == "1" { return true }
        #endif
        return BiometricAuth.isAvailable
    }

    /// True when any lock delay other than "Never" is active.
    var isLockEnabled: Bool { lockAfterMinutes >= 0 }

    var lockDelayLabel: String { BioLockDelay.label(for: lockAfterMinutes) }

    init() {
        let defaults = UserDefaults.standard
        let delay = BioLockDelay.migrate(from: defaults)
        if defaults.object(forKey: Self.lockAfterKey) == nil {
            defaults.set(delay, forKey: Self.lockAfterKey)
        }
        if delay >= 0, defaults.object(forKey: BioLockDelay.preferredKey) == nil {
            defaults.set(delay, forKey: BioLockDelay.preferredKey)
        }
        lockAfterMinutes = delay
        // Cold launch starts locked when a delay is configured; a fresh
        // interactive login clears it (AppEnvironment calls markUnlocked).
        locked = delay >= 0
    }

    /// Change the lock delay. Enabling lock (anything other than Never)
    /// requires a successful auth when coming from Never.
    func setLockAfterMinutes(_ minutes: Int) async {
        let clamped: Int
        if minutes < 0 {
            clamped = BioLockDelay.never
        } else if minutes == 0 {
            clamped = BioLockDelay.immediately
        } else {
            clamped = min(max(minutes, 1), 60)
        }

        if clamped >= 0, lockAfterMinutes < 0 {
            guard await BiometricAuth.authenticate(reason: "Enable \(label) lock") else { return }
        }

        lockAfterMinutes = clamped
        UserDefaults.standard.set(clamped, forKey: Self.lockAfterKey)
        UserDefaults.standard.set(clamped >= 0, forKey: Self.legacyKey)
        if clamped >= 0 {
            UserDefaults.standard.set(clamped, forKey: BioLockDelay.preferredKey)
        }
        // Force a sync so the delay survives an immediate app update / terminate.
        UserDefaults.standard.synchronize()
        locked = false
        backgroundedAt = nil
    }

    /// Record background time; lock immediately when configured to.
    func noteBackgrounded() {
        backgroundedAt = Date()
        if lockAfterMinutes == BioLockDelay.immediately {
            locked = true
        }
    }

    /// Lock on return when the background grace period has elapsed.
    func maybeLockOnForeground() {
        guard lockAfterMinutes > 0 else { return }
        guard let at = backgroundedAt else { return }
        if Date().timeIntervalSince(at) >= Double(lockAfterMinutes * 60) {
            locked = true
        }
    }

    /// Cleared after a fresh password/MFA sign-in (already authenticated).
    func markUnlocked() { locked = false; backgroundedAt = nil }

    /// Prompt to unlock; on success reveals the app.
    func unlock() async {
        if await BiometricAuth.authenticate(reason: "Unlock FiHaven") {
            locked = false
            backgroundedAt = nil
        }
    }
}
