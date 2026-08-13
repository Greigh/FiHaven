import Foundation

/// The admin console's API surface (`/api/admin/*`, server/routes/admin.js).
///
/// Every route here is mounted behind `requireAuth, requireAdmin` on the
/// server — the role lives on the user row and is seeded from ADMIN_EMAILS at
/// boot. Nothing in this file is a permission check: hiding the console for a
/// non-admin is a courtesy, and calling these anyway simply returns 403
/// `forbidden`.

// MARK: - Models

/// One row of the admin user list.
public struct AdminUser: Codable, Equatable, Sendable, Identifiable {
    public let id: Int
    public let email: String
    public let name: String?
    public let role: String
    public let createdAt: Double?
    /// A credential was presented — password, passkey, OAuth, or the signup.
    public let lastLoginAt: Double?
    /// How that sign-in was proven: password | passkey | oauth-* | signup.
    public let lastLoginMethod: String?
    /// Any authenticated request on an existing session (app open, sync).
    public let lastSeenAt: Double?
    /// Last time the saved data blob actually changed.
    public let lastUsedAt: Double?
    public let pro: Bool
    public let proSource: String?
    public let proPlan: String?
    public let proExpiresAt: Double?
    /// Whether this console handed out something it can pull back (a comp
    /// grant or promo). Store subscriptions are cancelled at the store.
    public let revocable: Bool
    public let suspended: Bool
    public let suspendedAt: Double?
    public let suspendedReason: String?

    public var isAdmin: Bool { role == "admin" }
}

public struct AdminUsersPage: Codable, Equatable, Sendable {
    public let users: [AdminUser]
    public let total: Int
    public let limit: Int
    public let page: Int
    public let pages: Int
    /// Comp plans this server accepts for a grant.
    public let plans: [String]
}

public struct AdminPromo: Codable, Equatable, Sendable, Identifiable {
    public var id: String { code }
    public let code: String
    public let kind: String
    /// Tier the code redeems into. nil for older codes that grant plain Pro.
    public let plan: String?
    public let grantDays: Int?
    public let maxRedemptions: Int?
    public let redeemedCount: Int
    public let expiresAt: Double?
    public let note: String?
    public let createdAt: Double?
    public let active: Bool
    /// Active, unexpired, and not exhausted — i.e. someone could use it now.
    public let redeemable: Bool
    public let expired: Bool
    public let exhausted: Bool
}

/// A rewards-catalog row as the admin editor sees it. Mirrors the public
/// `Rewards.CardPreset` but stays mutable and separately decoded, since the
/// editor round-trips values the calculator never writes.
public struct AdminCardPreset: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var issuer: String
    public var name: String
    public var network: String
    public var rewardBase: Double
    public var rewardCategories: [String: Double]
    public var rotatingRate: Double?
    public var rotatingPool: [String]?
    public var pointValue: Double?
    public var updatedAt: Double?

    public init(id: String = "", issuer: String = "", name: String = "", network: String = "",
                rewardBase: Double = 1, rewardCategories: [String: Double] = [:],
                rotatingRate: Double? = nil, rotatingPool: [String]? = nil,
                pointValue: Double? = nil, updatedAt: Double? = nil) {
        self.id = id; self.issuer = issuer; self.name = name; self.network = network
        self.rewardBase = rewardBase; self.rewardCategories = rewardCategories
        self.rotatingRate = rotatingRate; self.rotatingPool = rotatingPool
        self.pointValue = pointValue; self.updatedAt = updatedAt
    }

    public var label: String { "\(issuer) \(name)".trimmingCharacters(in: .whitespaces) }
}

public struct AdminPresetsPage: Codable, Equatable, Sendable {
    public let presets: [AdminCardPreset]
    public let issuers: [String]
    public let total: Int
    public let limit: Int
    public let page: Int
    public let pages: Int
}

// MARK: - Request bodies

private struct RoleBody: Encodable { let role: String }
private struct ProBody: Encodable {
    let grant: Bool
    let plan: String?
    let days: Int?
}
private struct SuspendBody: Encodable { let suspend: Bool; let reason: String? }
private struct DeleteUserBody: Encodable { let confirmEmail: String }
private struct PromoBody: Encodable {
    let code: String?
    let plan: String?
    let grantDays: Int
    let note: String?
    let maxRedemptions: Int?
}

private struct PromosResponse: Decodable { let promos: [AdminPromo] }
private struct PromoResponse: Decodable { let promo: AdminPromo }
private struct PresetResponse: Decodable { let preset: AdminCardPreset }
private struct SessionsClearedResponse: Decodable { let sessionsCleared: Int }
// `EntitlementResponse` already exists in BillingModels.swift; the Pro
// grant/revoke replies use that same `{ entitlement }` shape.

// MARK: - Client

public extension APIClient {
    // ── Users ────────────────────────────────────────────────────────

    /// `GET /api/admin/users` — paged, `q` matches email or name.
    func adminUsers(query: String = "", page: Int = 1, limit: Int = 25) async throws -> AdminUsersPage {
        var items = [URLQueryItem(name: "page", value: String(page)),
                     URLQueryItem(name: "limit", value: String(limit))]
        if !query.isEmpty { items.append(URLQueryItem(name: "q", value: query)) }
        let req = try makeRequest(path: "api/admin/users", method: .GET, query: items)
        return try decode(AdminUsersPage.self, from: try await send(req))
    }

    /// Promote or demote. The server refuses to demote the caller, so the
    /// last admin can't lock everyone out.
    func adminSetRole(userId: Int, admin: Bool) async throws {
        let req = try makeRequest(path: "api/admin/users/\(userId)/role", method: .POST,
                                  body: AnyEncodable(RoleBody(role: admin ? "admin" : "user")))
        try await send(req)
    }

    /// Grant a comp Pro entitlement. `days` overrides the plan's default
    /// length; it is ignored for `lifetime`.
    @discardableResult
    func adminGrantPro(userId: Int, plan: String, days: Int? = nil) async throws -> Entitlement {
        let body = ProBody(grant: true, plan: plan, days: days)
        let req = try makeRequest(path: "api/admin/users/\(userId)/pro", method: .POST,
                                  body: AnyEncodable(body))
        return try decode(EntitlementResponse.self, from: try await send(req)).entitlement
    }

    /// Pull back what this console handed out — the comp subscription and any
    /// live promo grant. Store subscriptions (Apple/Play/Paddle) are left
    /// alone; those are cancelled at the store.
    @discardableResult
    func adminRevokePro(userId: Int) async throws -> Entitlement {
        let body = ProBody(grant: false, plan: nil, days: nil)
        let req = try makeRequest(path: "api/admin/users/\(userId)/pro", method: .POST,
                                  body: AnyEncodable(body))
        return try decode(EntitlementResponse.self, from: try await send(req)).entitlement
    }

    /// Soft-suspend: blocks the app without deleting anything. Sessions are
    /// left intact so an open client shows the suspended screen — use
    /// `adminForceLogout` to actually kick devices off.
    func adminSuspend(userId: Int, suspend: Bool, reason: String? = nil) async throws {
        let req = try makeRequest(path: "api/admin/users/\(userId)/suspend", method: .POST,
                                  body: AnyEncodable(SuspendBody(suspend: suspend, reason: reason)))
        try await send(req)
    }

    /// Emails the user a password-reset link (same token flow as /forgot).
    func adminSendPasswordReset(userId: Int) async throws {
        let req = try makeRequest(path: "api/admin/users/\(userId)/reset-password", method: .POST)
        try await send(req)
    }

    /// Drops every session the user has. Returns how many were cleared.
    @discardableResult
    func adminForceLogout(userId: Int) async throws -> Int {
        let req = try makeRequest(path: "api/admin/users/\(userId)/logout", method: .POST)
        return try decode(SessionsClearedResponse.self, from: try await send(req)).sessionsCleared
    }

    /// Permanent delete. `confirmEmail` must match the account's address
    /// exactly or the server refuses — that echo is the safety catch.
    func adminDeleteUser(userId: Int, confirmEmail: String) async throws {
        let req = try makeRequest(path: "api/admin/users/\(userId)/delete", method: .POST,
                                  body: AnyEncodable(DeleteUserBody(confirmEmail: confirmEmail)))
        try await send(req)
    }

    // ── Promo codes ──────────────────────────────────────────────────

    func adminPromos(limit: Int = 50) async throws -> [AdminPromo] {
        let req = try makeRequest(path: "api/admin/promo", method: .GET,
                                  query: [URLQueryItem(name: "limit", value: String(limit))])
        return try decode(PromosResponse.self, from: try await send(req)).promos
    }

    /// Mints a `free_sub` code. An empty `code` lets the server generate one.
    @discardableResult
    func adminCreatePromo(code: String = "", plan: String? = nil, grantDays: Int,
                          note: String? = nil, maxRedemptions: Int? = nil) async throws -> AdminPromo {
        let body = PromoBody(code: code.isEmpty ? nil : code, plan: plan,
                             grantDays: grantDays, note: note, maxRedemptions: maxRedemptions)
        let req = try makeRequest(path: "api/admin/promo", method: .POST, body: AnyEncodable(body))
        return try decode(PromoResponse.self, from: try await send(req)).promo
    }

    /// Deactivates a code. Redemptions already made keep their grant.
    func adminDeactivatePromo(code: String) async throws {
        let path = "api/admin/promo/\(code.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? code)/deactivate"
        let req = try makeRequest(path: path, method: .POST)
        try await send(req)
    }

    // ── Rewards catalog (card presets) ───────────────────────────────

    func adminCardPresets(query: String = "", issuer: String = "",
                          page: Int = 1, limit: Int = 50) async throws -> AdminPresetsPage {
        var items = [URLQueryItem(name: "page", value: String(page)),
                     URLQueryItem(name: "limit", value: String(limit))]
        if !query.isEmpty { items.append(URLQueryItem(name: "q", value: query)) }
        if !issuer.isEmpty { items.append(URLQueryItem(name: "issuer", value: issuer)) }
        let req = try makeRequest(path: "api/admin/card-presets", method: .GET, query: items)
        return try decode(AdminPresetsPage.self, from: try await send(req))
    }

    /// Creates a preset. Omitting `id` lets the server slugify issuer + name.
    @discardableResult
    func adminCreateCardPreset(_ preset: AdminCardPreset) async throws -> AdminCardPreset {
        let req = try makeRequest(path: "api/admin/card-presets", method: .POST,
                                  body: AnyEncodable(preset))
        return try decode(PresetResponse.self, from: try await send(req)).preset
    }

    @discardableResult
    func adminUpdateCardPreset(_ preset: AdminCardPreset) async throws -> AdminCardPreset {
        let path = "api/admin/card-presets/\(preset.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? preset.id)"
        let req = try makeRequest(path: path, method: .PUT, body: AnyEncodable(preset))
        return try decode(PresetResponse.self, from: try await send(req)).preset
    }

    func adminDeleteCardPreset(id: String) async throws {
        let path = "api/admin/card-presets/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)"
        let req = try makeRequest(path: path, method: .DELETE)
        try await send(req)
    }
}
