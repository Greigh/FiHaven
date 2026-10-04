import XCTest
@testable import FiHaven

/// The rule that decides whether a person is asked to solve a captcha at all.
///
/// It is a handful of comparisons over two signals, which is exactly why it
/// needs a test: nothing about it is visible from a screenshot, and every way
/// it can be wrong is a sign-in screen that either asks a person to tap a
/// widget Cloudflare never drew, or leaves them looking at a dead grey button.
final class CaptchaRevealTests: XCTestCase {

    /// The starting point for most of these: nothing on screen, a challenge
    /// running quietly, no clock pressure.
    private func resolve(
        _ current: CaptchaReveal = .hidden,
        height: CGFloat = 0,
        deadline: Bool = false,
        token: Bool = false
    ) -> CaptchaReveal {
        CaptchaReveal.resolve(current: current, height: height,
                              deadlinePassed: deadline, tokenArrived: token)
    }

    func testNothingIsShownWhileTheChallengeIsQuietlySucceeding() {
        XCTAssertEqual(resolve(), .hidden)
    }

    func testADrawnWidgetIsCloudflareAskingForAPerson() {
        // The signal that matters most, and the one this whole design is built
        // on: in `interaction-only` mode a challenge that needs a tap renders
        // its real footprint, so the height is Cloudflare's own answer rather
        // than a guess about how long to wait.
        XCTAssertEqual(resolve(height: CaptchaReveal.drawnHeight), .shown)
    }

    func testADrawnWidgetIsNotReloadedOutFromUnderTheUser() {
        // The challenge just put a widget on screen and is asking for it to be
        // finished. Reloading it here would throw away the one thing the user
        // is being asked to do — this is the bug the two cases exist to avoid.
        XCTAssertFalse(CaptchaReveal.shown.reloadsChallenge)
    }

    func testATimeoutBringsUpAFreshChallenge() {
        // Nothing drawn, no token, no time left. The attempt that failed was
        // laid out in a box nobody painted into, so showing *it* would put an
        // empty panel in front of the user: it has to be a new one.
        XCTAssertEqual(resolve(deadline: true), .shownFresh)
        XCTAssertTrue(CaptchaReveal.shownFresh.reloadsChallenge)
    }

    func testARevealSurvivesTheChallengeItJustLoaded() {
        // The bug this whole design tripped over, measured on a real launch:
        // revealing loads a fresh challenge, which resets the clock and reports
        // its own height — so a rule that re-decided from those signals alone
        // took the widget away again the moment it appeared, and the sign-in
        // screen cycled reveal / hide once every twelve seconds forever. A
        // person reaching for a checkbox that is no longer there is what that
        // looks like from the outside.
        XCTAssertEqual(resolve(.shownFresh, height: 0, deadline: false), .shownFresh)
        XCTAssertEqual(resolve(.shown, height: 0, deadline: false), .shown)
        // Even when the new challenge reports an error instead of a height.
        XCTAssertEqual(resolve(.shownFresh, height: 65), .shownFresh)
    }

    func testARevealEndsOnlyOnAToken() {
        // Two ways out of a revealed widget, and only two: it succeeds, or the
        // person presses "Try again", which sets the state back to hidden
        // itself. Nothing the challenge reports can take it away.
        XCTAssertEqual(resolve(.shownFresh, height: 0, deadline: true, token: true), .hidden)
        XCTAssertEqual(resolve(.shown, height: 65, token: true), .hidden)
    }

    func testATokenPutsTheWidgetAwayWhateverElseIsTrue() {
        // A solved challenge is the success case. Leaving a widget on screen
        // next to a form that is ready to submit is the wrong answer, and it is
        // one a height report arriving late can otherwise cause.
        XCTAssertEqual(resolve(height: 0, deadline: true, token: true), .hidden)
        XCTAssertEqual(resolve(height: 65, token: true), .hidden)
    }

    func testAMeasurementRoundingErrorIsNotAChallengeAskingForATap() {
        // A stray pixel of slack in the page's own measurement must not reveal a
        // widget; that would put a captcha in front of every person on a
        // perfectly good sign-in.
        XCTAssertEqual(resolve(height: CaptchaReveal.drawnHeight - 1), .hidden)
    }

    func testTheInvisibleModeIsTheOneTheSignInScreenAsksFor() {
        // `interaction-only` is what keeps the widget off the sign-in form while
        // the challenge runs. Cloudflare's own default (`always`) is the mistake
        // this replaced: a widget drawn behind an opacity is visible to the
        // page, so a challenge needing a tap was asking a question nobody was
        // there to answer.
        XCTAssertEqual(TurnstileAppearance.interactionOnly.dataAttribute, "interaction-only")
    }

    func testTheDefaultModeIsLeftToCloudflare() {
        // Emitting an empty `data-appearance` would pin a mode the app did not
        // choose, and `data-appearance=""` is not what Cloudflare documents.
        XCTAssertNil(TurnstileAppearance.always.dataAttribute)
    }
}
