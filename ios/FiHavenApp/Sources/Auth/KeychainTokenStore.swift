import Foundation
import Security
import LocalAuthentication
import FiHavenCore

/// How the store reaches the real keychain — one method per SecItem call so a
/// test can script refusals and count touches. A *refusal* is the case worth
/// scripting: macOS produces one only when a differently signed build wrote
/// the item, which cannot be arranged on purpose in a unit test (or on a
/// healthy machine at all).
protocol KeychainBackend {
    /// Read the item's data — the call that can prompt for the login
    /// keychain password when the item belongs to a foreign entry.
    func read(service: String, account: String) -> (OSStatus, Data?)
    /// Persist the item's data, rewriting its attributes too.
    func write(service: String, account: String, data: Data) -> OSStatus
    @discardableResult func delete(service: String, account: String) -> OSStatus
    /// Whether an item exists — attributes only, never the data. This is the
    /// one check about an item that cannot prompt, and it is what lets a
    /// build retire a foreign entry without touching it.
    @discardableResult func hasEntry(service: String, account: String) -> Bool
    /// Remove an item this build has decided is not safe to read.
    @discardableResult func retireEntry(service: String, account: String) -> OSStatus
}

/// The real keychain behind `KeychainBackend`. Holds the one policy the
/// SecItem calls can't express themselves: the update-and-add write, the
/// accessibility every write carries, and the duplicate-item retry.
struct SecurityKeychain: KeychainBackend {
    /// `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`: the token is a
    /// long-lived (30-day) credential to a financial account, so it must not
    /// travel in an encrypted device backup or restore onto a different
    /// device. Exposed so a test can check every write against the constant
    /// rather than against the code that builds the dictionaries.
    static let accessibility: CFString = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

    /// The two SecItem calls a write is made of, injected so a test can
    /// script their answers and record their arguments.
    struct ItemWrite {
        var update: (_ query: [String: Any], _ attributes: [String: Any]) -> OSStatus
        var add: (_ attributes: [String: Any]) -> OSStatus

        /// The real `SecItemUpdate`/`SecItemAdd` pair.
        static var real: Self {
            ItemWrite(
                update: { SecItemUpdate($0 as CFDictionary, $1 as CFDictionary) },
                add: { SecItemAdd($0 as CFDictionary, nil) }
            )
        }
    }

    private func query(service: String, account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    func read(service: String, account: String) -> (OSStatus, Data?) {
        var q = query(service: service, account: account)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &item)
        return (status, item as? Data)
    }

    func write(service: String, account: String, data: Data) -> OSStatus {
        write(service: service, account: account, data: data, via: .real)
    }

    /// Update the item if it exists, create it if it doesn't, and take it
    /// over if a racer created it in between. Every write carries the
    /// accessibility — an item an older build added keeps its original
    /// (backup-eligible) attribute otherwise, so the hardening would never
    /// reach anyone who was already signed in.
    func write(service: String, account: String, data: Data, via write: ItemWrite) -> OSStatus {
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: Self.accessibility,
        ]
        var status = write.update(query(service: service, account: account), attributes)
        // Any update failure — not just errSecItemNotFound — falls back to
        // Add. errSecMissingEntitlement and friends used to swallow the write
        // whole: the token silently never persisted and the next data call
        // ended the session.
        guard status != errSecSuccess else { return status }
        var add = query(service: service, account: account)
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = Self.accessibility
        status = write.add(add)
        // Two runs of one build can race between the update and the add; the
        // loser takes the item over rather than leaving the session in memory.
        if status == errSecDuplicateItem {
            status = write.update(query(service: service, account: account), attributes)
        }
        return status
    }

    @discardableResult
    func delete(service: String, account: String) -> OSStatus {
        SecItemDelete(query(service: service, account: account) as CFDictionary)
    }

    @discardableResult
    func hasEntry(service: String, account: String) -> Bool {
        var q = query(service: service, account: account)
        q[kSecReturnAttributes as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        // Attributes only, never the secret: that is the one query about an
        // item that does not ask for the login keychain password — and the
        // interactionNotAllowed context is the belt under it.
        let context = LAContext()
        context.interactionNotAllowed = true
        q[kSecUseAuthenticationContext as String] = context
        var item: CFTypeRef?
        return SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess
    }

    @discardableResult
    func retireEntry(service: String, account: String) -> OSStatus {
        SecItemDelete(query(service: service, account: account) as CFDictionary)
    }
}

/// Which build wrote the keychain entry. A note in UserDefaults keys the
/// entry to the signature that wrote it: a local build signed differently
/// must never read the shipped entry, because that read is what asks for the
/// login keychain password — the fingerprint is how it knows before asking.
enum KeychainEntryFingerprint {
    /// The defaults key carrying the fingerprint of the build that last
    /// wrote the entry, keyed by service so the shipped and debug entries
    /// never borrow each other's note.
    static func defaultsKey(forService service: String) -> String {
        "app.fihaven.keychain.entry-owner.\(service)"
    }

    /// This build's identity: the signing team plus whether the build is
    /// development-signed (`get-task-allow`), which distinguishes a local
    /// debug signature from the shipped distribution one even on the same
    /// account. Unsigned builds get a stable non-identity so the note still
    /// works — everything they write is marked "unsigned" and only they read
    /// it back.
    static func current() -> String? {
        #if os(macOS)
        return macIdentity()
        #else
        return mobileIdentity()
        #endif
    }

    /// The signing team plus whether the build is development-signed
    /// (`get-task-allow`) — what distinguishes a local debug signature from
    /// the shipped distribution one even on the same account. Unsigned builds
    /// get a stable non-identity so the note still works: everything they
    /// write is marked "unsigned" and only they read it back.
    private static func identity(team: String?, development: Bool) -> String? {
        guard let team else { return unsignedFallback }
        return "\(team)|\(development ? "development" : "production")"
    }

    #if os(macOS)
    private static func macIdentity() -> String? {
        guard let task = SecTaskCreateFromSelf(nil) else { return unsignedFallback }
        func entitlement(_ key: String) -> CFTypeRef? {
            SecTaskCopyValueForEntitlement(task, key as CFString, nil)
        }
        let team = (entitlement("team-identifier") ?? entitlement("application-identifier")) as? String
        let dev = (entitlement("get-task-allow") as? Bool) == true
        return identity(team: team, development: dev)
    }
    #endif

    #if !os(macOS)
    /// The same entitlements, read from the embedded provisioning profile —
    /// `SecTask` does not exist on iOS. Ad-hoc signed builds carry no
    /// profile and get the unsigned fallback.
    private static func mobileIdentity() -> String? {
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let raw = try? Data(contentsOf: url),
              let start = raw.range(of: Data("<?xml".utf8)),
              let end = raw.range(of: Data("</plist>".utf8), options: [], in: start.lowerBound..<raw.count),
              let plist = try? PropertyListSerialization.propertyList(
                from: raw[start.lowerBound..<end.upperBound], format: nil) as? [String: Any],
              let entitlements = plist["Entitlements"] as? [String: Any] else {
            return unsignedFallback
        }
        let team = (entitlements["team-identifier"] ?? entitlements["application-identifier"]) as? String
        let dev = (entitlements["get-task-allow"] as? Bool) == true
        return identity(team: team, development: dev)
    }
    #endif

    private static var unsignedFallback: String? {
        Bundle.main.bundleIdentifier.map { "unsigned|\($0)" }
    }
}

/// `TokenStore` backed by the iOS/macOS Keychain. The Bearer token is the
/// only secret the app stores; it's kept as a generic-password item that
/// survives reinstalls-in-place and is readable after first unlock.
///
/// Three policies live here rather than in the keychain calls:
///
/// - **Read once per process.** The API client asks for the token on every
///   request; the keychain is asked once and the answer is served from
///   memory, so a refused read prompts at most once per launch instead of
///   once per request.
/// - **A foreign entry is retired, not read.** A local build cannot read an
///   item a differently signed build wrote without prompting — so when the
///   entry-owner note doesn't match this build's fingerprint (or isn't
///   there), the entry is deleted after a prompt-free existence check and
///   the launch reads as a normal signed-out one.
/// - **A refused write is written down.** The session still works in memory,
///   but the refusal is recorded under `writeRefusalDefaultsKey` so the next
///   launch can explain why there's no session instead of just showing a
///   sign-in screen.
final class KeychainTokenStore: TokenStore, @unchecked Sendable {
    /// The shipped build's service name.
    static let shippedService = "app.fihaven"

    /// What this build reads and writes under, and whether it retires entries
    /// another build wrote. A DEBUG build is signed locally — the shipped
    /// entry would cost it a keychain prompt every launch, so it gets its own
    /// service and retires instead of reads. A shipped build is signed the
    /// same as every copy of itself: there is nothing foreign to retire, and
    /// when there is, reading it and letting the user decide is the call.
    #if DEBUG
    static let serviceName = "app.fihaven.debug"
    static let retiresForeignEntries = true
    #else
    static let serviceName = shippedService
    static let retiresForeignEntries = false
    #endif

    /// Where a refused write is recorded, keyed by service so a local build's
    /// refusal is never the explanation the installed app's sign-in gives.
    static func writeRefusalDefaultsKey(forService service: String) -> String {
        "app.fihaven.keychain.write-refusal.\(service)"
    }

    let service: String
    private let account = "bearer-token"
    private let backend: KeychainBackend
    private let defaults: UserDefaults
    private let fingerprint: () -> String?
    private let retiresForeignEntries: Bool

    private var cached: String?
    /// The keychain is asked once per process — a refusal the user declined
    /// is answered once, not once per API request.
    private var didRead = false
    /// The foreign-entry retirement happens once per process per store.
    private var didRetireForeign = false
    /// Whether *this* store watched its own write fail — clearing the token
    /// then also clears the refusal, since the session it was about is over.
    private var recordedWriteFailure = false
    private(set) var lastReadStatus: OSStatus = errSecItemNotFound
    private(set) var lastWriteStatus: OSStatus = errSecSuccess

    private var noteKey: String { KeychainEntryFingerprint.defaultsKey(forService: service) }
    private var refusalKey: String { Self.writeRefusalDefaultsKey(forService: service) }

    init(service: String,
         backend: KeychainBackend = SecurityKeychain(),
         defaults: UserDefaults = .standard,
         fingerprint: @escaping () -> String? = KeychainEntryFingerprint.current,
         retiresForeignEntries: Bool = KeychainTokenStore.retiresForeignEntries) {
        self.service = service
        self.backend = backend
        self.defaults = defaults
        self.fingerprint = fingerprint
        self.retiresForeignEntries = retiresForeignEntries
    }

    func get() -> String? {
        if let cached { return cached }
        if didRead { return nil }
        didRead = true
        if retiresForeignEntries, defaults.string(forKey: noteKey) != fingerprint() {
            // An entry this build cannot prove it wrote — reading or
            // overwriting it is what prompts. Retire it after a prompt-free
            // existence check and report the ordinary signed-out case.
            retireForeignEntryIfNeeded()
            lastReadStatus = errSecItemNotFound
            return nil
        }
        let (status, data) = backend.read(service: service, account: account)
        lastReadStatus = status
        debugLog("[Keychain] token get status=\(status)")
        guard status == errSecSuccess, let data,
              let token = String(data: data, encoding: .utf8) else { return nil }
        cached = token
        return token
    }

    func set(_ token: String) {
        if retiresForeignEntries, defaults.string(forKey: noteKey) != fingerprint() {
            // Signing in has to retire too, not only reading: overwriting a
            // foreign item is the other way to be asked for the password.
            retireForeignEntryIfNeeded()
        }
        let status = backend.write(service: service, account: account, data: Data(token.utf8))
        lastWriteStatus = status
        debugLog("[Keychain] token set status=\(status)")
        cached = token
        if status == errSecSuccess {
            defaults.set(fingerprint() ?? "", forKey: noteKey)
            defaults.removeObject(forKey: refusalKey)
        } else {
            // The note means "this build's own write is known to have landed"
            // — a note that outlives a failed write has the next launch read
            // an entry this build cannot read.
            defaults.removeObject(forKey: noteKey)
            recordedWriteFailure = true
            defaults.set(Int(status), forKey: refusalKey)
        }
    }

    func clear() {
        cached = nil
        didRead = true
        backend.delete(service: service, account: account)
        defaults.removeObject(forKey: noteKey)
        if recordedWriteFailure {
            // Signing out of the session the refused write was about stands
            // the explanation down — the next sign-in screen has nothing to
            // explain. A refusal from an *earlier* launch is not this store's
            // to clear: it is the whole reason this launch found no session.
            recordedWriteFailure = false
            defaults.removeObject(forKey: refusalKey)
        }
    }

    /// The reason the last write failed, taken — the explanation belongs to
    /// one sign-in screen. Recorded on `set`, stood down on success, cleared
    /// with the token it was about.
    func takeWriteRefusal() -> OSStatus? {
        guard defaults.object(forKey: refusalKey) != nil else { return nil }
        let status = OSStatus(defaults.integer(forKey: refusalKey))
        defaults.removeObject(forKey: refusalKey)
        return status
    }

    /// Delete a foreign entry — once per store, and only after the
    /// prompt-free existence check says there is something to delete.
    private func retireForeignEntryIfNeeded() {
        guard !didRetireForeign, backend.hasEntry(service: service, account: account) else { return }
        didRetireForeign = true
        backend.retireEntry(service: service, account: account)
        defaults.removeObject(forKey: noteKey)
    }

    private func debugLog(_ message: String) {
        #if DEBUG
        if ProcessInfo.processInfo.environment["FH_AUTOLOGIN"] == "1" {
            fhLog(message)
        }
        #endif
    }
}
