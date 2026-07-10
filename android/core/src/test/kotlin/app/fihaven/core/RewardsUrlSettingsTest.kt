package app.fihaven.core

import app.fihaven.core.model.Card
import app.fihaven.core.model.FiHavenJson
import app.fihaven.core.model.plaidUpdateBalances
import app.fihaven.core.model.plaidUpdatePurchases
import kotlinx.serialization.json.JsonObject
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * `Card` is a fixed data class: a field it doesn't declare is dropped when the
 * app re-encodes and PUTs the whole record back. These pin the two fields added
 * for the rewards-link flow and the bank-import toggle, both of which the web
 * writes and the natives must not silently discard.
 */
class RewardsUrlSettingsTest {

    private fun card(json: String): Card =
        FiHavenJson.decodeFromString(Card.serializer(), json)

    private fun encode(c: Card): String =
        FiHavenJson.encodeToString(Card.serializer(), c)

    @Test fun `rewardsUrl survives a native round-trip`() {
        val original = Card(id = "10", name = "Amex", rewardsUrl = "https://amex.com/offers")
        val rt = card(encode(original))
        assertEquals("https://amex.com/offers", rt.rewardsUrl)
    }

    @Test fun `rewardsUrl decodes from web-written json and is re-encoded`() {
        val fromWeb = card("""{"id":"11","name":"Bilt","rewardsUrl":"https://bilt.com/rewards"}""")
        assertEquals("https://bilt.com/rewards", fromWeb.rewardsUrl)
        assertTrue(encode(fromWeb).contains("rewardsUrl"))
    }

    @Test fun `absent rewardsUrl stays null`() {
        // The UI keys "Add rewards link" vs "Change rewards link" on null.
        assertNull(card("""{"id":"12","name":"Z"}""").rewardsUrl)
    }

    @Test fun `plaid opt-ins default off and are independent`() {
        val empty = FiHavenJson.decodeFromString(JsonObject.serializer(), "{}")
        assertFalse(empty.plaidUpdateBalances)
        assertFalse(empty.plaidUpdatePurchases)

        val purchasesOnly = FiHavenJson.decodeFromString(
            JsonObject.serializer(), """{"plaidUpdatePurchases":true}""",
        )
        assertTrue(purchasesOnly.plaidUpdatePurchases)
        assertFalse(purchasesOnly.plaidUpdateBalances)

        val balancesOnly = FiHavenJson.decodeFromString(
            JsonObject.serializer(), """{"plaidUpdateBalances":true}""",
        )
        assertTrue(balancesOnly.plaidUpdateBalances)
        assertFalse(balancesOnly.plaidUpdatePurchases)
    }
}
