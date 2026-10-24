import Foundation
import XCTest
import FiHavenCore
@testable import FiHaven

/// F7 regression, Apple side: a save scheduled under one store/session must
/// never write under another, a never-loaded placeholder must never be PUT,
/// and a successful write must not retire a pending flag for data the server
/// never saw. Mirrors `DataSaveBoundaryTest` on Android — same boundaries,
/// same failure shapes the sweep kept hitting.
///
/// `TestStore.make()` wires an `AppStore` to `MockURLProtocol`; each test
/// installs a handler that records the request bodies arriving at
/// `PUT /api/data`, which is the assertion surface.
@MainActor
final class SaveBoundaryTests: XCTestCase {

    /// Recorded `(method, path, body)` tuples for every request the store made.
    private var recorded: [(String, String, String)] = []

    private func makeStore() -> AppStore {
        MockURLProtocol.reset()
        recorded = []
        MockURLProtocol.handler = { [self] req in
            // URLSession hands the body over as a stream, not `httpBody` —
            // drain it or every recorded PUT reads "".
            var data = req.httpBody ?? Data()
            if data.isEmpty, let stream = req.httpBodyStream {
                stream.open()
                let buf = UnsafeMutablePointer<UInt8>.allocate(capacity: 1 << 16)
                while stream.hasBytesAvailable {
                    let n = stream.read(buf, maxLength: 1 << 16)
                    if n <= 0 { break }
                    data.append(buf, count: n)
                }
                buf.deallocate()
                stream.close()
            }
            let body = String(decoding: data, as: UTF8.self)
            let path = req.url?.path ?? ""
            self.recorded.append((req.httpMethod ?? "", path, body))
            if path.hasSuffix("/api/data"), req.httpMethod == "GET" {
                return (200, Data(#"{"email":"owner@x.test","bills":[]}"#.utf8))
            }
            return (200, Data("{}".utf8))
        }
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("fh-tests-\(UUID().uuidString)", isDirectory: true)
        let api = APIClient(
            config: APIConfig(baseURL: URL(string: "https://example.invalid")!),
            tokens: InMemoryTokenStore("test-token"),
            session: MockURLProtocol.session()
        )
        return AppStore(api: api, expectedOwner: "owner@x.test", cache: OfflineCache(directory: dir))
    }

    private func puts() -> [String] {
        recorded.filter { $0.0 == "PUT" && $0.1.hasSuffix("/api/data") }.map { $0.2 }
    }

    func testLoadedStoreMutateAndFlushLands() async throws {
        let store = makeStore()
        await store.load()
        XCTAssertTrue(store.loaded)
        store.mutate { $0.bills.append(Bill(id: "bm1", name: "Boundary-Marker")) }
        await store.flush()
        XCTAssertTrue(puts().contains { $0.contains("Boundary-Marker") },
                      "the edit never reached the server: \(puts())")
    }

    func testMutateBeforeAnyLoadPushesNothing() async throws {
        let store = makeStore()
        // Never loaded: the boundary must refuse to persist a placeholder,
        // even under an explicit flush.
        store.mutate { $0.bills.append(Bill(id: "ph1", name: "Phantom")) }
        await store.flush()
        XCTAssertTrue(puts().isEmpty, "never-loaded data was PUT: \(puts())")
    }

    func testSupersededStoreCannotPush() async throws {
        let store = makeStore()
        await store.load()
        store.mutate { $0.bills.append(Bill(id: "os1", name: "Old-Store-Edit")) }
        store.supersede() // same account re-entered — this store's writers die
        await store.flush()
        XCTAssertTrue(puts().isEmpty,
                      "a superseded store still wrote: \(puts())")
    }

    func testEndedSessionCannotPush() async throws {
        let store = makeStore()
        await store.load()
        store.mutate { $0.bills.append(Bill(id: "so1", name: "Signed-Out-Edit")) }
        store.endSession()
        await store.flush()
        XCTAssertTrue(puts().isEmpty,
                      "a store wrote after its session ended: \(puts())")
    }

    /// A save completing must not clear `pendingWrite` for a snapshot the
    /// server never saw — the newer edit queued on disk behind it keeps the
    /// flag so the next launch replays it.
    func testMarkSyncedOnlyRetiresTheSnapshotTheServerAccepted() throws {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("fh-tests-\(UUID().uuidString)", isDirectory: true)
        let cache = OfflineCache(directory: dir)
        var first = AppData(email: "owner@x.test")
        first.bills.append(Bill(id: "s1", name: "Sent"))
        XCTAssertTrue(cache.write(data: first, owner: "owner@x.test", pendingWrite: true))

        // A newer edit lands while the first PUT is still in flight.
        var second = first
        second.bills.append(Bill(id: "n1", name: "Newer"))
        XCTAssertTrue(cache.write(data: second, owner: "owner@x.test", pendingWrite: true))

        // The PUT carrying `first` succeeds — the ack must not retire `second`.
        XCTAssertFalse(cache.markSynced(ifMatches: first),
                       "a stale ack retired a pending snapshot it never covered")
        XCTAssertTrue(cache.read(owner: "owner@x.test")?.pendingWrite == true)

        // An ack for the snapshot actually on disk does retire it.
        XCTAssertTrue(cache.markSynced(ifMatches: second))
        XCTAssertTrue(cache.read(owner: "owner@x.test")?.pendingWrite == false)
    }
}
