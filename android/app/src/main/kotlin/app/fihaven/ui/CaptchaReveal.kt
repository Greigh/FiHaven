package app.fihaven.ui

/**
 * What the sign-in screen should be showing for the security check.
 *
 * Two signals decide it, and they are not the same question:
 *
 * - **Cloudflare drew the widget.** In `interaction-only` mode a challenge
 *   that needs a person renders its real footprint, and the page reports that
 *   height. This is the challenge asking to be seen.
 * - **The deadline passed with nothing drawn.** A challenge that renders nothing
 *   and produces no token is not going to. This is our own timeout, and it
 *   exists because the other signal needs a network round trip that a captive
 *   portal or a dead connection will never make.
 *
 * Both lead to a real, tappable widget — the difference is only whether we
 * reload the challenge when we do. Cloudflare's own widget is already drawn and
 * already interactive, so showing it is enough; a challenge that rendered
 * nothing was laid out in a box nobody painted into, so it needs a fresh one in
 * space that can be seen.
 *
 * Mirrors iOS `CaptchaReveal` in `AuthView`'s sibling `TurnstileView.swift`.
 * Pure logic on purpose: it is the rule that decides whether a person is asked
 * to solve a captcha at all, and it is the part of that decision a unit test
 * can reach.
 */
enum class CaptchaReveal {
    /** Nothing on screen. The challenge is running out of sight. */
    Hidden,

    /** A real, interactive widget, without reloading the challenge. */
    Shown,

    /** A real, interactive widget, in a freshly loaded challenge. */
    ShownFresh;

    /** Whether reaching this state should load a new challenge. */
    val reloadsChallenge: Boolean get() = this == ShownFresh

    companion object {
        /**
         * Height above which the widget counts as having drawn itself. A few
         * points of slack: a rounding error in the page's measurement should
         * not be read as Cloudflare asking for a person.
         */
        const val DRAWN_HEIGHT_PX = 8

        /**
         * @param current what is on screen now. A reveal is *sticky*: once the
         *   widget is up it stays up until it produces a token or the person
         *   asks to try again.
         * @param heightPx the height the page last reported for the widget;
         *   zero (or near enough) means Cloudflare has drawn nothing.
         * @param deadlinePassed whether the attempt has run out of time.
         * @param tokenArrived whether the challenge already produced a token.
         */
        fun resolve(
            current: CaptchaReveal,
            heightPx: Int,
            deadlinePassed: Boolean,
            tokenArrived: Boolean,
        ): CaptchaReveal {
            // A token is the challenge succeeding, so there is nothing to ask
            // anyone to do — whatever the height or the clock says.
            if (tokenArrived) return Hidden
            // Already on screen, so it stays there. This is not a detail:
            // revealing loads a fresh challenge, which reports its own height
            // and can report an error, and a rule that re-decided from those
            // signals alone would take the widget away again the moment it
            // appeared — a person reaching for a checkbox that is no longer
            // there. And because the reload also restarts the clock, that cycle
            // repeated on every attempt, forever.
            if (current != Hidden) return current
            // Cloudflare's own decision, before ours. A challenge that has drawn
            // a widget is one that wants a tap, and reloading it would throw
            // away the widget it just put on screen.
            if (heightPx >= DRAWN_HEIGHT_PX) return Shown
            // Nothing drawn and no time left: the attempt is finished either
            // way, so a fresh challenge in visible space is all that is left.
            if (deadlinePassed) return ShownFresh
            return Hidden
        }
    }
}
