package app.fihaven.core

import app.fihaven.core.logic.BalanceReview
import app.fihaven.core.model.Card
import app.fihaven.core.model.FiHavenJson
import app.fihaven.core.model.plaidBalanceProposals
import app.fihaven.core.model.plaidBalanceResolved
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Mirrors ios/FiHavenApp/Tests/BalanceProposalTests.swift. This used to live
 * inside AppViewModel, which needs an Android `Application` and so could not be
 * reached from a JVM unit test at all.
 */
class BalanceReviewTest {
    private val cards = listOf(
        Card(id = "c1", name = "Chase", balance = 2000.0, limit = 40_900.0, currentBalance = 2336.64),
        Card(id = "c2", name = "Auto loan", balance = 12_000.0, type = "loan"),
        Card(id = "c3", name = "No current", balance = 500.0, limit = 1000.0),
    )

    private fun settings(json: String) = FiHavenJson.parseToJsonElement(json).jsonObject

    private fun withProposals(vararg raw: String) = settings(
        """{"plaidBalanceProposals":[${raw.joinToString(",")}]}"""
    )

    @Test fun readsProposalsAndPairsThemWithTheirCard() {
        val s = withProposals("""{"id":"c1","proposedCurrent":2400,"limit":40900,"fingerprint":"f1"}""")
        val pending = BalanceReview.pending(s, cards)
        assertEquals(1, pending.size)
        val p = pending.single()
        assertEquals("Chase", p.name)                    // the card's name, not the raw id
        assertEquals(2400.0, p.proposedCurrent, 1e-9)
        assertFalse(p.isLoan)                            // a credit card belongs to the Cards tab
        // The comparison fields the review row renders.
        assertEquals(2336.64, p.currentBalance!!, 1e-9)  // the live balance Accept would replace
        assertEquals(40_900.0, p.currentLimit!!, 1e-9)
    }

    @Test fun fallsBackToTheStatementBalanceWhenNoCurrentIsTracked() {
        val s = withProposals("""{"id":"c3","proposedCurrent":600,"fingerprint":"f3"}""")
        val p = BalanceReview.pending(s, cards).single()
        assertEquals(500.0, p.currentBalance!!, 1e-9)    // liveBalance falls back to the statement
        assertNull(p.limit)                              // no limit reported
    }

    @Test fun aLoanProposalIsRoutedToTheLoansTab() {
        val s = withProposals("""{"id":"c2","proposedCurrent":11500,"fingerprint":"f2"}""")
        assertTrue(BalanceReview.pending(s, cards).single().isLoan)
    }

    @Test fun aProposalForAMissingCardStaysAnswerable() {
        val s = withProposals("""{"id":"gone","proposedCurrent":50,"fingerprint":"fx"}""")
        val p = BalanceReview.pending(s, cards).single()
        assertEquals("Card gone", p.name)                // named so the row can still be dismissed
        assertNull(p.currentBalance)                     // nothing to compare against
        assertNull(p.currentLimit)
        assertFalse(p.isLoan)                            // an orphan stays with Cards
    }

    @Test fun alreadyResolvedFingerprintsAreNotOfferedAgain() {
        val s = settings(
            """{"plaidBalanceProposals":[
                 {"id":"c1","proposedCurrent":2400,"fingerprint":"f1"},
                 {"id":"c3","proposedCurrent":600,"fingerprint":"f3"}
               ],
               "plaidBalanceResolved":[{"fingerprint":"f1","decision":"accept"}]}"""
        )
        assertEquals(listOf("f3"), BalanceReview.pending(s, cards).map { it.fingerprint })
    }

    @Test fun malformedProposalsAreSkippedRatherThanCrashing() {
        val s = withProposals(
            """{"proposedCurrent":100}""",                       // no fingerprint
            """{"id":"c1","fingerprint":"f-noamount"}""",         // no amount at all
            """{"id":"c1","proposedCurrent":2400,"fingerprint":"ok"}""",
        )
        assertEquals(listOf("ok"), BalanceReview.pending(s, cards).map { it.fingerprint })
    }

    @Test fun aNumericIdFromAnotherClientStillMatchesItsCard() {
        // Web writes ids as numbers for legacy records; native stores strings.
        val numeric = listOf(Card(id = "10", name = "Legacy", balance = 100.0))
        val s = withProposals("""{"id":10,"proposedCurrent":250,"fingerprint":"f10"}""")
        assertEquals("Legacy", BalanceReview.pending(s, numeric).single().name)
    }

    @Test fun theLegacyBalanceKeyIsStillUnderstood() {
        val s = withProposals("""{"id":"c1","balance":2400,"fingerprint":"f-legacy"}""")
        assertEquals(2400.0, BalanceReview.pending(s, cards).single().proposedCurrent, 1e-9)
    }

    @Test fun acceptWritesTheCurrentBalanceAndNeverTheStatement() {
        val s = withProposals("""{"id":"c1","proposedCurrent":2400,"limit":45000,"fingerprint":"f1"}""")
        val p = BalanceReview.pending(s, cards).single()

        val next = BalanceReview.applyToCards(cards, p)
        val card = next.first { it.id == "c1" }
        assertEquals(2400.0, card.currentBalance!!, 1e-9) // the live balance is updated
        assertEquals(2000.0, card.balance, 1e-9)          // the statement balance stays manual
        assertEquals(45_000.0, card.limit, 1e-9)          // a reported limit is applied
        // Every other card is untouched.
        assertEquals(cards.filter { it.id != "c1" }, next.filter { it.id != "c1" })
    }

    @Test fun acceptKeepsTheExistingLimitWhenTheBankReportsNone() {
        val s = withProposals("""{"id":"c1","proposedCurrent":2400,"fingerprint":"f1"}""")
        val p = BalanceReview.pending(s, cards).single()
        val card = BalanceReview.applyToCards(cards, p).first { it.id == "c1" }
        assertEquals(40_900.0, card.limit, 1e-9)
    }

    @Test fun acceptingAProposalWhoseCardVanishedChangesNothing() {
        val s = withProposals("""{"id":"gone","proposedCurrent":50,"fingerprint":"fx"}""")
        val p = BalanceReview.pending(s, cards).single()
        assertEquals(cards, BalanceReview.applyToCards(cards, p))
    }

    @Test fun resolvingRetiresTheRowAndRemembersTheAnswer() {
        val s = settings(
            """{"plaidBalanceProposals":[
                 {"id":"c1","proposedCurrent":2400,"fingerprint":"f1"},
                 {"id":"c3","proposedCurrent":600,"fingerprint":"f3"}
               ]}"""
        )
        val next = BalanceReview.resolve(s, "f1", "decline")
        // Only the answered one leaves the queue.
        assertEquals(listOf("f3"), next.plaidBalanceProposals.map {
            (it["fingerprint"] as JsonPrimitive).contentOrNull
        })
        val record = next.plaidBalanceResolved.single()
        assertEquals("f1", (record["fingerprint"] as JsonPrimitive).contentOrNull)
        assertEquals("decline", (record["decision"] as JsonPrimitive).contentOrNull)
        // And it is never offered again.
        assertEquals(listOf("f3"), BalanceReview.pending(next, cards).map { it.fingerprint })
    }

    @Test fun resolvedMemoryIsCappedSoItCannotGrowForever() {
        // The loop below derives its size from the constant, which makes it
        // blind to the value — pin it, and to the web client's cap, since the
        // same settings blob is written by all three platforms.
        assertEquals(200, BalanceReview.RESOLVED_CAP)

        // Every sync that changes a balance adds a fingerprint; without a cap
        // the settings blob grows without bound on every account.
        var s = settings("{}")
        repeat(BalanceReview.RESOLVED_CAP + 25) { i ->
            s = BalanceReview.resolve(s, "f$i", "decline")
        }
        val kept = s.plaidBalanceResolved
        assertEquals(BalanceReview.RESOLVED_CAP, kept.size)
        // The oldest are the ones dropped.
        assertEquals("f25", (kept.first()["fingerprint"] as JsonPrimitive).contentOrNull)
        assertEquals(
            "f${BalanceReview.RESOLVED_CAP + 24}",
            (kept.last()["fingerprint"] as JsonPrimitive).contentOrNull,
        )
    }

    @Test fun resolvingLeavesEveryOtherSettingAlone() {
        val s = settings("""{"theme":"dark","income":3000,"plaidBalanceProposals":[]}""")
        val next = BalanceReview.resolve(s, "f1", "accept")
        assertEquals("dark", (next["theme"] as JsonPrimitive).contentOrNull)
        assertEquals(3000.0, (next["income"] as JsonPrimitive).doubleOrNull())
    }

    private fun JsonPrimitive.doubleOrNull() = content.toDoubleOrNull()
}
