import Foundation
import FiHavenCore

func runAPIChecks() async {
    let cfg = APIConfig.localhost

    await sectionAsync("APIClient — data GET sends Bearer, no auth-mode") {
        MockURLProtocol.reset()
        let client = APIClient(config: cfg, tokens: InMemoryTokenStore("abc123"),
                               session: MockURLProtocol.session())
        MockURLProtocol.handler = { _ in (200, seedDataJSON) }
        let data = try await client.fetchData()
        checkEqual(data.bills.count, 2, "fetchData decodes bills")
        checkEqual(data.settings.timezone, "America/New_York", "fetchData decodes settings")

        let req = MockURLProtocol.lastRequest
        check(req?.url?.absoluteString == "http://localhost:5222/api/data",
              "GET /data URL = \(req?.url?.absoluteString ?? "nil")")
        check(req?.value(forHTTPHeaderField: "Authorization") == "Bearer abc123",
              "Authorization: Bearer present")
        check(req?.value(forHTTPHeaderField: "X-Auth-Mode") == nil,
              "no X-Auth-Mode on data GET")
    }

    await sectionAsync("APIClient — login sets token-mode + JSON body, stores token") {
        MockURLProtocol.reset()
        let tokens = InMemoryTokenStore()
        let client = APIClient(config: cfg, tokens: tokens, session: MockURLProtocol.session())
        MockURLProtocol.handler = { _ in
            (200, Data(#"{"user":{"email":"d@e.com","name":"D"},"csrfToken":"x","token":"TKN"}"#.utf8))
        }
        let outcome = try await client.login(email: "d@e.com", password: "pw",
                                             captchaToken: "tok", loginStartedAt: 123)
        if case .authenticated(let s) = outcome {
            checkEqual(s.token, "TKN", "login returns token")
            checkEqual(s.user.email, "d@e.com", "login returns user")
        } else {
            check(false, "login should be .authenticated")
        }
        checkEqual(tokens.get(), "TKN", "token persisted to store")

        let req = MockURLProtocol.lastRequest
        check(req?.value(forHTTPHeaderField: "X-Auth-Mode") == "token", "login sends X-Auth-Mode: token")
        check(req?.value(forHTTPHeaderField: "Content-Type") == "application/json", "login content-type JSON")
        check(req?.url?.absoluteString == "http://localhost:5222/api/auth/login", "login URL")

        if let body = MockURLProtocol.lastBody,
           let obj = try? JSONDecoder().decode([String: JSONValue].self, from: body) {
            checkEqual(obj["email"]?.asString, "d@e.com", "login body email")
            checkEqual(obj["website"]?.asString, "", "login body honeypot empty")
            checkClose(obj["loginStartedAt"]?.asDouble ?? -1, 123, "login body loginStartedAt")
        } else {
            check(false, "login body decodes as JSON object")
        }
    }

    await sectionAsync("APIClient — login MFA required") {
        MockURLProtocol.reset()
        let client = APIClient(config: cfg, tokens: InMemoryTokenStore(),
                               session: MockURLProtocol.session())
        MockURLProtocol.handler = { _ in
            (200, Data(#"{"mfaRequired":true,"mfaToken":"MFA","methods":["totp","email"]}"#.utf8))
        }
        let outcome = try await client.login(email: "x", password: "y",
                                             captchaToken: "t", loginStartedAt: 0)
        if case .mfaRequired(let ch) = outcome {
            checkEqual(ch.mfaToken, "MFA", "mfaToken parsed")
            checkEqual(ch.methods, ["totp", "email"], "methods parsed")
        } else {
            check(false, "login should be .mfaRequired")
        }
    }

    await sectionAsync("APIClient — verifyMfa stores token (null name)") {
        MockURLProtocol.reset()
        let tokens = InMemoryTokenStore()
        let client = APIClient(config: cfg, tokens: tokens, session: MockURLProtocol.session())
        MockURLProtocol.handler = { _ in
            (200, Data(#"{"user":{"email":"d@e.com","name":null},"token":"TKN2"}"#.utf8))
        }
        let s = try await client.verifyMfa(mfaToken: "MFA", code: "123456")
        checkEqual(s.token, "TKN2", "verifyMfa token")
        check(s.user.name == nil, "null name → nil")
        checkEqual(tokens.get(), "TKN2", "token persisted")
        let req = MockURLProtocol.lastRequest
        check(req?.value(forHTTPHeaderField: "X-Auth-Mode") == "token", "verifyMfa sends token mode")
    }

    await sectionAsync("APIClient — 401 maps to .unauthenticated") {
        MockURLProtocol.reset()
        let client = APIClient(config: cfg, tokens: InMemoryTokenStore("t"),
                               session: MockURLProtocol.session())
        MockURLProtocol.handler = { _ in (401, Data(#"{"error":"unauthenticated"}"#.utf8)) }
        do {
            _ = try await client.fetchData()
            check(false, "should have thrown")
        } catch let e as APIError {
            check(e == .unauthenticated, "401 → .unauthenticated (got \(e))")
        }
    }

    await sectionAsync("APIClient — non-401 error carries server code") {
        MockURLProtocol.reset()
        let client = APIClient(config: cfg, tokens: InMemoryTokenStore(),
                               session: MockURLProtocol.session())
        MockURLProtocol.handler = { _ in (400, Data(#"{"error":"weak-password"}"#.utf8)) }
        do {
            _ = try await client.signup(email: "a@b.com", password: "short",
                                        captchaToken: "t", loginStartedAt: 0)
            check(false, "should have thrown")
        } catch let e as APIError {
            checkEqual(e.serverCode, "weak-password", "serverCode from error body")
        }
    }

    await sectionAsync("APIClient — logout clears token even on failure") {
        MockURLProtocol.reset()
        MockURLProtocol.failWithTransportError = true
        let tokens = InMemoryTokenStore("t")
        let client = APIClient(config: cfg, tokens: tokens, session: MockURLProtocol.session())
        try await client.logout()
        check(tokens.get() == nil, "token cleared after logout")
    }

    await sectionAsync("APIClient — fetchCardPresets") {
        MockURLProtocol.reset()
        let client = APIClient(config: cfg, tokens: InMemoryTokenStore("t"),
                               session: MockURLProtocol.session())
        MockURLProtocol.handler = { _ in
            (200, Data(#"""
            {"presets":[{"id":"amex-gold","issuer":"American Express","name":"Gold Card","network":"Amex","rewardBase":1,"rewardCategories":{"Dining":4},"pointValue":2,"updatedAt":123}]}
            """#.utf8))
        }
        let presets = try await client.fetchCardPresets()
        checkEqual(presets.count, 1, "one preset")
        checkEqual(presets[0].id, "amex-gold", "preset id")
        checkClose(presets[0].updatedAt ?? -1, 123, "updatedAt")
        checkClose(presets[0].rewardCategories["Dining"] ?? -1, 4, "Dining rate")
        let req = MockURLProtocol.lastRequest
        check(req?.url?.absoluteString == "http://localhost:5222/api/card-presets",
              "GET /api/card-presets URL")
    }
}
