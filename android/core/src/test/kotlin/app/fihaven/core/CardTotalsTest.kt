package app.fihaven.core

import app.fihaven.core.logic.Schedule
import app.fihaven.core.model.Card
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Card debt and credit utilization — the two figures that treated loans as
 * cards, and that read the statement balance where the issuer reads the live
 * one. Mirrors the Swift checks in FiHavenCoreChecks and the web cases in
 * client/js/utils.test.js.
 */
class CardTotalsTest {
    private fun card(
        id: String,
        balance: Double,
        limit: Double = 0.0,
        currentBalance: Double? = null,
        type: String = "card",
        archived: Boolean = false,
    ) = Card(
        id = id, name = "Card $id", balance = balance, limit = limit,
        currentBalance = currentBalance, type = type, archived = archived,
    )

    // ── liveBalance ─────────────────────────────────────────────────
    @Test fun liveBalancePrefersTheTrackedCurrentBalance() {
        assertEquals(500.0, Schedule.liveBalance(card("1", balance = 300.0, currentBalance = 500.0)))
    }

    @Test fun liveBalanceFallsBackToTheStatement() {
        assertEquals(300.0, Schedule.liveBalance(card("1", balance = 300.0)))
    }

    @Test fun aZeroCurrentBalanceIsTrackedNotAbsent() {
        // 0.0 is a real "you paid it off" reading, not a missing value.
        assertEquals(0.0, Schedule.liveBalance(card("1", balance = 300.0, currentBalance = 0.0)))
    }

    // ── utilization ─────────────────────────────────────────────────
    @Test fun utilizationUsesTheLiveBalanceNotTheStatement() {
        // The bug this guards: a card charged since its statement closed read
        // 30% on the dashboard alert while its own row read 91%.
        val c = card("1", balance = 3000.0, limit = 10000.0, currentBalance = 9100.0)
        assertEquals(0.91, Schedule.utilization(c)!!, 1e-9)
    }

    @Test fun utilizationIsNullForALoan() {
        // A mortgage has a principal, not a revolving limit.
        assertNull(Schedule.utilization(card("1", balance = 250000.0, limit = 300000.0, type = "loan")))
    }

    @Test fun utilizationIsNullWithNoLimitSet() {
        assertNull(Schedule.utilization(card("1", balance = 500.0, limit = 0.0)))
    }

    @Test fun utilizationCanExceedOneWhenOverLimit() {
        // Not clamped here — callers that show a bar clamp for display, but the
        // sort and the alert want the true ratio.
        assertEquals(1.2, Schedule.utilization(card("1", balance = 1200.0, limit = 1000.0))!!, 1e-9)
    }

    // ── cardDebt ────────────────────────────────────────────────────
    @Test fun cardDebtExcludesLoans() {
        // The headline bug: loans live in the cards list, so a tracked mortgage
        // was landing in "card debt".
        val cards = listOf(
            card("1", balance = 500.0),
            card("2", balance = 250000.0, type = "loan"),
        )
        assertEquals(500.0, Schedule.cardDebt(cards))
    }

    @Test fun cardDebtExcludesArchivedCards() {
        val cards = listOf(card("1", balance = 500.0), card("2", balance = 900.0, archived = true))
        assertEquals(500.0, Schedule.cardDebt(cards))
    }

    @Test fun cardDebtUsesLiveBalances() {
        val cards = listOf(card("1", balance = 300.0, currentBalance = 800.0), card("2", balance = 200.0))
        assertEquals(1000.0, Schedule.cardDebt(cards))
    }

    @Test fun cardDebtOfNothingIsZero() {
        assertEquals(0.0, Schedule.cardDebt(emptyList()))
        assertEquals(0.0, Schedule.cardDebt(listOf(card("1", balance = 900.0, type = "loan"))))
    }
}
