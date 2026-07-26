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

    private var api: APIClient?
    private var enabled = false
    private var token: String?

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
        guard token != stale else { return }
        if let stale { await unregister(stale) }
        do {
            try await api.registerPushDevice(platform: "ios", token: token)
            // Recorded only once the server has it, so a failed registration
            // is retried on the next sync instead of being remembered as done.
            lastToken = token
        } catch {
            print("[Push] register failed:", error.localizedDescription)
        }
    }

    private func retireStored() async {
        guard let stale = lastToken else { return }
        await unregister(stale)
        lastToken = nil
    }

    private func unregister(_ token: String) async {
        guard let api else { return }
        do { try await api.unregisterPushDevice(token: token) }
        catch { print("[Push] unregister failed:", error.localizedDescription) }
    }
}
