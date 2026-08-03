import Foundation
import FiHavenCore

/// OfflineCache — the on-device copy and the durable pending write.
///
/// Each check runs against a throwaway directory so nothing touches a real
/// Application Support folder.
func runOfflineCacheChecks() {
    func withTempCache(_ body: (OfflineCache) throws -> Void) {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("fh-cache-check-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        do { try body(OfflineCache(directory: dir)) }
        catch { failedChecks += 1; print("  ✗ threw: \(error)") }
    }

    func sample(_ billName: String) -> AppData {
        AppData(email: "a@test.com", bills: [Bill(id: "1", name: billName, amount: 10)])
    }

    section("OfflineCache — round trip") {
        withTempCache { cache in
            check(cache.readRaw() == nil, "a fresh device has no cache")

            cache.write(data: sample("Rent"), owner: "a@test.com", pendingWrite: false)
            let back = cache.read(owner: "a@test.com")
            check(back != nil, "a written snapshot reads back")
            checkEqual(back?.data.bills.first?.name, "Rent", "the data survives the round trip")
            checkEqual(back?.pendingWrite, false, "pendingWrite round-trips")
        }
    }

    section("OfflineCache — the pending flag is the durable outbound write") {
        withTempCache { cache in
            cache.write(data: sample("Added offline"), owner: "a@test.com", pendingWrite: true)
            check(cache.hasPendingWrite(owner: "a@test.com"),
                  "an unsent edit is flagged pending")

            // A new OfflineCache over the same directory is what the next
            // launch sees — the flag has to be on disk, not in memory.
            let relaunched = OfflineCache(directory: cache.directory)
            check(relaunched.hasPendingWrite(owner: "a@test.com"),
                  "the pending flag survives a relaunch")
            checkEqual(relaunched.read(owner: "a@test.com")?.data.bills.first?.name,
                       "Added offline",
                       "and so does the edit behind it")
        }
    }

    section("OfflineCache — markSynced clears only the flag") {
        withTempCache { cache in
            cache.write(data: sample("Rent"), owner: "a@test.com", pendingWrite: true)
            cache.markSynced()
            check(!cache.hasPendingWrite(owner: "a@test.com"),
                  "an accepted write retires the pending flag")
            checkEqual(cache.read(owner: "a@test.com")?.data.bills.first?.name, "Rent",
                       "the cached data stays put — it's still the offline copy")
        }
    }

    section("OfflineCache — a snapshot is scoped to its owner") {
        withTempCache { cache in
            // The bug this prevents: edits made offline as one user being
            // loaded into, and pushed up as, whoever signs in next.
            cache.write(data: sample("Previous user's bill"),
                        owner: "previous@test.com", pendingWrite: true)

            check(cache.read(owner: "next@test.com") == nil,
                  "another account's snapshot is refused")
            check(!cache.hasPendingWrite(owner: "next@test.com"),
                  "and its pending write is not adopted")
            check(cache.readRaw() == nil,
                  "the mismatched snapshot is cleared, not just ignored")
        }
    }

    section("OfflineCache — an empty owner never matches") {
        withTempCache { cache in
            cache.write(data: sample("Rent"), owner: "", pendingWrite: true)
            check(cache.read(owner: "") == nil,
                  "an unattributable snapshot is not handed to anyone")
        }
    }

    section("OfflineCache — clear wipes the device copy") {
        withTempCache { cache in
            cache.write(data: sample("Rent"), owner: "a@test.com", pendingWrite: true)
            cache.clear()
            check(cache.readRaw() == nil, "sign-out leaves nothing behind")
            check(!cache.hasPendingWrite(owner: "a@test.com"), "and no pending write")
        }
    }

    section("OfflineCache — corrupt contents read as no cache") {
        withTempCache { cache in
            let file = cache.directory.appendingPathComponent("fh-offline-cache.json")
            try? Data("not json{".utf8).write(to: file)
            check(cache.readRaw() == nil, "a truncated or corrupt file is treated as absent")
        }
    }
}
