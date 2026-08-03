package app.fihaven.core

import app.fihaven.core.model.AppData
import app.fihaven.core.model.Bill
import app.fihaven.core.storage.OfflineCache
import java.io.File
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * OfflineCache — the on-device copy and the durable pending write.
 *
 * The behaviour that actually loses data if it regresses: an edit made while
 * offline has to still be there, and still be flagged unsent, after the
 * process is killed.
 */
class OfflineCacheTest {

    private lateinit var dir: File

    @BeforeTest
    fun setUp() {
        dir = Files.createTempDirectory("fh-cache-test").toFile()
    }

    @AfterTest
    fun tearDown() {
        dir.deleteRecursively()
    }

    private fun cache() = OfflineCache(dir)

    private fun sample(billName: String) =
        AppData(email = "a@test.com", bills = listOf(Bill(id = "1", name = billName, amount = 10.0)))

    @Test
    fun `a fresh device has no cache`() {
        assertNull(cache().readRaw())
        assertFalse(cache().hasPendingWrite("a@test.com"))
    }

    @Test
    fun `a written snapshot reads back intact`() {
        val cache = cache()
        assertTrue(cache.write(sample("Rent"), "a@test.com", pendingWrite = false))

        val back = cache.read("a@test.com")
        assertEquals("Rent", back?.data?.bills?.first()?.name)
        assertEquals("a@test.com", back?.owner)
        assertEquals(false, back?.pendingWrite)
    }

    @Test
    fun `an unsent edit and its pending flag survive a relaunch`() {
        cache().write(sample("Added offline"), "a@test.com", pendingWrite = true)

        // A new instance over the same directory is what the next process
        // start sees — the flag has to be on disk, not in memory.
        val relaunched = OfflineCache(dir)
        assertTrue(relaunched.hasPendingWrite("a@test.com"))
        assertEquals("Added offline", relaunched.read("a@test.com")?.data?.bills?.first()?.name)
    }

    @Test
    fun `markSynced retires the flag but keeps the data`() {
        val cache = cache()
        cache.write(sample("Rent"), "a@test.com", pendingWrite = true)

        assertTrue(cache.markSynced())

        assertFalse(cache.hasPendingWrite("a@test.com"))
        // Still the offline copy — clearing the data here would empty the
        // dashboard on the next disconnected launch.
        assertEquals("Rent", cache.read("a@test.com")?.data?.bills?.first()?.name)
    }

    @Test
    fun `another account's snapshot is refused and destroyed`() {
        // The bug this prevents: edits made offline as one user being loaded
        // into, and pushed up as, whoever signs in next.
        val cache = cache()
        cache.write(sample("Previous user's bill"), "previous@test.com", pendingWrite = true)

        assertNull(cache.read("next@test.com"))
        assertFalse(cache.hasPendingWrite("next@test.com"))
        assertNull(cache.readRaw()) // cleared, not merely ignored
    }

    @Test
    fun `an empty owner never matches`() {
        val cache = cache()
        cache.write(sample("Rent"), "", pendingWrite = true)
        assertNull(cache.read(""))
    }

    @Test
    fun `clear wipes the device copy`() {
        val cache = cache()
        cache.write(sample("Rent"), "a@test.com", pendingWrite = true)

        cache.clear()

        assertNull(cache.readRaw())
        assertFalse(cache.hasPendingWrite("a@test.com"))
    }

    @Test
    fun `corrupt contents read as no cache`() {
        val cache = cache()
        cache.file.writeText("not json{")
        assertNull(cache.readRaw())
    }

    @Test
    fun `settings keys the app doesn't model survive the round trip`() {
        // `settings` is a raw JsonObject precisely so web-only keys aren't
        // dropped; the cache must not be the place they get lost.
        val cache = cache()
        val data = app.fihaven.core.model.decodeAppData(
            """{"email":"a@test.com","settings":{"income":5,"webOnlyKey":"keep me"}}"""
        )
        cache.write(data, "a@test.com", pendingWrite = true)

        val back = cache.read("a@test.com")
        assertEquals(
            "keep me",
            back?.data?.settings?.get("webOnlyKey")?.toString()?.trim('"')
        )
    }
}
