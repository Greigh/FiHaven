import XCTest
import FiHavenCore
@testable import FiHaven

/// The bank-balance review queue: reading stored proposals back out, and what
/// Accept / Decline do to the card and to the resolved memory. All of this
/// lives in the app module, so FiHavenCoreChecks cannot reach it.
@MainActor
final class BalanceProposalTests: XCTestCase {
    private func proposal(
        id: String, current: Double, limit: Double? = nil, fingerprint: String
    ) -> [String: JSONValue] {
        var o: [String: JSONValue] = [
            "id": .string(id),
            "proposedCurrent": .number(current),
            "fingerprint": .string(fingerprint),
        ]
        if let limit { o["limit"] = .number(limit) }
        return o
    }

    private func seed(_ store: AppStore) {
        store.mutate { data in
            data.cards = [
                Card(id: "c1", name: "Chase", balance: 2000, limit: 40900, currentBalance: 2336.64),
                Card(id: "c2", name: "Auto loan", balance: 12000, type: "loan"),
                Card(id: "c3", name: "No current", balance: 500, limit: 1000),
            ]
        }
    }

    func testReadsProposalsAndPairsThemWithTheirCard() {
        let store = TestStore.make()
        seed(store)
        store.mutate {
            $0.settings.plaidBalanceProposals = [
                proposal(id: "c1", current: 2400, limit: 40900, fingerprint: "f1"),
            ]
        }

        let pending = store.pendingBalanceProposals()
        XCTAssertEqual(pending.count, 1)
        let p = pending[0]
        XCTAssertEqual(p.name, "Chase", "the card's name, not the raw id")
        XCTAssertEqual(p.proposedCurrent, 2400)
        XCTAssertFalse(p.isLoan, "a credit card belongs to the Cards tab")
        // The comparison fields the review row renders.
        XCTAssertEqual(p.currentBalance, 2336.64, "the live balance Accept would replace")
        XCTAssertEqual(p.currentLimit, 40900)
    }

    func testFallsBackToTheStatementBalanceWhenNoCurrentIsTracked() {
        let store = TestStore.make()
        seed(store)
        store.mutate {
            $0.settings.plaidBalanceProposals = [proposal(id: "c3", current: 600, fingerprint: "f3")]
        }
        let p = store.pendingBalanceProposals()[0]
        XCTAssertEqual(p.currentBalance, 500, "liveBalance falls back to the statement")
        XCTAssertNil(p.limit, "no limit reported")
    }

    func testALoanProposalIsRoutedToTheLoansTab() {
        let store = TestStore.make()
        seed(store)
        store.mutate {
            $0.settings.plaidBalanceProposals = [proposal(id: "c2", current: 11500, fingerprint: "f2")]
        }
        XCTAssertTrue(store.pendingBalanceProposals()[0].isLoan)
    }

    func testAProposalForAMissingCardStaysAnswerable() {
        let store = TestStore.make()
        seed(store)
        store.mutate {
            $0.settings.plaidBalanceProposals = [proposal(id: "gone", current: 50, fingerprint: "fx")]
        }
        let p = store.pendingBalanceProposals()[0]
        XCTAssertEqual(p.name, "Card gone", "named so the row can still be dismissed")
        XCTAssertNil(p.currentBalance, "nothing to compare against")
        XCTAssertFalse(p.isLoan, "an orphan stays with Cards")
    }

    func testAlreadyResolvedFingerprintsAreNotOfferedAgain() {
        let store = TestStore.make()
        seed(store)
        store.mutate {
            $0.settings.plaidBalanceProposals = [
                proposal(id: "c1", current: 2400, fingerprint: "f1"),
                proposal(id: "c3", current: 600, fingerprint: "f3"),
            ]
            $0.settings.plaidBalanceResolved = [["fingerprint": .string("f1")]]
        }
        XCTAssertEqual(store.pendingBalanceProposals().map(\.fingerprint), ["f3"])
    }

    func testAcceptWritesTheCurrentBalanceAndNeverTheStatement() {
        let store = TestStore.make()
        seed(store)
        store.mutate {
            $0.settings.plaidBalanceProposals = [
                proposal(id: "c1", current: 2400, limit: 45000, fingerprint: "f1"),
            ]
        }
        store.acceptBalanceProposal(store.pendingBalanceProposals()[0])

        let card = store.data.cards.first { $0.id == "c1" }!
        XCTAssertEqual(card.currentBalance, 2400, "the live balance is updated")
        XCTAssertEqual(card.balance, 2000, "the statement balance stays manual")
        XCTAssertEqual(card.limit, 45000, "a reported limit is applied")
        // Answered once, gone from the queue and remembered.
        XCTAssertTrue(store.pendingBalanceProposals().isEmpty)
        XCTAssertEqual(store.data.settings.plaidBalanceResolved.count, 1)
    }

    func testDeclineRemembersTheFigureWithoutTouchingTheCard() {
        let store = TestStore.make()
        seed(store)
        store.mutate {
            $0.settings.plaidBalanceProposals = [proposal(id: "c1", current: 2400, fingerprint: "f1")]
        }
        store.declineBalanceProposal(store.pendingBalanceProposals()[0])

        let card = store.data.cards.first { $0.id == "c1" }!
        XCTAssertEqual(card.currentBalance, 2336.64, "the card is untouched")
        XCTAssertTrue(store.pendingBalanceProposals().isEmpty, "and it is not asked again")
        XCTAssertEqual(
            store.data.settings.plaidBalanceResolved.first?["decision"]?.asString, "decline"
        )
    }

    func testAcceptingAProposalWhoseCardVanishedJustClearsIt() {
        let store = TestStore.make()
        seed(store)
        store.mutate {
            $0.settings.plaidBalanceProposals = [proposal(id: "gone", current: 50, fingerprint: "fx")]
        }
        let before = store.data.cards
        store.acceptBalanceProposal(store.pendingBalanceProposals()[0])
        XCTAssertEqual(store.data.cards, before, "no card to write to, none changed")
        XCTAssertTrue(store.pendingBalanceProposals().isEmpty, "the row is retired either way")
    }
}
