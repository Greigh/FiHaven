package app.fihaven

import android.app.Application
import android.content.SharedPreferences
import app.fihaven.core.model.AppData
import app.fihaven.core.model.Bill
import app.fihaven.core.net.InMemoryTokenStore
import app.fihaven.core.storage.OfflineCache
import com.sun.net.httpserver.HttpServer
import java.io.File
import java.net.InetSocketAddress
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

/**
 * F7 regression: a save scheduled under one session must never write another
 * account's data, and a placeholder blob must never reach the server.
 *
 * The server is a real local `HttpServer` so request ordering — GET data
 * delayed, PUT failed then retried — is exercised exactly as the sweep saw it:
 * sign in as A, queue a save that keeps failing, sign straight in as B
 * (no sign-out in between), and the old save's retry loop fires under B's
 * token carrying A's snapshot. Without the write-boundary check that PUT
 * lands and B's records are gone.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class DataSaveBoundaryTest {

    /** In-memory SharedPreferences so the VM's per-device stores (biometrics,
     *  snoozes, intro flag) run in a plain JVM test. */
    private class FakePrefs : SharedPreferences {
        val map = mutableMapOf<String, Any?>()
        override fun getAll() = map.toMap()
        override fun getString(k: String, d: String?) = map[k] as? String ?: d
        override fun getStringSet(k: String, d: MutableSet<String>?) = @Suppress("UNCHECKED_CAST") (map[k] as? MutableSet<String>) ?: d
        override fun getInt(k: String, d: Int) = map[k] as? Int ?: d
        override fun getLong(k: String, d: Long) = map[k] as? Long ?: d
        override fun getFloat(k: String, d: Float) = map[k] as? Float ?: d
        override fun getBoolean(k: String, d: Boolean) = map[k] as? Boolean ?: d
        override fun contains(k: String) = map.containsKey(k)
        override fun edit() = object : SharedPreferences.Editor {
            val staged = mutableMapOf<String, Any?>()
            val removed = mutableSetOf<String>()
            override fun putString(k: String, v: String?) = apply { staged[k] = v }
            override fun putStringSet(k: String, v: MutableSet<String>?) = apply { staged[k] = v }
            override fun putInt(k: String, v: Int) = apply { staged[k] = v }
            override fun putLong(k: String, v: Long) = apply { staged[k] = v }
            override fun putFloat(k: String, v: Float) = apply { staged[k] = v }
            override fun putBoolean(k: String, v: Boolean) = apply { staged[k] = v }
            override fun remove(k: String) = apply { removed += k }
            override fun clear() = apply { staged.clear(); removed.clear(); map.clear() }
            override fun commit(): Boolean { apply(); return true }
            override fun apply() { removed.forEach { map.remove(it) }; staged.forEach { (k, v) -> map[k] = v } }
        }
        override fun registerOnSharedPreferenceChangeListener(l: SharedPreferences.OnSharedPreferenceChangeListener?) {}
        override fun unregisterOnSharedPreferenceChangeListener(l: SharedPreferences.OnSharedPreferenceChangeListener?) {}
    }

    private class TestApp : Application() {
        val stores = mutableMapOf<String, FakePrefs>()
        override fun getSharedPreferences(name: String?, mode: Int): SharedPreferences =
            stores.getOrPut(name ?: "") { FakePrefs() }
    }

    /** Every PUT /api/data the VM attempted: the bearer token it ran under and
     *  the body it tried to write. The assertion surface for the whole file. */
    data class RecordedPut(val token: String, val body: String)

    private lateinit var server: HttpServer
    private lateinit var vm: AppViewModel
    private lateinit var cacheDir: File
    private val puts = CopyOnWriteArrayList<RecordedPut>()

    /** email → the JSON blob `GET /api/data` returns for that account. */
    private val blobs = mutableMapOf<String, String>()
    private val putStatus = AtomicInteger(200)
    private val putDelayMs = AtomicLong(0)
    private val dataGetStatus = AtomicInteger(200)
    private val dataGetDelayMs = AtomicLong(0)
    private val testDispatcher = UnconfinedTestDispatcher()

    @BeforeEach
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        cacheDir = kotlin.io.path.createTempDirectory("fhcache").toFile()
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { ex ->
            val path = ex.requestURI.path.trimStart('/')
            val token = ex.requestHeaders.getFirst("Authorization")
                ?.removePrefix("Bearer ")?.trim().orEmpty()
            val email = token.removePrefix("tok-")
            val code: Int
            val body: String
            when {
                path == "api/auth/login" || path == "api/auth/signup" -> {
                    val req = ex.requestBody.readBytes().decodeToString()
                    val em = Regex("\"email\"\\s*:\\s*\"([^\"]+)\"").find(req)?.groupValues?.get(1)
                        ?: "unknown@x"
                    code = 200
                    body = """{"user":{"email":"$em","emailVerified":true,"onboarded":true},"token":"tok-$em"}"""
                }
                path == "api/auth/me" -> {
                    code = 200
                    body = """{"user":{"email":"$email","emailVerified":true,"onboarded":true}}"""
                }
                path == "api/data" && ex.requestMethod == "GET" -> {
                    val delay = dataGetDelayMs.get()
                    if (delay > 0) Thread.sleep(delay)
                    val status = dataGetStatus.get()
                    if (status != 200) { code = status; body = """{"error":"unavailable"}""" }
                    else { code = 200; body = blobs[email] ?: """{"email":"$email"}""" }
                }
                path == "api/data" && ex.requestMethod == "PUT" -> {
                    val reqBody = ex.requestBody.readBytes().decodeToString()
                    val delay = putDelayMs.get()
                    if (delay > 0) Thread.sleep(delay)
                    puts += RecordedPut(token, reqBody)
                    code = putStatus.get()
                    body = if (code in 200..299) """{"ok":true}""" else """{"error":"unavailable"}"""
                    // A real server stores what a successful PUT carried —
                    // recording it lets the tests assert on the blob that
                    // would exist afterward, not just on traffic seen.
                    if (code in 200..299) blobs[email] = reqBody
                }
                else -> { code = 404; body = """{"error":"not found"}""" }
            }
            val bytes = body.toByteArray()
            ex.responseHeaders.add("Content-Type", "application/json")
            ex.sendResponseHeaders(code, bytes.size.toLong())
            ex.responseBody.use { it.write(bytes) }
        }
        server.start()
        vm = AppViewModel(
            TestApp(),
            tokens = InMemoryTokenStore(),
            apiBase = "http://127.0.0.1:${server.address.port}",
            cacheDir = cacheDir,
        )
    }

    @AfterEach
    fun tearDown() {
        server.stop(0)
        cacheDir.deleteRecursively()
        Dispatchers.resetMain()
    }

    /** Let in-flight coroutines and real localhost I/O settle, then advance
     *  virtual time so debounced saves and retries fire deterministically. */
    private fun settle(ms: Long = 4000) {
        val deadline = System.currentTimeMillis() + ms
        while (System.currentTimeMillis() < deadline) {
            testDispatcher.scheduler.advanceUntilIdle()
            Thread.sleep(30)
        }
    }

    private fun blobWith(email: String, billName: String) =
        """{"email":"$email","bills":[{"id":"b-$billName","name":"$billName","category":"Housing","amount":100.0,"dueDay":5,"frequency":"Monthly"}]}"""

    @Test
    fun `sign-in over a live session never PUTs the previous account's data`() {
        // A = the account being abandoned mid-flight; B = the account its
        // queued save would have overwritten before the fix.
        blobs["a@x"] = blobWith("a@x", "Account-A-Bill")
        blobs["b@x"] = blobWith("b@x", "Rent-Marker")
        putStatus.set(503) // saves keep failing so A's saveJob stays in retry

        vm.devAutoLogin("a@x", "pw")
        settle()
        vm.mutate { it.copy(bills = it.bills + Bill(id = "e1", name = "A-Edit")) }
        settle(1500) // first attempt already failed; job is in backoff

        puts.clear()
        // Direct sign-in as B — the path that used to leave A's job alive.
        dataGetDelayMs.set(2500) // B's load is slow: the race window stays open
        vm.devAutoLogin("b@x", "pw")
        settle()

        // No write under B's token may carry A's snapshot — or an empty one.
        val bad = puts.filter { it.token == "tok-b@x" }
            .filter { it.body.contains("Account-A-Bill") || it.body.contains("A-Edit") }
        assertTrue(bad.isEmpty(), "A's queued save wrote under B's token: $bad")
        // The stored blob is the proof that matters: B's record must still be
        // there with its own ID — an unexpected empty or foreign replacement
        // fails even when no PUT above carried an obvious marker.
        assertTrue(
            blobs["b@x"]!!.contains("\"id\":\"b-Rent-Marker\""),
            "B's stored record was replaced: ${blobs["b@x"]}",
        )
        // And B's own data must be intact once loaded.
        assertTrue(
            vm.data.value.bills.any { it.name == "Rent-Marker" },
            "B's seeded data never loaded",
        )
    }

    @Test
    fun `a late data-load response for a superseded session is dropped`() {
        // A's GET is delayed past B's whole sign-in. Without the epoch check
        // the arriving response would install A's bills under B's session —
        // and the next save would write them into B's blob.
        blobs["a@x"] = blobWith("a@x", "Late-A-Bill")
        blobs["b@x"] = blobWith("b@x", "B-Owns-This")

        dataGetDelayMs.set(6000) // A's load lands after B has signed in
        vm.devAutoLogin("a@x", "pw")
        Thread.sleep(300) // let A's request actually leave
        dataGetDelayMs.set(0)
        vm.devAutoLogin("b@x", "pw")
        settle(8000)

        assertTrue(
            vm.data.value.bills.none { it.name == "Late-A-Bill" },
            "A's late load stomped B's session data",
        )
        assertTrue(
            vm.data.value.bills.any { it.name == "B-Owns-This" },
            "B's data never loaded after A's stale response",
        )
        assertTrue(
            blobs["b@x"]!!.contains("B-Owns-This"),
            "B's blob was overwritten by stale data: ${blobs["b@x"]}",
        )
    }

    @Test
    fun `a save response arriving after logout cannot write again`() {
        // PUT takes 2.5s; logout lands mid-flight. The job must not schedule
        // another attempt, and the post-logout state must not produce writes.
        blobs["e2@x"] = blobWith("e2@x", "InFlight")
        putDelayMs.set(2500)
        vm.devAutoLogin("e2@x", "pw")
        settle()
        vm.mutate { it.copy(bills = it.bills + Bill(id = "i1", name = "In-Flight-Edit")) }
        Thread.sleep(400) // the save attempt is now inside the delayed PUT

        vm.logout()
        settle()
        val after = puts.count { it.token == "tok-e2@x" }
        assertTrue(after <= 1, "save retried after logout: ${puts.filter { it.token == "tok-e2@x" }}")
    }

    @Test
    fun `a newer edit during an in-flight save keeps its pending flag`() {
        // PUT 1 leaves with snapshot S1; edit 2 lands on disk while PUT 1 is
        // in flight; PUT 1's success must not mark S2 synced — the server
        // never saw it.
        blobs["m@x"] = blobWith("m@x", "Base")
        putDelayMs.set(2500)
        vm.devAutoLogin("m@x", "pw")
        settle()
        vm.mutate { it.copy(bills = it.bills + Bill(id = "n1", name = "First-Save")) }
        Thread.sleep(400) // PUT 1 is inside the delayed request now

        vm.mutate { it.copy(bills = it.bills + Bill(id = "n2", name = "Second-Edit")) }
        settle(8000)

        assertTrue(
            puts.any { it.token == "tok-m@x" && it.body.contains("Second-Edit") },
            "the newer edit was marked synced and never retried: $puts",
        )
        assertTrue(
            blobs["m@x"]!!.contains("Second-Edit"),
            "server blob missing the newer edit: ${blobs["m@x"]}",
        )
    }

    @Test
    fun `same-account reauthentication still pushes the pending offline edit`() {
        // Same email signing in again is not an account switch — the pending
        // write in the cache belongs to this account and must be replayed.
        blobs["r@x"] = blobWith("r@x", "Server-Copy")
        vm.devAutoLogin("r@x", "pw")
        settle()
        putStatus.set(503)
        vm.mutate { it.copy(bills = it.bills + Bill(id = "r1", name = "Offline-Edit")) }
        settle(1500) // save failed; cache holds pendingWrite for r@x

        // Re-auth as the same account — the session must continue, not tear
        // down, and the pending write must still reach the server.
        putStatus.set(200)
        vm.devAutoLogin("r@x", "pw")
        settle()

        assertTrue(
            puts.any { it.token == "tok-r@x" && it.body.contains("Offline-Edit") },
            "pending edit lost across same-account re-auth: $puts",
        )
        assertTrue(
            blobs["r@x"]!!.contains("Offline-Edit"),
            "server never received the replayed edit: ${blobs["r@x"]}",
        )
    }

    @Test
    fun `failed initial load then a mutation never PUTs a placeholder`() {
        blobs["c@x"] = blobWith("c@x", "Must-Survive")
        dataGetStatus.set(500) // load fails; no cache → dataError, placeholder in memory

        vm.devAutoLogin("c@x", "pw")
        settle()
        assertFalse(vm.dataLoaded.value)

        vm.mutate { it.copy(bills = it.bills + Bill(id = "x", name = "Phantom")) }
        settle()

        val writes = puts.filter { it.token == "tok-c@x" }
        assertTrue(writes.isEmpty(), "placeholder/default data was PUT: $writes")
    }

    @Test
    fun `normal sign-in, edit, and save still land`() {
        blobs["d@x"] = blobWith("d@x", "Existing")
        vm.devAutoLogin("d@x", "pw")
        settle()
        assertTrue(vm.dataLoaded.value)

        vm.mutate { it.copy(bills = it.bills + Bill(id = "e9", name = "New-Bill")) }
        settle()

        val last = puts.lastOrNull { it.token == "tok-d@x" }
        assertTrue(last != null && last.body.contains("New-Bill"),
            "the edit never reached the server: $puts")
    }

    @Test
    fun `logout with a save in flight stops all further writes`() {
        blobs["e@x"] = blobWith("e@x", "Data")
        putStatus.set(503)
        vm.devAutoLogin("e@x", "pw")
        settle()
        vm.mutate { it.copy(bills = it.bills + Bill(id = "e2", name = "Edit")) }
        settle(1200)

        puts.clear()
        vm.logout()
        settle()

        assertTrue(puts.isEmpty(), "save retried after logout: $puts")
    }

    @Test
    fun `pending offline write replays for its own account on next sign-in`() {
        // B edited while the server was down last run: the cache on disk owes
        // the server "Pending-Offline-Edit" — sign-in must push it, not lose it.
        blobs["f@x"] = blobWith("f@x", "Server-Version")
        val pending = AppData(email = "f@x", bills = listOf(Bill(id = "p1", name = "Pending-Offline-Edit")))
        OfflineCache(cacheDir).write(pending, "f@x", pendingWrite = true)

        vm.devAutoLogin("f@x", "pw")
        settle()

        assertTrue(
            puts.any { it.token == "tok-f@x" && it.body.contains("Pending-Offline-Edit") },
            "pending cache write was never pushed: $puts",
        )
    }

    @Test
    fun `legitimately empty account can sign in and save`() {
        blobs["g@x"] = """{"email":"g@x"}""" // never stored a thing — legal empty
        vm.devAutoLogin("g@x", "pw")
        settle()
        assertTrue(vm.dataLoaded.value)

        vm.mutate { it.copy(bills = it.bills + Bill(id = "g1", name = "First-Bill")) }
        settle()

        assertTrue(
            puts.any { it.token == "tok-g@x" && it.body.contains("First-Bill") },
            "empty account's first edit never saved: $puts",
        )
    }
}
