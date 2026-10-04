import XCTest
import Security

@testable import FiHaven

/// The two sentences a refused token write produces, checked apart from the
/// views that show them.
///
/// A log line is invisible to the person who has to act on it, and the cost
/// lands a launch later — so these two strings are the whole feature, and the
/// only way they rot is quietly: a rewrite that drops the consequence, or a
/// status the mapping forgot, and no test in the store's suite can see either.
@MainActor
final class SessionSaveNoticeTests: XCTestCase {

    /// A write that landed is the ordinary case, and it has nothing to say. This
    /// is the branch that keeps the banner off the screen on every ordinary
    /// sign-in, so it is worth a test of its own.
    func testASavedSessionHasNothingToSay() {
        XCTAssertNil(AppEnvironment.sessionSaveNotice(forWriteStatus: errSecSuccess))
    }

    /// The sentence has to name the cost, not just the fact. "The keychain
    /// refused it" is a log line; the thing a user can act on is that they will
    /// be asked to sign in again next time.
    func testARefusedWriteSaysWhatItCosts() throws {
        let notice = try XCTUnwrap(AppEnvironment.sessionSaveNotice(forWriteStatus: errSecAuthFailed))
        XCTAssertTrue(notice.contains("couldn't store"),
                      "it has to say the session was not saved: \(notice)")
        XCTAssertTrue(notice.lowercased().contains("sign in again"),
                      "it has to say what happens at the next launch: \(notice)")
    }

    /// Every status the keychain can answer a write with, and the ones measured
    /// on this Mac. The mapping is a single `!= errSecSuccess` test, so a status
    /// that slipped past would leave a *silent* sign-out — the exact failure
    /// these sentences exist to prevent.
    func testAnyRefusalIsExplained() {
        let statuses: [OSStatus] = [
            errSecAuthFailed,          // -25293  an ACL refused this build
            errSecUserCanceled,        // -128
            errSecInteractionNotAllowed, // -25308 a locked keychain
            errSecNotAvailable,        // -25291
            errSecMissingEntitlement,  // -34018 unsigned
            -25244,                    // errSecInteractionRequired, measured on a
                                      // foreign item's delete
        ]
        for status in statuses {
            XCTAssertNotNil(AppEnvironment.sessionSaveNotice(forWriteStatus: status),
                            "status \(status) would sign the user out with nothing said")
        }
    }

    /// The next launch's sentence is the one a user is looking at when they
    /// decide whether to report a problem, so it carries the status and says
    /// plainly why they are on a sign-in screen.
    func testTheNextLaunchExplanationCarriesTheStatusAndTheReason() {
        let text = AppEnvironment.writeRefusalExplanation(forStatus: errSecAuthFailed)
        XCTAssertTrue(text.contains("\(errSecAuthFailed)"),
                      "the status is what a report can be matched against: \(text)")
        XCTAssertTrue(text.contains("signed out"),
                      "it has to connect the refusal to the screen they are looking at: \(text)")
    }

    /// Two launches, two audiences, and the same fact. If the two sentences ever
    /// become one, it is a decision worth making on purpose — so this fails.
    func testTheTwoSentencesAreNotTheSameSentence() {
        let now = AppEnvironment.sessionSaveNotice(forWriteStatus: errSecAuthFailed)
        let nextLaunch = AppEnvironment.writeRefusalExplanation(forStatus: errSecAuthFailed)
        XCTAssertNotEqual(now, nextLaunch)
    }
}
