package app.fihaven.ui

import org.junit.jupiter.api.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The search predicate behind every major list (Bills, Cards, Loans,
 * Subscriptions). Pure, so it belongs in a unit test rather than an
 * instrumented one.
 */
class ListSearchTest {
    @Test fun anEmptyQueryMatchesEverything() {
        // The lists render unfiltered until you type — a blank box must not
        // hide every row.
        assertTrue(matchesListSearch("", "Chase Freedom"))
        assertTrue(matchesListSearch("   ", "Chase Freedom"))
    }

    @Test fun matchingIsCaseInsensitive() {
        assertTrue(matchesListSearch("chase", "Chase Freedom"))
        assertTrue(matchesListSearch("CHASE", "Chase Freedom"))
    }

    @Test fun matchesOnASubstringNotJustAPrefix() {
        assertTrue(matchesListSearch("freedom", "Chase Freedom"))
    }

    @Test fun anyHaystackCanMatch() {
        // Cards pass name, issuer and type — matching the issuer alone counts.
        assertTrue(matchesListSearch("amex", "Blue Cash", "Amex", "card"))
        assertFalse(matchesListSearch("citi", "Blue Cash", "Amex", "card"))
    }

    @Test fun nullHaystacksAreSkippedNotMatched() {
        // Issuer is optional; a null must not count as a hit.
        assertFalse(matchesListSearch("amex", null, null))
        assertTrue(matchesListSearch("blue", "Blue Cash", null))
    }

    @Test fun theQueryIsTrimmedBeforeMatching() {
        // Trailing spaces come free with autocorrect on a phone keyboard.
        assertTrue(matchesListSearch("  chase  ", "Chase Freedom"))
    }

    @Test fun noHaystacksNeverMatchesANonEmptyQuery() {
        assertFalse(matchesListSearch("chase"))
    }
}
