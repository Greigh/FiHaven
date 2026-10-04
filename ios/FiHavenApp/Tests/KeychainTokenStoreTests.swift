import XCTest
import Security
import LocalAuthentication

@testable import FiHaven

/// A keychain that answers whatever a test needs. A *refusal* is the case worth
/// scripting: macOS produces one only when a differently signed build wrote the
/// item, which cannot be arranged on purpose in a unit test (or on a healthy
/// machine at all).
private final class ScriptedKeychain: KeychainBackend, @unchecked Sendable {
    /// What a read answers when there *is* an item. An item that isn't there
    /// always reads as `errSecItemNotFound`, which is the one thing a real
    /// keychain never negotiates: `errSecAuthFailed` with no item would be a
    /// refusal of something that does not exist, and the store would have no
    /// way to hit the refusal path it must handle.
    var readStatus: OSStatus
    var writeStatus: OSStatus
    var deleteStatus: OSStatus
    private var value: Data?

    private(set) var reads = 0
    private(set) var writes = 0
    private(set) var deletes = 0
    private(set) var presenceChecks = 0
    private(set) var retires = 0
    /// Every service name the store asked about, so a test can prove which entry
    /// a build reaches for.
    private(set) var services: [String] = []
    private(set) var accounts: [String] = []

    init(readStatus: OSStatus = errSecSuccess, stored: String? = nil, writeStatus: OSStatus = errSecSuccess, deleteStatus: OSStatus = errSecSuccess) {
        self.readStatus = readStatus
        self.value = stored.map { Data($0.utf8) }
        self.writeStatus = writeStatus
        self.deleteStatus = deleteStatus
    }

    func read(service: String, account: String) -> (OSStatus, Data?) {
        reads += 1
        services.append(service)
        accounts.append(account)
        guard let value else { return (errSecItemNotFound, nil) }
        return (readStatus, value)
    }

    func write(service: String, account: String, data: Data) -> OSStatus {
        writes += 1
        services.append(service)
        accounts.append(account)
        if writeStatus == errSecSuccess { value = data }
        return writeStatus
    }

    @discardableResult
    func delete(service: String, account: String) -> OSStatus {
        deletes += 1
        services.append(service)
        accounts.append(account)
        if deleteStatus == errSecSuccess { value = nil }
        return deleteStatus
    }

    /// An item is there unless a successful delete or a failed write took it,
    /// which is the state a *foreign* entry would be found in: present, and not
    /// readable by the build asking.
    @discardableResult
    func hasEntry(service: String, account: String) -> Bool {
        presenceChecks += 1
        services.append(service)
        accounts.append(account)
        return value != nil
    }

    @discardableResult
    func retireEntry(service: String, account: String) -> OSStatus {
        retires += 1
        services.append(service)
        accounts.append(account)
        if deleteStatus == errSecSuccess { value = nil }
        return deleteStatus
    }
}

/// The store's policy, which is what a local run depends on: it reaches for its
/// own keychain entry, it asks the keychain once per process, and a refusal
/// leaves the session working in memory instead of signing the user out.
final class KeychainTokenStoreTests: XCTestCase {
    /// A scratch defaults domain for the "which build wrote this" note. It has
    /// to be a domain of its own: the note is app state, and a test run must
    /// neither read the developer's nor leave one behind.
    private let defaults = UserDefaults(suiteName: "app.fihaven.keychain.tests")!
    private let noteKey = KeychainEntryFingerprint.defaultsKey(forService: "test")

    override func setUp() {
        super.setUp()
        defaults.removePersistentDomain(forName: "app.fihaven.keychain.tests")
    }

    /// A store over the scratch domain, with a fixed identity. `writtenBy` is
    /// the note the entry claims to have been written by; nil leaves no note,
    /// which is what an entry from a build that predates the note looks like.
    private func store(_ backend: ScriptedKeychain,
                       service: String = "test",
                       writtenBy: String? = "build-a") -> KeychainTokenStore {
        if let writtenBy {
            defaults.set(writtenBy, forKey: KeychainEntryFingerprint.defaultsKey(forService: service))
        }
        return KeychainTokenStore(service: service, backend: backend,
                                  defaults: defaults, fingerprint: { "build-a" })
    }

    func testAnEmptyKeychainReadsAsSignedOut() {
        let store = KeychainTokenStore(service: "test", backend: ScriptedKeychain())
        XCTAssertNil(store.get())
        XCTAssertEqual(store.lastReadStatus, errSecItemNotFound)
    }

    func testAStoredTokenIsReturned() {
        let store = store(ScriptedKeychain(readStatus: errSecSuccess, stored: "tk-123"))
        XCTAssertEqual(store.get(), "tk-123")
        XCTAssertEqual(store.lastReadStatus, errSecSuccess)
    }

    func testTheKeychainIsReadOnceAndThenServedFromMemory() {
        let backend = ScriptedKeychain(readStatus: errSecSuccess, stored: "tk-123")
        let store = store(backend)
        // The API client asks for the token on every request; the keychain must
        // not be asked that often.
        for _ in 0..<5 { XCTAssertEqual(store.get(), "tk-123") }
        XCTAssertEqual(backend.reads, 1)
    }

    func testARefusedReadIsNotRetried() {
        // A refusal the user declined is answered once. Retrying would ask for
        // the login keychain password on every request instead of on launch.
        // This is a *shipped* build's situation: the policy that avoids the
        // question in a local build is off, so the read happens and the refusal
        // is reported.
        let backend = ScriptedKeychain(readStatus: errSecAuthFailed, stored: "tk-123")
        let store = KeychainTokenStore(service: "test", backend: backend, defaults: defaults,
                                       fingerprint: { "build-a" }, retiresForeignEntries: false)
        XCTAssertNil(store.get())
        XCTAssertEqual(store.lastReadStatus, errSecAuthFailed)
        XCTAssertNil(store.get())
        XCTAssertEqual(backend.reads, 1)
    }

    func testARefusedWriteStillSignsTheProcessIn() {
        let backend = ScriptedKeychain(writeStatus: errSecAuthFailed)
        let store = store(backend)

        store.set("tk-123")

        // The session works for this run…
        XCTAssertEqual(store.get(), "tk-123")
        XCTAssertEqual(store.lastWriteStatus, errSecAuthFailed)
        // …without a second write attempt, which would refuse again.
        XCTAssertEqual(backend.writes, 1)
        XCTAssertEqual(backend.reads, 0)
    }

    func testASuccessfulWriteIsRememberedAcrossRelaunch() {
        // The store that writes and the store that reads are different objects,
        // as they are across a relaunch; the keychain is what carries it over.
        let backend = ScriptedKeychain()
        store(backend).set("tk-123")

        // A fresh store over the same items is what the next launch looks like.
        let relaunched = store(backend)
        XCTAssertEqual(relaunched.get(), "tk-123")
        XCTAssertEqual(relaunched.lastReadStatus, errSecSuccess)
    }

    func testAClearedTokenIsNotReadBackFromTheKeychain() {
        // `clear()` is reached when the server says the token belongs to nobody.
        // Re-reading it would resurrect the session the app just retired.
        let backend = ScriptedKeychain(readStatus: errSecSuccess, stored: "tk-123")
        let store = store(backend)

        store.clear()

        XCTAssertNil(store.get())
        XCTAssertEqual(backend.reads, 0)
        XCTAssertEqual(backend.deletes, 1)
    }

    func testTheTokenIsWrittenUnderThisBuildsServiceName() {
        // The whole point of the debug service name: a local run must not be
        // able to reach — or overwrite, or delete — the shipped session.
        let backend = ScriptedKeychain()
        let store = store(backend, service: KeychainTokenStore.serviceName)
        store.set("tk-123")
        store.clear()
        XCTAssertEqual(backend.services, [store.service, store.service])
        XCTAssertEqual(Set(backend.services), [KeychainTokenStore.serviceName])
        XCTAssertEqual(Set(backend.accounts), ["bearer-token"])
    }

    func testDebugBuildsReadTheirOwnEntry() {
        #if DEBUG
        XCTAssertEqual(KeychainTokenStore.serviceName, "app.fihaven.debug")
        XCTAssertNotEqual(KeychainTokenStore.serviceName, KeychainTokenStore.shippedService)
        // And it retires rather than prompts, which is the whole of this change.
        XCTAssertTrue(KeychainTokenStore.retiresForeignEntries)
        #else
        XCTAssertEqual(KeychainTokenStore.serviceName, KeychainTokenStore.shippedService)
        XCTAssertFalse(KeychainTokenStore.retiresForeignEntries)
        #endif
    }

    // MARK: - An entry another build wrote

    /// The promise: a local build never *reads* an entry it cannot prove is its
    /// own, because that read is what asks for the login keychain password. The
    /// entry is retired instead, after a check that asks for nothing.
    func testAnEntryFromAnotherBuildIsRetiredRatherThanRead() {
        let backend = ScriptedKeychain(readStatus: errSecAuthFailed, stored: "tk-123")
        let store = store(backend, writtenBy: "an-older-build")

        XCTAssertNil(store.get())

        XCTAssertEqual(backend.reads, 0, "reading an entry this build does not own is the prompt")
        XCTAssertEqual(backend.presenceChecks, 1, "it is retired after a prompt-free existence check")
        XCTAssertEqual(backend.retires, 1)
        // Reported as the ordinary signed-out case, so the sign-in screen has no
        // keychain status to explain and the launch reads as a normal one.
        XCTAssertEqual(store.lastReadStatus, errSecItemNotFound)
    }

    /// No note at all gets the same answer: either nobody wrote the entry, or a
    /// build from before the note existed did. Neither may be read.
    func testAnEntryWithNoNoteIsRetired() {
        let backend = ScriptedKeychain(readStatus: errSecAuthFailed, stored: "tk-123")
        XCTAssertNil(store(backend, writtenBy: nil).get())
        XCTAssertEqual(backend.reads, 0)
        XCTAssertEqual(backend.retires, 1)
    }

    /// The same entry, read by the build that wrote it: the note matches and
    /// nothing is retired. Without this the fix would cost every launch.
    func testTheBuildThatWroteTheEntryStillReadsIt() {
        let backend = ScriptedKeychain(readStatus: errSecSuccess, stored: "tk-123")
        XCTAssertEqual(store(backend).get(), "tk-123")
        XCTAssertEqual(backend.reads, 1)
        XCTAssertEqual(backend.retires, 0)
    }

    /// Signing in has to retire too, not only reading: overwriting a foreign
    /// item is the other way to be asked for the password, and a local build
    /// signs in on most of its runs.
    func testSigningInRetiresAForeignEntryBeforeWriting() {
        let backend = ScriptedKeychain(readStatus: errSecAuthFailed, stored: "tk-someone-elses")
        let store = store(backend, writtenBy: "an-older-build")

        store.set("tk-mine")

        XCTAssertEqual(backend.retires, 1)
        XCTAssertEqual(backend.writes, 1)
        // The session works for this run, and no read was needed to make it.
        XCTAssertEqual(store.get(), "tk-mine")
        XCTAssertEqual(backend.reads, 0)
        // The note this build just wrote means the next launch finds its own
        // entry rather than retiring one it just wrote.
        XCTAssertEqual(defaults.string(forKey: noteKey), "build-a")
    }

    /// Once per process, however often the store is asked: the log line says what
    /// happened, and 980 of them is the problem this file exists to avoid.
    func testTheRetireHappensOncePerProcess() {
        let backend = ScriptedKeychain(readStatus: errSecAuthFailed, stored: "tk-123")
        let store = store(backend, writtenBy: "an-older-build")
        store.set("tk-a")
        store.set("tk-b")
        XCTAssertEqual(backend.retires, 1)
        XCTAssertEqual(backend.writes, 2)
    }

    /// A refused write must retract the note, even one that is already there:
    /// the note means "this build's own write is known to have landed", and a
    /// note that outlives a failed write has the next launch read an entry this
    /// build cannot read.
    func testARefusedWriteLeavesNoNote() {
        let backend = ScriptedKeychain(writeStatus: errSecAuthFailed)
        store(backend).set("tk-123")
        XCTAssertNil(defaults.string(forKey: noteKey))
        // And the next launch is a signed-out one rather than a read. The note
        // is what makes the difference, so this store has none — a relaunch
        // after a build that never wrote an item.
        XCTAssertNil(store(backend, writtenBy: nil).get())
        XCTAssertEqual(backend.reads, 0)
    }

    /// Signing out takes the note with the entry, so a later build that happens
    /// to match it does not look for something that is gone.
    func testClearingRemovesTheNote() {
        let backend = ScriptedKeychain()
        let store = store(backend)
        store.set("tk-123")
        store.clear()
        XCTAssertNil(defaults.string(forKey: noteKey))
    }

    /// A shipped build is not in this position and keeps its behaviour: it is
    /// signed the same way as every other copy of the same build, so there is
    /// nothing to retire, and when there is one, reading it and letting the user
    /// decide is the app's call rather than a scratch item's.
    func testAPolicyOffStoreStillReadsAndRefusesNormally() {
        let backend = ScriptedKeychain(readStatus: errSecAuthFailed, stored: "tk-123")
        let shipped = KeychainTokenStore(service: "test", backend: backend, defaults: defaults,
                                         fingerprint: { "build-a" }, retiresForeignEntries: false)
        XCTAssertNil(shipped.get())
        XCTAssertEqual(shipped.lastReadStatus, errSecAuthFailed)
        XCTAssertEqual(backend.reads, 1)
        XCTAssertEqual(backend.retires, 0)
    }

    /// The identity has to be the same on two calls in one process and has to
    /// exist at all — a build that cannot be identified leaves the old
    /// behaviour alone, which is the safe direction but not a fix.
    func testTheFingerprintIsStableWithinAProcess() {
        let first = KeychainEntryFingerprint.current()
        XCTAssertNotNil(first, "every build can identify itself: a signature, or its own bytes")
        XCTAssertEqual(first, KeychainEntryFingerprint.current())
    }

    /// The note is keyed by service, so the shipped and the debug entry never
    /// borrow each other's: a build that retired the debug one must not have
    /// retired the real session on its way past.
    func testTheNoteIsKeyedByService() {
        XCTAssertNotEqual(KeychainEntryFingerprint.defaultsKey(forService: "app.fihaven"),
                          KeychainEntryFingerprint.defaultsKey(forService: "app.fihaven.debug"))
    }

    // MARK: - A session the keychain would not remember

    /// The point of recording a refused write at all. Without it the *next*
    /// launch finds no entry, reads as `errSecItemNotFound`, and says nothing —
    /// so a keychain that refused to store the session is indistinguishable from
    /// one that forgot it, and the user is asked for a password they gave
    /// minutes ago with no reason given. The two stores are different objects,
    /// as they are across a relaunch.
    func testARefusedWriteIsStillThereForTheNextLaunch() {
        store(ScriptedKeychain(writeStatus: errSecAuthFailed)).set("tk-123")

        // The next launch: a store that never wrote anything, so it has no
        // status of its own to report and has to find the reason elsewhere.
        let relaunched = store(ScriptedKeychain())
        XCTAssertEqual(relaunched.lastWriteStatus, errSecSuccess,
                       "a launch that never wrote reports success, which is why the refusal had to be written down")
        XCTAssertEqual(relaunched.takeWriteRefusal(), errSecAuthFailed)
    }

    /// Taken, not merely read: the explanation belongs to one sign-in screen. A
    /// notice that survived being shown would follow the user into every later
    /// signed-out launch, explaining a sign-out that has nothing to do with it.
    func testTheExplanationIsTakenOnce() {
        store(ScriptedKeychain(writeStatus: errSecInteractionNotAllowed)).set("tk-123")

        let relaunched = store(ScriptedKeychain())
        XCTAssertEqual(relaunched.takeWriteRefusal(), errSecInteractionNotAllowed)
        XCTAssertNil(relaunched.takeWriteRefusal(), "a second sign-in screen is an ordinary one")
    }

    /// A write that works stands the refusal down: the session is saved now, so
    /// there is nothing left for the next launch to explain.
    func testASuccessfulWriteStandsTheRefusalDown() {
        store(ScriptedKeychain(writeStatus: errSecAuthFailed)).set("tk-123")
        store(ScriptedKeychain()).set("tk-123")

        XCTAssertNil(store(ScriptedKeychain()).takeWriteRefusal())
    }

    /// Signing out of a session the app just watched fail to save clears it: the
    /// user is leaving a session they have already been told about, and the next
    /// sign-in screen would be explaining a sign-out they did not experience.
    func testSigningOutOfTheRefusedSessionStandsItDown() {
        let refused = store(ScriptedKeychain(writeStatus: errSecAuthFailed))
        refused.set("tk-123")
        refused.clear()

        XCTAssertNil(store(ScriptedKeychain()).takeWriteRefusal())
    }

    /// The other direction, and the reason the sign-out above is conditional. A
    /// refusal from an *earlier* launch must outlive this launch retiring the
    /// token it was about — the retirement happens first, and it is the whole
    /// explanation of why this launch found no session.
    func testAnInheritedRefusalSurvivesTheRetirementOfTheTokenItWasAbout() {
        store(ScriptedKeychain(writeStatus: errSecAuthFailed)).set("tk-123")

        // The next launch restores an *older* token, and the server refuses it:
        // `AppEnvironment` clears the store, then asks for the explanation.
        let relaunched = store(ScriptedKeychain(readStatus: errSecSuccess, stored: "tk-old"))
        XCTAssertEqual(relaunched.get(), "tk-old")
        relaunched.clear()

        XCTAssertEqual(relaunched.takeWriteRefusal(), errSecAuthFailed)
    }

    /// Keyed by service like every other note here: a local build's refusal must
    /// never be the reason the installed app's sign-in screen gives.
    func testTheRefusalIsKeyedByService() {
        store(ScriptedKeychain(writeStatus: errSecAuthFailed),
              service: "app.fihaven.debug").set("tk-123")

        XCTAssertNil(store(ScriptedKeychain(), service: "app.fihaven").takeWriteRefusal())
        XCTAssertNotEqual(KeychainTokenStore.writeRefusalDefaultsKey(forService: "app.fihaven"),
                          KeychainTokenStore.writeRefusalDefaultsKey(forService: "app.fihaven.debug"))
    }

    /// The two explanations are not the same event and must not be crossed: an
    /// entry that exists and cannot be *read* is the sign-in screen's other
    /// notice, and it is reported from the read status, not from here.
    func testARefusedReadIsNotReportedAsARefusedWrite() {
        let store = store(ScriptedKeychain(readStatus: errSecAuthFailed, stored: "tk-123"),
                          writtenBy: "an-older-build")

        XCTAssertNil(store.get())
        XCTAssertEqual(store.lastReadStatus, errSecItemNotFound, "retired, so it reads as signed out")
        XCTAssertNil(store.takeWriteRefusal(), "nothing was written, so nothing was refused")
    }

    // MARK: - What the item is written as

    /// Records what a write sends, so the accessibility claim can be checked
    /// against the dictionaries rather than against the code that builds them.
    private final class RecordedWrite {
        private(set) var updates: [([String: Any], [String: Any])] = []
        private(set) var adds: [[String: Any]] = []
        /// What the update and the add answer, in that order; the last entry
        /// repeats, which is what lets a test walk the add-after-update path.
        private var script: [OSStatus] = []
        private var cursor = 0

        init(answering script: [OSStatus] = [errSecSuccess]) {
            self.script = script
        }

        var itemWrite: SecurityKeychain.ItemWrite {
            SecurityKeychain.ItemWrite(update: { [self] query, attributes in
                updates.append((query, attributes))
                return next()
            }, add: { [self] attributes in
                adds.append(attributes)
                return next()
            })
        }

        /// Every accessibility any of those dictionaries carried, in the order
        /// they were sent. `nil` where a dictionary left the attribute out,
        /// which is the failure this whole section is about — so it has to be
        /// comparable rather than merely present.
        var accessibilities: [String?] {
            updates.map { $0.1[kSecAttrAccessible as String] as? String }
                + adds.map { $0[kSecAttrAccessible as String] as? String }
        }

        private func next() -> OSStatus {
            defer { cursor += 1 }
            return script[min(cursor, script.count - 1)]
        }
    }

    /// The hardening, checked where it can be checked: every write this type
    /// sends — the update and the add — carries `…ThisDeviceOnly`, so the token
    /// cannot travel in a backup or a sync. Nothing else observes this: a typo
    /// here is invisible in a screenshot, in a log, and in a launch.
    func testEveryWriteCarriesThisDeviceOnlyAccessibility() {
        let recorded = RecordedWrite(answering: [errSecSuccess])
        let keychain = SecurityKeychain()

        keychain.write(service: "test", account: "bearer-token", data: Data("tk-123".utf8), via: recorded.itemWrite)

        XCTAssertEqual(recorded.updates.count, 1, "an existing item is updated, not replaced")
        XCTAssertTrue(recorded.adds.isEmpty, "and nothing is created when the update worked")
        XCTAssertEqual(recorded.accessibilities, [SecurityKeychain.accessibility as String])
    }

    /// A first sign-in has no item to update, so the **add** is the path that
    /// creates the session — and it is the path that had no coverage.
    func testTheAddPathCarriesTheSameAccessibility() {
        let recorded = RecordedWrite(answering: [errSecItemNotFound, errSecSuccess])
        let keychain = SecurityKeychain()

        keychain.write(service: "test", account: "bearer-token", data: Data("tk-123".utf8), via: recorded.itemWrite)

        XCTAssertEqual(recorded.updates.count, 1)
        XCTAssertEqual(recorded.adds.count, 1)
        XCTAssertEqual(recorded.adds.first?[kSecValueData as String] as? Data, Data("tk-123".utf8))
        XCTAssertEqual(recorded.accessibilities,
                       [SecurityKeychain.accessibility as String, SecurityKeychain.accessibility as String])
    }

    /// The value itself, spelled out. `…ThisDeviceOnly` and plain
    /// `…AfterFirstUnlock` differ by one word and one security property, and the
    /// second is what the app used to ship — so a check written in terms of the
    /// constant would pass for a constant that had been changed to the weaker
    /// value. This one cannot.
    func testTheAccessibilityIsThisDeviceOnlyAndNotBackupEligible() {
        let accessibility = SecurityKeychain.accessibility as String
        XCTAssertEqual(accessibility, kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String)
        // The two settings that would put a 30-day financial token into a backup
        // or an iCloud Keychain, named so the failure is obvious.
        XCTAssertNotEqual(accessibility, kSecAttrAccessibleAfterFirstUnlock as String)
        XCTAssertNotEqual(accessibility, kSecAttrAccessibleWhenUnlocked as String)
        XCTAssertNotEqual(accessibility, kSecAttrAccessibleAlways as String)
    }

    /// An item an older build created is brought up to the current setting, and
    /// the way to know that is checked is the *update* carrying the attribute —
    /// a `SecItemUpdate` that sets only the data leaves the old, weaker one in
    /// place forever, which is precisely the regression this section exists for.
    func testAnExistingItemIsBroughtUpToTheCurrentAccessibility() {
        let recorded = RecordedWrite(answering: [errSecSuccess])
        let keychain = SecurityKeychain()

        keychain.write(service: "test", account: "bearer-token", data: Data("fresh-token".utf8), via: recorded.itemWrite)

        let attributes = recorded.updates.first?.1
        XCTAssertEqual(attributes?[kSecValueData as String] as? Data, Data("fresh-token".utf8))
        XCTAssertEqual(attributes?[kSecAttrAccessible as String] as? String,
                       kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String,
                       "an item from an older build must not keep its old accessibility")
    }

    /// Two runs of one build can race between the update and the add, and the
    /// loser has to take the item over rather than leave the session in memory
    /// only. The retry is a second *update*, so it carries the attribute too.
    func testTheDuplicateItemRetryUpdatesRatherThanCreates() {
        let recorded = RecordedWrite(answering: [errSecItemNotFound, errSecDuplicateItem, errSecSuccess])
        let keychain = SecurityKeychain()

        let status = keychain.write(service: "test", account: "bearer-token",
                                    data: Data("tk-123".utf8), via: recorded.itemWrite)

        XCTAssertEqual(status, errSecSuccess)
        XCTAssertEqual(recorded.adds.count, 1, "one attempt to create")
        XCTAssertEqual(recorded.updates.count, 2, "and the retry is an update, so the item is taken over")
        XCTAssertEqual(recorded.updates.last?.1[kSecAttrAccessible as String] as? String,
                       kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String)
    }

    /// The attribute as the *keychain* reports it, where the platform will report
    /// it. The section above checks what the app asks for; this checks what was
    /// stored, which is the half that no amount of reading the code can answer.
    ///
    /// Two measured reasons it is a partial check, both stated so the gap is
    /// visible rather than assumed away:
    ///
    /// - **macOS cannot answer it.** The login keychain accepts
    ///   `kSecAttrAccessible` on a write and then *discards* it: the attributes
    ///   read back are class, account, service, label and two timestamps, and no
    ///   `kSecAttrAccessible` (measured, with a working keychain — the add
    ///   succeeded, the read succeeded, the attribute was simply absent). The
    ///   attribute belongs to the data-protection keychain, which is what the
    ///   iOS item lives on and where the backup-and-restore concern behind the
    ///   setting is real.
    /// - **This test host is unsigned**, because the project builds with
    ///   `CODE_SIGNING_ALLOWED=NO`, and an unsigned app is refused by the
    ///   keychain with `errSecMissingEntitlement` before it is given an item at
    ///   all (measured: -34018 from the add, the update and the read alike).
    ///
    /// So the round trip runs on a signed iOS build and says why it did not run
    /// here, rather than passing on an empty keychain.
    func testTheStoredItemCarriesTheAccessibilityTheCodeClaims() throws {
        #if os(macOS)
        throw XCTSkip("the macOS login keychain does not store kSecAttrAccessible (measured)")
        #else
        let service = "app.fihaven.tests.accessibility"
        let account = "bearer-token"
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        defer { SecItemDelete(query as CFDictionary) }
        SecItemDelete(query as CFDictionary)

        let keychain = SecurityKeychain()
        let status = keychain.write(service: service, account: account, data: Data("tk-test".utf8))
        try XCTSkipIf(status == errSecMissingEntitlement,
                      "unsigned test host: the keychain refuses before it is given an item (measured -34018)")

        XCTAssertEqual(status, errSecSuccess)

        // Attributes only, never the secret: that is the one query about an item
        // that does not ask the user for their login keychain password, and it
        // is the only reason this check can look at an item it did not create.
        var read = query
        read[kSecReturnAttributes as String] = true
        read[kSecMatchLimit as String] = kSecMatchLimitOne
        let context = LAContext()
        context.interactionNotAllowed = true
        read[kSecUseAuthenticationContext as String] = context
        var item: CFTypeRef?
        XCTAssertEqual(SecItemCopyMatching(read as CFDictionary, &item), errSecSuccess)

        let attributes = item as? [String: Any] ?? [:]
        XCTAssertEqual(attributes[kSecAttrAccessible as String] as? String,
                       kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String,
                       "the item the keychain stored is not what the code claims to have written")
        #endif
    }
}
