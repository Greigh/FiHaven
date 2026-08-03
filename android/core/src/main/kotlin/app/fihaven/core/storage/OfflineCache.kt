package app.fihaven.core.storage

import app.fihaven.core.model.AppData
import app.fihaven.core.model.FiHavenJson
import app.fihaven.core.model.decodeAppData
import java.io.File
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.put

/**
 * The on-device copy of the signed-in user's data — the Android half of the
 * web's localStorage cache (docs/native-contract.md §1, §4).
 *
 * Two jobs, and the second is the one that loses data when it's missing:
 *
 *  1. **Offline reads.** A cold launch without a connection used to show an
 *     error and nothing else: `loadData()` set `_dataError` and left `_data`
 *     at its empty default, because there was no other copy to fall back to.
 *  2. **A durable outbound write.** Sync is whole-blob last-write-wins
 *     (`PUT /api/data` replaces the snapshot; the server stores no version),
 *     so an unsent edit isn't a queue of operations — it's one fact: *this
 *     snapshot hasn't been accepted yet*. Persisting it means an edit made
 *     offline survives the process being killed, instead of dying with the
 *     retry loop that was holding it in memory.
 *
 * [owner] is not decoration. Without it a snapshot written by one account
 * would be loaded — and pushed — into whichever account signed in next. A
 * snapshot whose owner doesn't match is discarded, never adopted.
 *
 * Lives in `core` (pure JVM) rather than the app module so it can be covered
 * by `:core:test`; the app supplies its private `filesDir`.
 */
class OfflineCache(directory: File, filename: String = "fh-offline-cache.json") {

    /** What gets written to disk. */
    data class Snapshot(
        val owner: String,
        val data: AppData,
        val pendingWrite: Boolean,
        val savedAt: Long,
    )

    val file: File = File(directory, filename)

    init {
        runCatching { directory.mkdirs() }
    }

    // ── Write ────────────────────────────────────────────────────────

    /**
     * Persist [data] for [owner]. [pendingWrite] records whether the server
     * still owes us an acknowledgement.
     */
    fun write(data: AppData, owner: String, pendingWrite: Boolean): Boolean = runCatching {
        val envelope: JsonObject = buildJsonObject {
            put("owner", owner)
            put("pendingWrite", pendingWrite)
            put("savedAt", System.currentTimeMillis())
            put("data", FiHavenJson.encodeToJsonElement(AppData.serializer(), data))
        }
        writeAtomically(FiHavenJson.encodeToString(JsonObject.serializer(), envelope))
        true
    }.getOrDefault(false)

    /**
     * Flip only the pending flag, keeping the stored data. Used when a write
     * lands: the cache is still the right offline copy, it's just no longer
     * ahead of the server.
     */
    fun markSynced(): Boolean {
        val snapshot = readRaw() ?: return false
        if (!snapshot.pendingWrite) return true
        return write(snapshot.data, snapshot.owner, pendingWrite = false)
    }

    /**
     * Write via a temp file and rename. A half-written cache is worse than
     * none: it parses as corrupt on the next launch and takes the unsent edit
     * with it.
     */
    private fun writeAtomically(text: String) {
        val tmp = File(file.parentFile, "${file.name}.tmp")
        tmp.writeText(text)
        if (!tmp.renameTo(file)) {
            // Some filesystems refuse a rename over an existing file.
            file.delete()
            if (!tmp.renameTo(file)) {
                file.writeText(text)
                tmp.delete()
            }
        }
    }

    // ── Read ─────────────────────────────────────────────────────────

    /** The stored snapshot regardless of owner. Prefer [read]. */
    fun readRaw(): Snapshot? = runCatching {
        if (!file.exists()) return null
        val root = FiHavenJson.parseToJsonElement(file.readText()).jsonObject
        val owner = root["owner"]?.jsonPrimitive?.content ?: return null
        val dataElement = root["data"] ?: return null
        Snapshot(
            owner = owner,
            // Reuse the lenient decoder the network path uses, so one bad row
            // in the cache degrades exactly as it would from the server
            // instead of throwing the whole snapshot away.
            data = decodeAppData(FiHavenJson.encodeToString(dataElement)),
            pendingWrite = root["pendingWrite"]?.jsonPrimitive?.boolean ?: false,
            savedAt = root["savedAt"]?.jsonPrimitive?.long ?: 0L,
        )
    }.getOrNull()

    /**
     * The stored snapshot, but only if it belongs to [owner].
     *
     * A mismatch is cleared rather than merely ignored, so a previous user's
     * data can't linger on the device and can't be mistaken for the current
     * user's unsent work on some later launch.
     */
    fun read(owner: String): Snapshot? {
        val snapshot = readRaw() ?: return null
        if (owner.isEmpty() || snapshot.owner != owner) {
            clear()
            return null
        }
        return snapshot
    }

    /** Whether this device holds edits [owner] has not got onto the server. */
    fun hasPendingWrite(owner: String): Boolean = read(owner)?.pendingWrite == true

    // ── Clear ────────────────────────────────────────────────────────

    /**
     * Remove the cache. Called on sign-out and account deletion: the data is
     * the signed-out user's, and leaving it would be the same disclosure the
     * web's sign-out cache-clear exists to prevent.
     */
    fun clear() {
        runCatching { file.delete() }
        runCatching { File(file.parentFile, "${file.name}.tmp").delete() }
    }
}
