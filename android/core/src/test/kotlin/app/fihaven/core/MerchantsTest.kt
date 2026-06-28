package app.fihaven.core

import app.fihaven.core.logic.Merchants
import app.fihaven.core.logic.Rewards
import app.fihaven.core.model.Card
import app.fihaven.core.model.SpendTransaction
import java.time.LocalDate
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class MerchantsTest {
    @Test fun categoryHints() {
        assertEquals("Dining", Merchants.category("STARBUCKS #1234"))
        assertEquals("Groceries", Merchants.category("Whole Foods Market"))
        assertEquals("Gas", Merchants.category("Shell Oil 5567"))
        assertEquals("Streaming", Merchants.category("Netflix.com"))
        assertEquals("Online shopping", Merchants.category("Amazon Marketplace"))
        assertNull(Merchants.category("Joe's Hardware Emporium"))
        assertNull(Merchants.category(""))
        assertNull(Merchants.category(null))
    }

    @Test fun hintsOnlyMapToRewardCategories() {
        val valid = Rewards.CATEGORIES.toSet()
        assertTrue(Merchants.HINTS.all { valid.contains(it.second) })
    }
}

class RewardsSpendTest {
    private val today = LocalDate.of(2026, 6, 20)

    @Test fun txRewardCategory() {
        assertEquals("Dining", Rewards.txRewardCategory(SpendTransaction(id = "1", category = "Whatever", merchant = "Starbucks")))
        assertEquals("Groceries", Rewards.txRewardCategory(SpendTransaction(id = "2", category = "Groceries", merchant = "Unknown Shop")))
        assertEquals("Other", Rewards.txRewardCategory(SpendTransaction(id = "3", category = "NotACategory", merchant = "Unknown Shop")))
    }

    @Test fun categorySpendAnnualAnnualizes() {
        val txns = listOf(
            SpendTransaction(id = "a", date = "2026-06-10", amount = 50.0, merchant = "Starbucks"),
            SpendTransaction(id = "b", date = "2026-01-01", amount = 50.0, merchant = "Chipotle"),
            SpendTransaction(id = "c", date = "2026-01-01", amount = 100.0, category = "Gas", merchant = "Some Station"),
            SpendTransaction(id = "d", date = "2026-06-15", amount = -20.0, merchant = "refund"),
        )
        val spend = Rewards.categorySpendAnnual(txns, today)
        assertTrue((spend["Dining"] ?: 0.0) > 180)
        assertTrue((spend["Gas"] ?: 0.0) > 180)
        assertTrue(Rewards.categorySpendAnnual(emptyList(), today).isEmpty())
    }

    @Test fun rewardsEstimateOnlyBonusCategories() {
        val spend = mapOf("Dining" to 1000.0, "Gas" to 1000.0, "Other" to 5000.0)
        assertEquals(40.0, Rewards.cardRewardsEstimateAnnual(
            Card(id = "1", name = "Gold", rewardBase = 1.0, rewardCategories = mapOf("Dining" to 4.0)), spend))
        assertEquals(60.0, Rewards.cardRewardsEstimateAnnual(
            Card(id = "2", name = "Pts", rewardBase = 1.0, rewardCategories = mapOf("Dining" to 3.0), pointValue = 2.0), spend))
        assertEquals(0.0, Rewards.cardRewardsEstimateAnnual(
            Card(id = "3", name = "Loan", type = "loan", rewardCategories = mapOf("Dining" to 4.0)), spend))
    }
}
