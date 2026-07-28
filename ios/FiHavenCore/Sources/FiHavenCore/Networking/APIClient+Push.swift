import Foundation

public extension APIClient {
    private struct PushRegisterResponse: Decodable { let ready: Bool? }

    /// Claim this device's push token. Returns the server's `ready` flag — false
    /// when it has no push credentials for this platform, in which case the
    /// caller must keep scheduling local reminders instead of trusting push.
    /// An older server omits the field; treat that as ready so we don't
    /// double-notify against a deployment that is in fact sending pushes.
    @discardableResult
    func registerPushDevice(platform: String, token: String) async throws -> Bool {
        let req = try makeRequest(
            path: "api/push/register",
            method: .POST,
            body: AnyEncodable(["platform": platform, "token": token])
        )
        let data = try await send(req)
        let decoded = try? JSONDecoder().decode(PushRegisterResponse.self, from: data)
        return decoded?.ready ?? true
    }

    func unregisterPushDevice(token: String) async throws {
        let req = try makeRequest(
            path: "api/push/unregister",
            method: .POST,
            body: AnyEncodable(["token": token])
        )
        _ = try await send(req)
    }
}
