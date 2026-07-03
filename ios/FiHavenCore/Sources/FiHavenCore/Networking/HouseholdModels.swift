import Foundation

/// Shared households (couples / families) — see server/routes/household.js.
/// Membership (Phase 1), the shared per-entity store (Phase 2), and the live
/// delta stream (Phase 3) all flow through these models.

public struct HouseholdMember: Codable, Equatable, Sendable {
    public var userId: Int
    public var email: String
    public var name: String?
    public var role: String          // "owner" | "member"
    public var joinedAt: Int64?
}

public struct HouseholdPendingInvite: Codable, Equatable, Sendable {
    public var id: Int
    public var email: String
    public var createdAt: Int64?
    public var expiresAt: Int64?
}

public struct HouseholdSummary: Codable, Equatable, Sendable {
    public var id: Int
    public var name: String
    public var ownerUserId: Int
    public var createdAt: Int64?
}

/// The member's full view of their household.
public struct HouseholdView: Codable, Equatable, Sendable {
    public var household: HouseholdSummary
    public var role: String
    public var memberCount: Int
    public var memberMax: Int
    public var members: [HouseholdMember]
    public var pendingInvites: [HouseholdPendingInvite]?
}

/// GET /api/household — my household (or nil) + whether I can create one.
public struct HouseholdInfo: Codable, Equatable, Sendable {
    public var household: HouseholdView?
    public var canCreate: Bool
    public var memberMax: Int
}

/// One shared item in the household store. `data` is the item's own JSON.
public struct SharedEntity: Codable, Equatable, Sendable {
    public var id: String
    public var kind: String          // "bill" | "card" | "goal" | ...
    public var data: JSONValue
    public var ownerUserId: Int
    public var updatedBy: Int?
    public var updatedAt: Int64?
    public var deleted: Bool?

    /// Stable identity across kinds, for SwiftUI lists.
    public var uid: String { "\(kind):\(id)" }
}

/// GET /api/household/data — the shared snapshot + a resume cursor (`seq`).
public struct HouseholdSharedData: Codable, Equatable, Sendable {
    public var householdId: Int?
    public var version: Int64?
    public var seq: Int64?
    public var entities: [SharedEntity]
}

public struct HouseholdRollupTotals: Codable, Equatable, Sendable {
    public var billsMonthly: Double
    public var cardDebt: Double
    public var goalsTarget: Double
}

public struct HouseholdMemberRollup: Codable, Equatable, Sendable {
    public var userId: Int
    public var name: String
    public var billsMonthly: Double
    public var cardDebt: Double
    public var goalsTarget: Double
}

/// GET /api/household/rollup — aggregated totals for shared entities.
public struct HouseholdRollup: Codable, Equatable, Sendable {
    public var householdId: Int?
    public var asOf: Int64?
    public var members: [HouseholdMember]
    public var totals: HouseholdRollupTotals
    public var byMember: [HouseholdMemberRollup]
    public var entityCount: [String: Int]
}

// ── Wire envelopes ───────────────────────────────────────────────
struct HouseholdEnvelope: Decodable { let household: HouseholdView }
struct SharedEntityEnvelope: Decodable { let entity: SharedEntity }
struct SharedEntityFrame: Decodable { let entity: SharedEntity }
struct ShareEntityBody: Encodable { let kind: String; let item: JSONValue }
struct UpdateEntityBody: Encodable { let item: JSONValue; let baseUpdatedAt: Int64? }
