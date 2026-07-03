package app.fihaven.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** Shared households (couples / families) — mirrors the Swift HouseholdModels.
 *  Membership (Phase 1), the shared per-entity store (Phase 2), and the live
 *  delta stream (Phase 3) all flow through these types. */

@Serializable
data class HouseholdMember(
    val userId: Int,
    val email: String,
    val name: String? = null,
    val role: String,            // "owner" | "member"
    val joinedAt: Long? = null,
)

@Serializable
data class HouseholdPendingInvite(
    val id: Int,
    val email: String,
    val createdAt: Long? = null,
    val expiresAt: Long? = null,
)

@Serializable
data class HouseholdSummary(
    val id: Int,
    val name: String,
    val ownerUserId: Int,
    val createdAt: Long? = null,
)

@Serializable
data class HouseholdView(
    val household: HouseholdSummary,
    val role: String,
    val memberCount: Int,
    val memberMax: Int,
    val members: List<HouseholdMember> = emptyList(),
    val pendingInvites: List<HouseholdPendingInvite>? = null,
)

/** GET /api/household. */
@Serializable
data class HouseholdInfo(
    val household: HouseholdView? = null,
    val canCreate: Boolean = false,
    val memberMax: Int = 0,
)

/** One shared item; `data` is the item's own JSON. */
@Serializable
data class SharedEntity(
    val id: String,
    val kind: String,            // "bill" | "card" | "goal" | ...
    val data: JsonElement,
    val ownerUserId: Int,
    val updatedBy: Int? = null,
    val updatedAt: Long? = null,
    val deleted: Boolean? = null,
) {
    /** Stable identity across kinds, for list diffing. */
    val uid: String get() = "$kind:$id"
}

/** GET /api/household/data — the shared snapshot + a resume cursor (`seq`). */
@Serializable
data class HouseholdSharedData(
    val householdId: Int? = null,
    val version: Long? = null,
    val seq: Long? = null,
    val entities: List<SharedEntity> = emptyList(),
)

@Serializable
data class HouseholdRollupTotals(
    val billsMonthly: Double = 0.0,
    val cardDebt: Double = 0.0,
    val goalsTarget: Double = 0.0,
)

@Serializable
data class HouseholdRollupMember(
    val userId: Int,
    val name: String? = null,
    val email: String? = null,
    val role: String? = null,
    val billsMonthly: Double = 0.0,
    val cardDebt: Double = 0.0,
    val goalsTarget: Double = 0.0,
)

@Serializable
data class HouseholdRollup(
    val householdId: Int? = null,
    val asOf: Long? = null,
    val totals: HouseholdRollupTotals? = null,
    val byMember: List<HouseholdRollupMember> = emptyList(),
    val entityCount: Map<String, Int> = emptyMap(),
)

/** One SSE delta frame: `{ "seq": N, "entity": {…} }`. */
@Serializable
data class HouseholdStreamFrame(val seq: Long? = null, val entity: SharedEntity)

// ── Wire envelopes / bodies ──────────────────────────────────────
@Serializable internal data class HouseholdEnvelope(val household: HouseholdView)
@Serializable internal data class SharedEntityEnvelope(val entity: SharedEntity)
@Serializable internal data class CreateHouseholdBody(val name: String)
@Serializable internal data class HouseholdInviteBody(val email: String)
@Serializable internal data class HouseholdAcceptBody(val token: String)
@Serializable internal data class ShareEntityBody(val kind: String, val item: JsonElement)
