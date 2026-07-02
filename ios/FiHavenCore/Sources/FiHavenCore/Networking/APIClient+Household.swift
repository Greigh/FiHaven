import Foundation

#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Shared-household endpoints (membership + selective sharing + live stream).
/// Bearer-authed like the rest of APIClient; the server skips CSRF for token
/// auth, so no CSRF header is needed here.
public extension APIClient {

    // ── Membership (Phase 1) ─────────────────────────────────────────
    func getHousehold() async throws -> HouseholdInfo {
        let req = try makeRequest(path: "api/household", method: .GET)
        return try decode(HouseholdInfo.self, from: try await send(req))
    }

    func createHousehold(name: String) async throws -> HouseholdView {
        let req = try makeRequest(path: "api/household", method: .POST, body: AnyEncodable(["name": name]))
        return try decode(HouseholdEnvelope.self, from: try await send(req)).household
    }

    func inviteToHousehold(email: String) async throws -> HouseholdView {
        let req = try makeRequest(path: "api/household/invite", method: .POST, body: AnyEncodable(["email": email]))
        return try decode(HouseholdEnvelope.self, from: try await send(req)).household
    }

    func acceptHouseholdInvite(token: String) async throws -> HouseholdView {
        let req = try makeRequest(path: "api/household/accept", method: .POST, body: AnyEncodable(["token": token]))
        return try decode(HouseholdEnvelope.self, from: try await send(req)).household
    }

    func revokeHouseholdInvite(id: Int) async throws -> HouseholdView {
        let req = try makeRequest(path: "api/household/invites/\(id)", method: .DELETE)
        return try decode(HouseholdEnvelope.self, from: try await send(req)).household
    }

    func removeHouseholdMember(userId: Int) async throws -> HouseholdView {
        let req = try makeRequest(path: "api/household/members/\(userId)", method: .DELETE)
        return try decode(HouseholdEnvelope.self, from: try await send(req)).household
    }

    func leaveHousehold() async throws {
        let req = try makeRequest(path: "api/household/leave", method: .POST)
        _ = try await send(req)
    }

    // ── Selective sharing (Phase 2) ──────────────────────────────────
    func getHouseholdSharedData() async throws -> HouseholdSharedData {
        let req = try makeRequest(path: "api/household/data", method: .GET)
        return try decode(HouseholdSharedData.self, from: try await send(req))
    }

    func householdRollup() async throws -> HouseholdRollup {
        let req = try makeRequest(path: "api/household/rollup", method: .GET)
        return try decode(HouseholdRollup.self, from: try await send(req))
    }

    func shareHouseholdEntity(kind: String, item: JSONValue) async throws -> SharedEntity {
        let req = try makeRequest(path: "api/household/entities", method: .POST,
                                  body: AnyEncodable(ShareEntityBody(kind: kind, item: item)))
        return try decode(SharedEntityEnvelope.self, from: try await send(req)).entity
    }

    func updateHouseholdEntity(kind: String, id: String, item: JSONValue, baseUpdatedAt: Int64?) async throws -> SharedEntity {
        let req = try makeRequest(path: "api/household/entities/\(kind)/\(id)", method: .PUT,
                                  body: AnyEncodable(UpdateEntityBody(item: item, baseUpdatedAt: baseUpdatedAt)))
        return try decode(SharedEntityEnvelope.self, from: try await send(req)).entity
    }

    func deleteHouseholdEntity(kind: String, id: String) async throws {
        let req = try makeRequest(path: "api/household/entities/\(kind)/\(id)", method: .DELETE)
        _ = try await send(req)
    }

    // ── Live stream (Phase 3) ────────────────────────────────────────
    /// Subscribes to the household SSE feed; yields each entity delta as it
    /// arrives. Replays anything after `since`, then streams live. The stream
    /// ends when the task is cancelled or the connection drops.
    func householdStream(since: Int64) -> AsyncThrowingStream<SharedEntity, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    // `since` rides as a path segment so we can reuse makeRequest
                    // (which adds the Bearer token + base URL) without query
                    // percent-encoding — no need for the client's private session.
                    var req = try makeRequest(path: "api/household/stream/\(since)", method: .GET)
                    req.timeoutInterval = TimeInterval(Int.max)
                    req.setValue("text/event-stream", forHTTPHeaderField: "Accept")

                    let (bytes, response) = try await URLSession.shared.bytes(for: req)
                    guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                        continuation.finish(throwing: APIError.http(status: status, code: nil))
                        return
                    }
                    for try await line in bytes.lines {
                        if Task.isCancelled { break }
                        guard line.hasPrefix("data:") else { continue } // skip id:/event:/comments
                        let json = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                        if let d = json.data(using: .utf8),
                           let frame = try? JSONDecoder().decode(SharedEntityFrame.self, from: d) {
                            continuation.yield(frame.entity)
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
