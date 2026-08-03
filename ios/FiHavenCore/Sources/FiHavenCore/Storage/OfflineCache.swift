import Foundation

/// The on-device copy of the signed-in user's data — the native half of the
/// web's localStorage cache (docs/native-contract.md §1, §4).
///
/// Two jobs, and the second is the one that loses data when it's missing:
///
/// 1. **Offline reads.** A cold launch without a connection used to show an
///    empty dashboard: `load()` caught the error, set the state to "offline",
///    and kept whatever was in memory — which on a fresh process is nothing.
/// 2. **A durable outbound write.** Sync is whole-blob last-write-wins
///    (`PUT /api/data` replaces the snapshot; the server stores no version),
///    so an unsent edit isn't a queue of operations, it's one fact: *this
///    snapshot hasn't been accepted yet*. Persisting it means an edit made
///    offline survives the app being killed, instead of dying with the
///    retry loop that was holding it in memory.
///
/// `owner` is not decoration. Without it a snapshot written by one account
/// would be loaded — and pushed — into whichever account signed in next.
/// A snapshot whose owner doesn't match is discarded, never adopted.
public struct OfflineCache: Sendable {

    /// What gets written to disk.
    public struct Snapshot: Codable, Equatable, Sendable {
        /// Account the data belongs to (`AppData.email` at write time).
        public var owner: String
        public var data: AppData
        /// True while the server has not accepted this snapshot.
        public var pendingWrite: Bool
        public var savedAt: Date

        public init(owner: String, data: AppData, pendingWrite: Bool, savedAt: Date = Date()) {
            self.owner = owner
            self.data = data
            self.pendingWrite = pendingWrite
            self.savedAt = savedAt
        }
    }

    /// Folder holding the cache file. Exposed so a caller (and the checks) can
    /// point at a throwaway location instead of the real one.
    public let directory: URL
    private let fileURL: URL

    /// - Parameter directory: where to keep the file. Defaults to Application
    ///   Support — deliberately not Caches, which the system may evict under
    ///   storage pressure, and this file can hold the only copy of an edit.
    public init(directory: URL? = nil, filename: String = "fh-offline-cache.json") {
        let base = directory ?? Self.defaultDirectory()
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        self.directory = base
        self.fileURL = base.appendingPathComponent(filename)
    }

    private static func defaultDirectory() -> URL {
        let fm = FileManager.default
        let support = (try? fm.url(for: .applicationSupportDirectory,
                                   in: .userDomainMask,
                                   appropriateFor: nil,
                                   create: true))
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        return support.appendingPathComponent("FiHaven", isDirectory: true)
    }

    // ── Write ────────────────────────────────────────────────────

    /// Persist `data` for `owner`. `pendingWrite` records whether the server
    /// still owes us an acknowledgement.
    @discardableResult
    public func write(data: AppData, owner: String, pendingWrite: Bool) -> Bool {
        let snapshot = Snapshot(owner: owner, data: data, pendingWrite: pendingWrite)
        do {
            let encoded = try JSONEncoder().encode(snapshot)
            // Atomic: a half-written cache is worse than none — it would parse
            // as corrupt on the next launch and take the edit with it.
            try encoded.write(to: fileURL, options: [.atomic])
            applyProtection()
            return true
        } catch {
            return false
        }
    }

    /// Flip only the pending flag, keeping the stored data. Used when a write
    /// lands: the cache is still the right offline copy, it's just no longer
    /// ahead of the server.
    @discardableResult
    public func markSynced() -> Bool {
        guard var snapshot = readRaw() else { return false }
        guard snapshot.pendingWrite else { return true }
        snapshot.pendingWrite = false
        do {
            try JSONEncoder().encode(snapshot).write(to: fileURL, options: [.atomic])
            applyProtection()
            return true
        } catch {
            return false
        }
    }

    private func applyProtection() {
        #if os(iOS)
        // Readable while the app is running but encrypted at rest once the
        // device locks. Not `.complete`, which would fail a read that lands
        // before first unlock.
        try? FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUnlessOpen],
            ofItemAtPath: fileURL.path
        )
        #endif
    }

    // ── Read ─────────────────────────────────────────────────────

    /// The stored snapshot regardless of owner. Prefer `read(owner:)`.
    public func readRaw() -> Snapshot? {
        guard let bytes = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode(Snapshot.self, from: bytes)
    }

    /// The stored snapshot, but only if it belongs to `owner`.
    ///
    /// A mismatch is cleared rather than merely ignored, so a previous user's
    /// data can't linger on the device and can't be mistaken for the current
    /// user's unsent work on some later launch.
    public func read(owner: String) -> Snapshot? {
        guard let snapshot = readRaw() else { return nil }
        guard snapshot.owner == owner, !owner.isEmpty else {
            clear()
            return nil
        }
        return snapshot
    }

    /// Whether this device holds edits `owner` has not got onto the server.
    public func hasPendingWrite(owner: String) -> Bool {
        read(owner: owner)?.pendingWrite ?? false
    }

    // ── Clear ────────────────────────────────────────────────────

    /// Remove the cache. Called on sign-out and account deletion: the data is
    /// the signed-out user's, and leaving it would be the same disclosure the
    /// web's sign-out cache-clear exists to prevent.
    public func clear() {
        try? FileManager.default.removeItem(at: fileURL)
    }
}
