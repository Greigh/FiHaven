import Foundation
import FiHavenCore

/// Optional end-to-end checks against a running server. Enabled only when
/// `FH_LIVE_TOKEN` is set (a token-mode session id), so the default run
/// stays hermetic. `FH_BASE` overrides the base URL.
///
///   node seed-a-token … ; FH_LIVE_TOKEN=<id> swift run FiHavenCoreChecks
func runLiveChecks() async {
    let env = ProcessInfo.processInfo.environment
    guard let token = env["FH_LIVE_TOKEN"], !token.isEmpty else {
        print("• Live server checks — skipped (set FH_LIVE_TOKEN to enable)")
        return
    }
    let base = env["FH_BASE"] ?? "http://localhost:5222"
    guard let url = URL(string: base) else {
        check(false, "FH_BASE is not a valid URL: \(base)")
        return
    }
    let client = APIClient(config: APIConfig(baseURL: url), tokens: InMemoryTokenStore(token))

    await sectionAsync("Live — me() validates the token") {
        let user = try await client.me()
        check(user != nil, "me() returns a user for a valid token")
    }

    await sectionAsync("Live — data fetch + save round-trip (restores after)") {
        let original = try await client.fetchData()
        let marker = "live-check-marker"

        var mutated = original
        mutated.bills.append(Bill(id: "999999", name: marker, category: "Other",
                                  amount: 12.34, dueDay: 9))
        try await client.saveData(mutated)

        let reloaded = try await client.fetchData()
        check(reloaded.bills.contains { $0.name == marker },
              "appended bill round-trips through the live server")

        // Restore the account to exactly what we found.
        try await client.saveData(original)
        let restored = try await client.fetchData()
        check(!restored.bills.contains { $0.name == marker },
              "cleanup restored the original dataset")
    }
}
