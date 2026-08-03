import Foundation
import Security
import FiHavenCore

/// `TokenStore` backed by the iOS/macOS Keychain. The Bearer token is the
/// only secret the app stores; it's kept as a generic-password item that
/// survives reinstalls-in-place and is readable after first unlock.
///
/// Accessibility is `…ThisDeviceOnly`: the token is a long-lived (30-day)
/// credential to a financial account, so it must not travel in an encrypted
/// device backup or restore onto a different device. Plain
/// `AfterFirstUnlock` — the previous setting — does exactly that.
final class KeychainTokenStore: TokenStore, @unchecked Sendable {
    private let service: String
    private let account = "bearer-token"

    init(service: String) {
        self.service = service
    }

    func get() -> String? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func set(_ token: String) {
        let data = Data(token.utf8)
        // Rewrite accessibility on update too. An item added by an older build
        // keeps its original (backup-eligible) attribute otherwise, so the
        // hardening would never reach anyone who was already signed in.
        let update: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let status = SecItemUpdate(baseQuery() as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var add = baseQuery()
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            SecItemAdd(add as CFDictionary, nil)
        }
    }

    func clear() {
        SecItemDelete(baseQuery() as CFDictionary)
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}
