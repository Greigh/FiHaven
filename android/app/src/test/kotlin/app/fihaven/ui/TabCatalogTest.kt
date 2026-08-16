package app.fihaven.ui

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The tab catalog and the saved-order resolution behind the bottom bar and
 * the More menu. Pure list logic, so it belongs in a unit test — but it had
 * none, and it is what decides whether a tab is reachable at all.
 */
class TabCatalogTest {
    @Test fun everyTabHasAUniqueIdAndResolvesBack() {
        val ids = TabId.entries.map { it.id }
        assertEquals(ids.size, ids.toSet().size, "tab ids must be unique")
        TabId.entries.forEach { assertEquals(it, TabId.from(it.id)) }
        assertNull(TabId.from("nope"))
        assertNull(TabId.from(null))
    }

    @Test fun everyTabHasAVisibleLabel() {
        TabId.entries.forEach {
            assertTrue(it.label.isNotBlank(), "${it.id} needs a bar label")
            assertTrue(it.a11yLabel.isNotBlank(), "${it.id} needs an accessible label")
        }
        // Short bar labels exist because Material wraps long words in a 4–5
        // slot bar; the full name has to survive for screen readers.
        assertEquals("Subs", TabId.SUBSCRIPTIONS.label)
        assertEquals("Subscriptions", TabId.SUBSCRIPTIONS.a11yLabel)
        assertEquals("Worth", TabId.NETWORTH.label)
        assertEquals("Net Worth", TabId.NETWORTH.a11yLabel)
        // The More list is full-width and gets the unambiguous name; the bar
        // slot is narrow and gets the short one.
        assertEquals("Balances", TabId.BALANCES.label)
        assertEquals("Account Balances", TabId.BALANCES.a11yLabel)
    }

    @Test fun balancesIsInTheCatalogAndStartsUnderMore() {
        assertEquals(TabId.BALANCES, TabId.from("balances"))
        val (bottom, overflow) = resolveTabs(null)
        assertTrue(TabId.BALANCES !in bottom)
        assertTrue(TabId.BALANCES in overflow)
    }

    @Test fun theCatalogMatchesIOsOrder() {
        // The saved `tabs` list is synced between platforms, so the catalogs
        // have to agree on ids — an id only one platform knows is a tab that
        // silently disappears when the other saves the layout. Kept in step
        // with testTheCatalogMatchesAndroidsOrder in TabCatalogTests.swift.
        assertEquals(
            listOf(
                "dashboard", "bills", "cards", "loans", "payoff", "rewards",
                "income", "budget", "spending", "subscriptions", "calendar",
                "history", "networth", "balances",
            ),
            TabId.entries.map { it.id },
        )
    }

    @Test fun nothingSavedFallsBackToTheDefaultBar() {
        val (bottom, overflow) = resolveTabs(null)
        assertEquals(listOf(TabId.DASHBOARD, TabId.BILLS, TabId.CARDS, TabId.PAYOFF), bottom)
        // Everything the bar does not show has to be reachable from More.
        assertEquals(TabId.entries.filter { it !in bottom }, overflow)
    }

    @Test fun theSavedOrderIsHonoredAndTheRestFallToMore() {
        val (bottom, overflow) = resolveTabs(listOf("spending", "bills"))
        assertEquals(listOf(TabId.SPENDING, TabId.BILLS), bottom)
        assertTrue(TabId.DASHBOARD in overflow)
        // Overflow keeps catalog order, not saved order.
        assertEquals(overflow.sortedBy { TabId.entries.indexOf(it) }, overflow)
    }

    @Test fun unknownAndRepeatedIdsAreDropped() {
        // A tab removed in a later build, or a duplicated id, must not create a
        // phantom slot or a duplicate one.
        val (bottom, overflow) = resolveTabs(listOf("bills", "ghost", "bills", "cards"))
        assertEquals(listOf(TabId.BILLS, TabId.CARDS), bottom)
        assertTrue(overflow.none { it in bottom })
    }

    @Test fun everyTabIsReachableInEveryResolution() {
        // The invariant that matters: bottom + overflow is always the whole
        // catalog, so no tab can be stranded by a saved layout.
        listOf(
            null,
            emptyList(),
            listOf("bills"),
            listOf("ghost"),
            TabId.entries.map { it.id },
        ).forEach { saved ->
            val (bottom, overflow) = resolveTabs(saved)
            assertEquals(TabId.entries.toSet(), (bottom + overflow).toSet(), "saved=$saved")
            assertEquals(bottom.size + overflow.size, TabId.entries.size, "saved=$saved")
        }
    }

    @Test fun incomeIsInTheCatalogAndStartsUnderMore() {
        // Income became its own destination; the default bar is unchanged, so
        // it has to arrive in the More list rather than displacing a tab.
        assertEquals(TabId.INCOME, TabId.from("income"))
        val (bottom, overflow) = resolveTabs(null)
        assertTrue(TabId.INCOME !in bottom)
        assertTrue(TabId.INCOME in overflow)
    }
}
