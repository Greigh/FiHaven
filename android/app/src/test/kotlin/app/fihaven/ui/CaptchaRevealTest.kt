package app.fihaven.ui

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The rule that decides whether a person is asked to solve a captcha at all.
 *
 * It is a handful of comparisons over two signals, which is exactly why it
 * needs a test: nothing about it is visible from a screenshot, and every way
 * it can be wrong is a sign-in screen that either asks a person to tap a
 * widget Cloudflare never drew, or leaves them looking at a dead grey button.
 */
class CaptchaRevealTest {
    private fun resolve(
        current: CaptchaReveal = CaptchaReveal.Hidden,
        heightPx: Int = 0,
        deadlinePassed: Boolean = false,
        tokenArrived: Boolean = false,
    ) = CaptchaReveal.resolve(current, heightPx, deadlinePassed, tokenArrived)

    @Test fun nothingIsShownWhileTheChallengeIsQuietlySucceeding() {
        assertEquals(CaptchaReveal.Hidden, resolve())
    }

    @Test fun aDrawnWidgetIsCloudflareAskingForAPerson() {
        // The signal that matters most, and the one this whole design is built
        // on: in `interaction-only` mode a challenge that needs a tap renders
        // its real footprint, so the height is Cloudflare's own answer rather
        // than a guess about how long to wait.
        assertEquals(CaptchaReveal.Shown, resolve(heightPx = CaptchaReveal.DRAWN_HEIGHT_PX))
    }

    @Test fun aDrawnWidgetIsNotReloadedOutFromUnderTheUser() {
        // The challenge just put a widget on screen and is asking for it to be
        // finished. Reloading it here would throw away the one thing the user
        // is being asked to do — this is the bug the two cases exist to avoid.
        assertFalse(CaptchaReveal.Shown.reloadsChallenge)
    }

    @Test fun aTimeoutBringsUpAFreshChallenge() {
        // Nothing drawn, no token, no time left. The attempt that failed was
        // laid out in a box nobody painted into, so showing *it* would put an
        // empty panel in front of the user: it has to be a new one.
        assertEquals(CaptchaReveal.ShownFresh, resolve(deadlinePassed = true))
        assertTrue(CaptchaReveal.ShownFresh.reloadsChallenge)
    }

    @Test fun aRevealSurvivesTheChallengeItJustLoaded() {
        // The bug this whole design tripped over, measured on a real launch:
        // revealing loads a fresh challenge, which resets the clock and reports
        // its own height — so a rule that re-decided from those signals alone
        // took the widget away again the moment it appeared, and the sign-in
        // screen cycled reveal / hide once every twelve seconds forever. A
        // person reaching for a checkbox that is no longer there is what that
        // looks like from the outside.
        assertEquals(
            CaptchaReveal.ShownFresh,
            resolve(CaptchaReveal.ShownFresh, heightPx = 0, deadlinePassed = false),
        )
        assertEquals(
            CaptchaReveal.Shown,
            resolve(CaptchaReveal.Shown, heightPx = 0, deadlinePassed = false),
        )
        // Even when the new challenge reports an error instead of a height.
        assertEquals(
            CaptchaReveal.ShownFresh,
            resolve(CaptchaReveal.ShownFresh, heightPx = 65),
        )
    }

    @Test fun aRevealEndsOnlyOnAToken() {
        // Two ways out of a revealed widget, and only two: it succeeds, or the
        // person presses "Try again", which sets the state back to Hidden
        // itself. Nothing the challenge reports can take it away.
        assertEquals(
            CaptchaReveal.Hidden,
            resolve(CaptchaReveal.ShownFresh, heightPx = 0, deadlinePassed = true, tokenArrived = true),
        )
        assertEquals(
            CaptchaReveal.Hidden,
            resolve(CaptchaReveal.Shown, heightPx = 65, tokenArrived = true),
        )
    }

    @Test fun aTokenPutsTheWidgetAwayWhateverElseIsTrue() {
        // A solved challenge is the success case. Leaving a widget on screen
        // next to a form that is ready to submit is the wrong answer, and it is
        // one a height report arriving late can otherwise cause.
        assertEquals(CaptchaReveal.Hidden, resolve(heightPx = 0, deadlinePassed = true, tokenArrived = true))
        assertEquals(CaptchaReveal.Hidden, resolve(heightPx = 65, tokenArrived = true))
    }

    @Test fun aMeasurementRoundingErrorIsNotAChallengeAskingForATap() {
        // A stray pixel of slack in the page's own measurement must not reveal
        // a widget; that would put a captcha in front of every person on a
        // perfectly good sign-in.
        assertEquals(
            CaptchaReveal.Hidden,
            resolve(heightPx = CaptchaReveal.DRAWN_HEIGHT_PX - 1),
        )
    }

    @Test fun theInvisibleModeIsTheOneBothScreensAskFor() {
        // `interaction-only` is what keeps the widget off the sign-in form
        // while the challenge runs. Cloudflare's own default (`always`) is the
        // mistake this replaced: a widget drawn behind an opacity is visible to
        // the page, so a challenge needing a tap was asking a question nobody
        // was there to answer.
        assertEquals("interaction-only", TurnstileAppearance.InteractionOnly.dataAttribute)
    }

    @Test fun theDefaultModeIsLeftToCloudflare() {
        // Emitting an empty `data-appearance` would pin a mode the app did not
        // choose, and `data-appearance=""` is not what Cloudflare documents.
        assertEquals(null, TurnstileAppearance.Always.dataAttribute)
    }
}
