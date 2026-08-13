package app.fihaven.ui

import app.fihaven.core.model.FiHavenJson
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The Widgets-layout dashboard catalog. `dashboardWidgets` is shared with web
 * and iOS, and each platform renders the ids it supports and ignores the rest —
 * so this has to survive ids it has never heard of.
 */
class DashboardWidgetsTest {
    private fun settings(json: String) = FiHavenJson.parseToJsonElement(json).jsonObject

    @Test fun theCatalogIsWellFormed() {
        assertEquals(DashboardWidgets.catalog.size, DashboardWidgets.allIds.size)
        assertEquals(DashboardWidgets.allIds.size, DashboardWidgets.allIds.toSet().size, "ids must be unique")
        DashboardWidgets.catalog.forEach { (id, label) ->
            assertTrue(id.isNotBlank() && label.isNotBlank(), "$id needs a label")
            assertEquals(label, DashboardWidgets.label(id))
        }
        // An id from a newer platform build still renders something.
        assertEquals("somethingNew", DashboardWidgets.label("somethingNew"))
        // Every default has to exist in the catalog, or a fresh account opens
        // to a dashboard with missing widgets.
        assertTrue(DashboardWidgets.allIds.containsAll(DashboardWidgets.defaults))
    }

    @Test fun noSavedSelectionUsesTheDefaults() {
        assertEquals(DashboardWidgets.defaults, DashboardWidgets.enabled(settings("{}")))
        assertEquals(DashboardWidgets.defaults, DashboardWidgets.enabled(settings("""{"dashboardWidgets":[]}""")))
    }

    @Test fun theSavedOrderIsPreserved() {
        val s = settings("""{"dashboardWidgets":["goals","stats","networth"]}""")
        assertEquals(listOf("goals", "stats", "networth"), DashboardWidgets.enabled(s))
    }

    @Test fun unknownIdsFromAnotherPlatformAreIgnored() {
        // Web or iOS may enable a widget Android does not render yet. Dropping
        // it must not disturb the ones Android does know.
        val s = settings("""{"dashboardWidgets":["stats","webOnlyWidget","alerts"]}""")
        assertEquals(listOf("stats", "alerts"), DashboardWidgets.enabled(s))
    }

    @Test fun repeatedIdsRenderOnce() {
        val s = settings("""{"dashboardWidgets":["stats","stats","alerts","stats"]}""")
        assertEquals(listOf("stats", "alerts"), DashboardWidgets.enabled(s))
    }

    @Test fun aSelectionOfOnlyUnknownIdsRendersNothingRatherThanTheDefaults() {
        // Deliberate: the user's choice was "these", and none are supported
        // here. Silently substituting the defaults would misreport their
        // layout back to the other platforms on the next save.
        val s = settings("""{"dashboardWidgets":["ghostA","ghostB"]}""")
        assertEquals(emptyList(), DashboardWidgets.enabled(s))
    }
}
