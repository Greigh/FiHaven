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
@MainActor
final class PushRegistrar {
    static let shared = PushRegistrar()

    private var api: APIClient?
    private var enabled = false
    private var token: String?

    func configure(api: APIClient) {
        self.api = api
    }

    func setEnabled(_ on: Bool) {
        enabled = on
        if on {
            UIApplication.shared.registerForRemoteNotifications()
            Task { await sync() }
        } else if let token {
            Task { await unregister(token) }
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
        if let token { Task { await unregister(token) } }
        enabled = false
        self.token = nil
    }

    private func sync() async {
        guard enabled, let api, let token else { return }
        do { try await api.registerPushDevice(platform: "ios", token: token) }
        catch { print("[Push] register failed:", error.localizedDescription) }
    }

    private func unregister(_ token: String) async {
        guard let api else { return }
        do { try await api.unregisterPushDevice(token: token) }
        catch { print("[Push] unregister failed:", error.localizedDescription) }
    }
}
