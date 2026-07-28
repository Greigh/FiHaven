import UIKit
import FiHavenCore

/// Receives the APNs device token and uploads it when push is enabled.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { @MainActor in PushRegistrar.shared.noteDeviceToken(token) }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("[Push] APNs registration failed:", error.localizedDescription)
    }
}

/// Keeps the latest APNs token and syncs it to the server when the user
/// opts into `settings.pushNotifications`.
///
/// The last registered token is persisted rather than held in memory. APNs
/// issues a new token on reinstall and on restore-to-a-new-device, and the
/// in-memory copy is empty on every cold start until APNs calls back — so
/// without a durable record the previous token is never retired (the server
/// accumulates every token the device has had) and switching push off right
/// after launch unregisters nothing, leaving notifications arriving after the
/// user opted out.
@MainActor
final class PushRegistrar {
    static let shared = PushRegistrar()

    private static let lastTokenKey = "fh_push_last_token"
    private static let registeredAtKey = "fh_push_registered_at"
    private static let serverReadyKey = "fh_push_server_ready"

    /// Re-claim the token this often even when it hasn't changed, so a token the
    /// server pruned after a delivery failure gets restored.
    private static let reregisterInterval: TimeInterval = 24 * 60 * 60

    /// How long a successful registration vouches for push. Past this we assume
    /// push is broken and let local reminders take over — see `healthy`.
    private static let staleInterval: TimeInterval = 7 * 24 * 60 * 60

    private var api: APIClient?
    private var enabled = false
    private var token: String?

    /// Called once a registration attempt settles. Registration is what decides
    /// whether push is `healthy`, and the local reminder schedule depends on
    /// that — so the schedule can only be settled after this runs, not
    /// concurrently with it.
    var onRegistrationSettled: (() -> Void)?

    /// The token the server currently has for this device, across launches.
    private var lastToken: String? {
        get { UserDefaults.standard.string(forKey: Self.lastTokenKey) }
        set {
            if let newValue {
                UserDefaults.standard.set(newValue, forKey: Self.lastTokenKey)
            } else {
                UserDefaults.standard.removeObject(forKey: Self.lastTokenKey)
            }
        }
    }

    /// Record a registration the server accepted, with what it said about its
    /// own ability to send. Cleared alongside the token when push goes off.
    private func setRegistered(ready: Bool?) {
        let defaults = UserDefaults.standard
        guard let ready else {
            defaults.removeObject(forKey: Self.registeredAtKey)
            defaults.removeObject(forKey: Self.serverReadyKey)
            return
        }
        defaults.set(Date().timeIntervalSince1970, forKey: Self.registeredAtKey)
        defaults.set(ready, forKey: Self.serverReadyKey)
    }

    private var registrationDue: Bool {
        let at = UserDefaults.standard.double(forKey: Self.registeredAtKey)
        guard at > 0 else { return true }
        return Date().timeIntervalSince1970 - at >= Self.reregisterInterval
    }

    /// Whether push can be trusted to deliver this device's reminders, which is
    /// what lets `NotificationScheduler` stand its local copies down.
    ///
    /// Nothing on the device ever observes an *arriving* push — an alert payload
    /// is displayed by iOS without waking the app, and there is no notification
    /// delegate here — so this is registration health, not delivery health: we
    /// hold a token the server accepted recently, and it told us it has APNs
    /// credentials. That covers the failure modes that persist silently (missing
    /// or expired server credentials, a registration that never succeeded, a
    /// token pruned after repeated delivery failures). It does not catch a
    /// single dropped push, which nothing on-device can see.
    var healthy: Bool {
        let defaults = UserDefaults.standard
        guard lastToken != nil, defaults.bool(forKey: Self.serverReadyKey) else { return false }
        let at = defaults.double(forKey: Self.registeredAtKey)
        return at > 0 && Date().timeIntervalSince1970 - at < Self.staleInterval
    }

    func configure(api: APIClient) {
        self.api = api
    }

    func setEnabled(_ on: Bool) {
        enabled = on
        if on {
            UIApplication.shared.registerForRemoteNotifications()
            Task { await sync() }
        } else {
            // Retire what the server actually holds, which after a cold start
            // is only known from the persisted copy.
            Task { await retireStored() }
        }
    }

    func noteDeviceToken(_ token: String) {
        self.token = token
        Task { await sync() }
    }

    func syncIfNeeded(settings: Settings) {
        enabled = settings.pushNotifications
        guard enabled else { return }
        UIApplication.shared.registerForRemoteNotifications()
        Task { await sync() }
    }

    func clear() {
        Task { await retireStored() }
        enabled = false
        self.token = nil
    }

    private func sync() async {
        guard enabled, let api, let token else { return }
        let stale = lastToken
        // An unchanged token still gets re-claimed once a day: the server drops
        // tokens that fail to deliver, and re-registering is how we'd find out
        // (and how the entry comes back). It also refreshes the `ready` flag and
        // the timestamp `healthy` leans on.
        guard token != stale || registrationDue else { return }
        if let stale, stale != token { await unregister(stale) }
        do {
            let ready = try await api.registerPushDevice(platform: "ios", token: token)
            // Recorded only once the server has it, so a failed registration
            // is retried on the next sync instead of being remembered as done.
            lastToken = token
            setRegistered(ready: ready)
        } catch {
            print("[Push] register failed:", error.localizedDescription)
        }
        onRegistrationSettled?()
    }

    private func retireStored() async {
        guard let stale = lastToken else { return }
        await unregister(stale)
        lastToken = nil
        setRegistered(ready: nil)
        onRegistrationSettled?()
    }

    private func unregister(_ token: String) async {
        guard let api else { return }
        do { try await api.unregisterPushDevice(token: token) }
        catch { print("[Push] unregister failed:", error.localizedDescription) }
    }
}
