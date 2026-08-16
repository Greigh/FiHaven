package app.fihaven.core.logic

import app.fihaven.core.model.Account
import app.fihaven.core.model.Card
import app.fihaven.core.model.plaidAccountProposals
import app.fihaven.core.model.plaidBalanceProposals
import app.fihaven.core.model.plaidBalanceResolved
import app.fihaven.core.model.withSetting
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put

/**
 * The bank-balance review queue: reading stored proposals back out, and the
 * state changes behind Accept / Decline.
 *
 * Manual-first, like the server that writes these: accepting a suggestion sets
 * a card's **current** balance (and its limit, when the bank reports one) and
 * never its statement balance. Both answers are remembered by fingerprint, so
 * the same figure is not offered twice.
 *
 * Lives in core rather than the ViewModel so it can be tested without an
 * Android `Application`. Mirrors AppStore.pendingBalanceProposals /
 * accept / declineBalanceProposal on iOS.
 */
object BalanceReview {
    /** How many answered fingerprints to keep. Matches the web client. */
    const val RESOLVED_CAP = 200

    data class Proposal(
        val cardId: String,
        val name: String,
        val proposedCurrent: Double,
        val limit: Double?,
        /** The card's live balance today — what accepting would replace. Null
         *  when the card is gone, leaving nothing to compare against. */
        val currentBalance: Double?,
        /** The limit on file, so the review can stay quiet about one that
         *  hasn't moved. Null when the card is gone or has no limit set. */
        val currentLimit: Double?,
        val fingerprint: String,
        /** Which tab owns this proposal. A matched loan account used to surface
         *  under Credit Cards and never under Loans. A proposal whose card is
         *  gone stays with Cards so it remains answerable. */
        val isLoan: Boolean = false,
    )

    /** Unanswered proposals, paired with the card each one names. */
    fun pending(settings: JsonObject, cards: List<Card>): List<Proposal> {
        val resolved = settings.plaidBalanceResolved
            .mapNotNull { (it["fingerprint"] as? JsonPrimitive)?.contentOrNull }
            .toSet()
        return settings.plaidBalanceProposals.mapNotNull { raw ->
            val fp = (raw["fingerprint"] as? JsonPrimitive)?.contentOrNull ?: return@mapNotNull null
            if (fp in resolved) return@mapNotNull null
            // Ids arrive as a string or a number depending on which client wrote them.
            val idEl = raw["id"] as? JsonPrimitive ?: return@mapNotNull null
            val cardId = idEl.contentOrNull
                ?: idEl.doubleOrNull?.toInt()?.toString()
                ?: return@mapNotNull null
            val proposed = (raw["proposedCurrent"] as? JsonPrimitive)?.doubleOrNull
                ?: (raw["balance"] as? JsonPrimitive)?.doubleOrNull   // legacy key
                ?: return@mapNotNull null
            val card = cards.firstOrNull { it.id.toString() == cardId }
            Proposal(
                cardId = cardId,
                name = card?.name ?: "Card $cardId",
                proposedCurrent = proposed,
                limit = (raw["limit"] as? JsonPrimitive)?.doubleOrNull,
                currentBalance = card?.let { Schedule.liveBalance(it) },
                currentLimit = card?.limit?.takeIf { it > 0 },
                fingerprint = fp,
                isLoan = card?.type == "loan",
            )
        }
    }

    /**
     * The card list with an accepted proposal written in. Only the *current*
     * balance moves — the statement balance is the user's to set — plus the
     * limit when the bank reported one. A proposal whose card is gone changes
     * nothing.
     */
    fun applyToCards(cards: List<Card>, p: Proposal): List<Card> = cards.map { c ->
        if (c.id.toString() != p.cardId) c
        else c.copy(currentBalance = p.proposedCurrent, limit = p.limit ?: c.limit)
    }

    /**
     * Settings with [fingerprint] recorded as answered and dropped from the
     * queue, so the same figure is never offered again until the bank changes
     * it. [decision] is "accept" or "decline".
     */
    fun resolve(settings: JsonObject, fingerprint: String, decision: String): JsonObject {
        val remaining = settings.plaidBalanceProposals.filter {
            (it["fingerprint"] as? JsonPrimitive)?.contentOrNull != fingerprint
        }
        return rememberResolved(settings, fingerprint, decision)
            .withSetting("plaidBalanceProposals", buildJsonArray { remaining.forEach { add(it) } })
    }

    // ── Asset accounts (the Balances tab) ────────────────────────────
    // The same contract against `accounts` instead of `cards`: a bank balance
    // is only ever a suggestion, and each answer is remembered by fingerprint.
    // The resolved list is shared with the card queue; account fingerprints
    // carry an "acct:" prefix so the two can't collide.

    data class AccountProposal(
        val accountId: String,
        val name: String,
        val proposedBalance: Double,
        /** The balance on file today — what accepting would replace. Null when
         *  the account is gone, leaving nothing to compare against. */
        val currentBalance: Double?,
        val fingerprint: String,
    )

    /** Unanswered account proposals, paired with the account each one names. */
    fun pendingAccounts(settings: JsonObject, accounts: List<Account>): List<AccountProposal> {
        val resolved = settings.plaidBalanceResolved
            .mapNotNull { (it["fingerprint"] as? JsonPrimitive)?.contentOrNull }
            .toSet()
        return settings.plaidAccountProposals.mapNotNull { raw ->
            val fp = (raw["fingerprint"] as? JsonPrimitive)?.contentOrNull ?: return@mapNotNull null
            if (fp in resolved) return@mapNotNull null
            val idEl = raw["id"] as? JsonPrimitive ?: return@mapNotNull null
            val acctId = idEl.contentOrNull
                ?: idEl.doubleOrNull?.toInt()?.toString()
                ?: return@mapNotNull null
            val proposed = (raw["proposedBalance"] as? JsonPrimitive)?.doubleOrNull
                ?: return@mapNotNull null
            val account = accounts.firstOrNull { it.id == acctId }
            AccountProposal(
                accountId = acctId,
                name = account?.name?.takeIf { it.isNotBlank() } ?: "Account $acctId",
                proposedBalance = proposed,
                currentBalance = account?.balance,
                fingerprint = fp,
            )
        }
    }

    /**
     * The account list with an accepted proposal written in. Only `balance`
     * moves — the name and type are the user's own labels. A proposal whose
     * account is gone changes nothing.
     */
    fun applyToAccounts(accounts: List<Account>, p: AccountProposal): List<Account> =
        accounts.map { a -> if (a.id != p.accountId) a else a.copy(balance = p.proposedBalance) }

    /** [resolve], for the account queue. */
    fun resolveAccount(settings: JsonObject, fingerprint: String, decision: String): JsonObject {
        val remaining = settings.plaidAccountProposals.filter {
            (it["fingerprint"] as? JsonPrimitive)?.contentOrNull != fingerprint
        }
        return rememberResolved(settings, fingerprint, decision)
            .withSetting("plaidAccountProposals", buildJsonArray { remaining.forEach { add(it) } })
    }

    // Record an answer in the shared, capped fingerprint list. Both queues go
    // through this so one can never trim the other's history differently.
    private fun rememberResolved(settings: JsonObject, fingerprint: String, decision: String): JsonObject {
        val resolved = (settings.plaidBalanceResolved + buildJsonObject {
            put("fingerprint", fingerprint)
            put("decision", decision)
        }).takeLast(RESOLVED_CAP)
        return settings.withSetting("plaidBalanceResolved", buildJsonArray { resolved.forEach { add(it) } })
    }
}
