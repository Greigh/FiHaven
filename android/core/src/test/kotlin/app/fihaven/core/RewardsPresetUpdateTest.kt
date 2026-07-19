package app.fihaven.core

import app.fihaven.core.logic.Rewards
import app.fihaven.core.model.Card
import app.fihaven.core.model.FiHavenJson
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class RewardsPresetUpdateTest {
    private val gold = Rewards.CardPreset(
        id = "amex-gold",
        issuer = "American Express",
        name = "Gold Card",
        network = "Amex",
        rewardBase = 1.0,
        rewardCategories = mapOf("Dining" to 4.0, "Groceries" to 4.0, "Travel" to 3.0),
        pointValue = 2.0,
        updatedAt = 100.0,
    )
    private val goldV2 = gold.copy(
        rewardCategories = mapOf("Dining" to 5.0, "Groceries" to 4.0, "Travel" to 3.0),
        updatedAt = 200.0,
    )

    @AfterEach fun restoreCatalog() {
        Rewards.replaceActivePresets(emptyList())
    }

    @Test fun applyPresetRatesCopiesRatesClearsDeclineKeepsIdentity() {
        Rewards.replaceActivePresets(listOf(gold))
        val card = Rewards.applyPresetRates(
            Card(
                id = "1",
                name = "My Gold",
                balance = 500.0,
                issuer = "American Express",
                declinedPresetUpdatedAt = 50.0,
                notes = "keep me",
            ),
            gold,
        )
        assertEquals("1", card.id)
        assertEquals("My Gold", card.name)
        assertEquals(500.0, card.balance)
        assertEquals("keep me", card.notes)
        assertEquals("amex-gold", card.presetId)
        assertEquals(1.0, card.rewardBase)
        assertEquals(gold.rewardCategories, card.rewardCategories)
        assertEquals(2.0, card.pointValue)
        assertEquals(100.0, card.acceptedPresetUpdatedAt)
        assertNull(card.declinedPresetUpdatedAt)
        assertTrue(Rewards.cardRatesMatchPreset(card, gold))
    }

    @Test fun ratesMatchIgnoresPoolOrderAndNullPointValue() {
        val preset = Rewards.CardPreset(
            id = "rot",
            issuer = "X",
            name = "Rot",
            network = "Visa",
            rewardBase = 1.0,
            rewardCategories = emptyMap(),
            rotatingPool = listOf("Gas", "Dining"),
            rotatingRate = 5.0,
            pointValue = 1.0,
        )
        val card = Card(
            rewardBase = 1.0,
            rotatingPool = listOf("Dining", "Gas"),
            rotatingRate = 5.0,
            pointValue = null,
        )
        assertTrue(Rewards.cardRatesMatchPreset(card, preset))
        assertFalse(Rewards.cardRatesMatchPreset(card.copy(rewardBase = 2.0), preset))
    }

    @Test fun quietAcceptWhenRatesMatch() {
        Rewards.replaceActivePresets(listOf(gold))
        var card = Rewards.applyPresetRates(Card(id = "a", name = "Gold Card", issuer = "American Express"), gold)
        card = card.copy(acceptedPresetUpdatedAt = null)
        val (updated, pending) = Rewards.findPendingPresetUpdates(listOf(card))
        assertTrue(pending.isEmpty())
        assertEquals(100.0, updated[0].acceptedPresetUpdatedAt)
        assertEquals("amex-gold", updated[0].presetId)
    }

    @Test fun queuesWhenLinkedRatesDivergeFromNewerStamp() {
        Rewards.replaceActivePresets(listOf(goldV2))
        val card = Card(
            id = "b",
            name = "Gold Card",
            issuer = "American Express",
            presetId = "amex-gold",
            rewardBase = 1.0,
            rewardCategories = mapOf("Dining" to 4.0, "Groceries" to 4.0, "Travel" to 3.0),
            pointValue = 2.0,
            acceptedPresetUpdatedAt = 100.0,
        )
        val (_, pending) = Rewards.findPendingPresetUpdates(listOf(card))
        assertEquals(1, pending.size)
        assertEquals(200.0, pending[0].preset.updatedAt)
        assertEquals(5.0, pending[0].preset.rewardCategories["Dining"])
    }

    @Test fun declineSameStampSuppressesPrompt() {
        Rewards.replaceActivePresets(listOf(goldV2))
        val card = Card(
            id = "c",
            name = "Gold Card",
            issuer = "American Express",
            presetId = "amex-gold",
            rewardBase = 9.0,
            declinedPresetUpdatedAt = 200.0,
        )
        val (_, pending) = Rewards.findPendingPresetUpdates(listOf(card))
        assertTrue(pending.isEmpty())
    }

    @Test fun declineOlderStampRepromptsOnNewerCatalog() {
        Rewards.replaceActivePresets(listOf(goldV2))
        val card = Card(
            id = "d",
            name = "Gold Card",
            issuer = "American Express",
            presetId = "amex-gold",
            rewardBase = 9.0,
            declinedPresetUpdatedAt = 100.0,
        )
        val (_, pending) = Rewards.findPendingPresetUpdates(listOf(card))
        assertEquals(1, pending.size)
    }

    @Test fun acceptedThenCustomizedDoesNotRepromptUntilCatalogBumps() {
        Rewards.replaceActivePresets(listOf(gold))
        val card = Card(
            id = "e",
            name = "Gold Card",
            issuer = "American Express",
            presetId = "amex-gold",
            rewardBase = 9.0,
            rewardCategories = mapOf("Dining" to 9.0),
            acceptedPresetUpdatedAt = 100.0,
        )
        val (_, pending) = Rewards.findPendingPresetUpdates(listOf(card))
        assertTrue(pending.isEmpty())
    }

    @Test fun skipsLoanArchivedAndUnlinkedCustomRates() {
        Rewards.replaceActivePresets(listOf(gold))
        val cards = listOf(
            Card(id = "loan", type = "loan", name = "Gold Card", issuer = "American Express", rewardBase = 9.0),
            Card(id = "arch", archived = true, name = "Gold Card", issuer = "American Express", presetId = "amex-gold", rewardBase = 9.0),
            Card(id = "legacy", name = "Gold Card", issuer = "American Express", rewardBase = 9.0),
        )
        val (updated, pending) = Rewards.findPendingPresetUpdates(cards)
        assertTrue(pending.isEmpty())
        assertNull(updated[2].presetId)
    }

    @Test fun attachIfMatchLinksMatchingLegacyCard() {
        Rewards.replaceActivePresets(listOf(gold))
        val card = Card(
            id = "legacy",
            name = "Gold Card",
            issuer = "American Express",
            rewardBase = 1.0,
            rewardCategories = mapOf("Dining" to 4.0, "Groceries" to 4.0, "Travel" to 3.0),
            pointValue = 2.0,
        )
        val (resolved, preset) = Rewards.resolveCardPreset(card, attachIfMatch = true)
        assertEquals("amex-gold", preset?.id)
        assertEquals("amex-gold", resolved.presetId)
        assertEquals(100.0, resolved.acceptedPresetUpdatedAt)
    }

    @Test fun shippedRewardRatePrefersPresetId() {
        Rewards.replaceActivePresets(
            listOf(
                gold,
                gold.copy(id = "other", name = "Other Gold", rewardCategories = mapOf("Dining" to 99.0)),
            ),
        )
        val card = Card(name = "Other Gold", issuer = "American Express", presetId = "amex-gold")
        val shipped = Rewards.shippedRewardRate(card, "Dining")
        assertEquals("amex-gold", shipped.preset?.id)
        assertEquals(4.0, shipped.rate)
    }

    @Test fun replaceActivePresetsEmptyRestoresBundled() {
        Rewards.replaceActivePresets(listOf(gold))
        assertEquals(1, Rewards.activePresets.size)
        Rewards.replaceActivePresets(emptyList())
        assertTrue(Rewards.activePresets.size > 1)
        assertTrue(Rewards.presetById("amex-gold") != null)
    }

    @Test fun cardRoundTripsPresetStamps() {
        val card = Card(
            id = "1",
            name = "Gold",
            presetId = "amex-gold",
            acceptedPresetUpdatedAt = 100.0,
            declinedPresetUpdatedAt = 50.0,
        )
        val json = FiHavenJson.encodeToString(Card.serializer(), card)
        val back = FiHavenJson.decodeFromString(Card.serializer(), json)
        assertEquals("amex-gold", back.presetId)
        assertEquals(100.0, back.acceptedPresetUpdatedAt)
        assertEquals(50.0, back.declinedPresetUpdatedAt)
    }

    @Test fun formatRateDiffMentionsCategoryChange() {
        val diff = Rewards.formatRateDiff(
            Card(rewardBase = 1.0, rewardCategories = mapOf("Dining" to 4.0), pointValue = 2.0),
            goldV2,
        )
        assertTrue(diff.contains("Dining"))
        assertTrue(diff.contains("4"))
        assertTrue(diff.contains("5"))
    }
}
