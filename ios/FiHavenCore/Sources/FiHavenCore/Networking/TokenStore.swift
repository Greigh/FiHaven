import Foundation

/// Persists the Bearer token. The app provides a Keychain-backed
/// implementation; the core ships an in-memory one for tests/previews.
public protocol TokenStore: Sendable {
    func get() -> String?
    func set(_ token: String)
    func clear()
}

/// Thread-safe in-memory token store (tests, previews).
public final class InMemoryTokenStore: TokenStore, @unchecked Sendable {
    private let lock = NSLock()
    private var token: String?

    public init(_ token: String? = nil) {
        self.token = token
    }

    public func get() -> String? {
        lock.lock(); defer { lock.unlock() }
        return token
    }

    public func set(_ token: String) {
        lock.lock(); self.token = token; lock.unlock()
    }

    public func clear() {
        lock.lock(); token = nil; lock.unlock()
    }
}
