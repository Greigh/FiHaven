import Foundation

public extension APIClient {
    func registerPushDevice(platform: String, token: String) async throws {
        let req = try makeRequest(
            path: "api/push/register",
            method: .POST,
            body: AnyEncodable(["platform": platform, "token": token])
        )
        _ = try await send(req)
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
