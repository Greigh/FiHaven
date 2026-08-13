import Foundation
import FiHavenCore
@testable import FiHaven

/// A store wired to a stub network and a throwaway cache directory, so a test
/// can seed `data` through `mutate` without writing to the real offline cache
/// or letting a debounced save reach a server.
@MainActor
enum TestStore {
    static func make() -> AppStore {
        MockURLProtocol.reset()
        // Any debounced save lands here rather than on the network.
        MockURLProtocol.handler = { _ in (200, Data("{}".utf8)) }
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("fh-tests-\(UUID().uuidString)", isDirectory: true)
        let api = APIClient(
            config: APIConfig(baseURL: URL(string: "https://example.invalid")!),
            tokens: InMemoryTokenStore("test-token"),
            session: MockURLProtocol.session()
        )
        return AppStore(api: api, cache: OfflineCache(directory: dir))
    }
}
