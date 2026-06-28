import Foundation

#if canImport(FoundationNetworking)
import FoundationNetworking  // URLSession lives here on Linux
#endif

/// Type-erased Encodable so `makeRequest` can take any body.
struct AnyEncodable: Encodable {
    private let _encode: (Encoder) throws -> Void
    init(_ wrapped: Encodable) { _encode = { try wrapped.encode(to: $0) } }
    func encode(to encoder: Encoder) throws { try _encode(encoder) }
}

/// Talks to the FiHaven REST API using token/Bearer auth
/// (docs/native-contract.md §3–4). Stateless apart from the injected
/// `TokenStore`; safe to share.
public final class APIClient: Sendable {
    public enum Method: String {
        case GET, POST, PUT, DELETE
    }

    // Module-internal so endpoint extensions (e.g. APIClient+Household) can
    // build their own requests (the SSE stream needs the raw session).
    let config: APIConfig
    let tokens: TokenStore
    let session: URLSession

    public init(config: APIConfig, tokens: TokenStore, session: URLSession = .shared) {
        self.config = config
        self.tokens = tokens
        self.session = session
    }

    // ── Request building (internal so tests can assert it) ───────────

    func makeRequest(
        path: String,
        method: Method,
        body: AnyEncodable? = nil,
        tokenMode: Bool = false
    ) throws -> URLRequest {
        let url = config.baseURL.appendingPathComponent(path)
        var req = URLRequest(url: url)
        req.httpMethod = method.rawValue
        if let token = tokens.get() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if tokenMode {
            req.setValue("token", forHTTPHeaderField: "X-Auth-Mode")
        }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(body)
        }
        return req
    }

    /// Sends a request, mapping non-2xx into APIError. 401 → `.unauthenticated`.
    /// `internal` so the account/MFA extension can reuse it.
    @discardableResult
    func send(_ req: URLRequest) async throws -> Data {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw APIError.transport(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else {
            throw APIError.transport("Non-HTTP response")
        }
        if http.statusCode == 401 { throw APIError.unauthenticated }
        guard (200..<300).contains(http.statusCode) else {
            let code = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error
            throw APIError.http(status: http.statusCode, code: code)
        }
        return data
    }

    func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decoding(String(describing: error))
        }
    }

    // ── Auth ─────────────────────────────────────────────────────────

    /// Epoch-ms timestamp for the anti-bot `loginStartedAt` field. Capture
    /// when the auth screen appears; submit must be ≥ 2500 ms later.
    public static func now() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }

    public func signup(
        email: String,
        password: String,
        captchaToken: String,
        loginStartedAt: Int64
    ) async throws -> AuthSession {
        let body = LoginRequest(
            email: email, password: password,
            captchaToken: captchaToken, loginStartedAt: loginStartedAt, website: ""
        )
        let req = try makeRequest(path: "api/auth/signup", method: .POST,
                                  body: AnyEncodable(body), tokenMode: true)
        let data = try await send(req)
        return try storeSession(from: data)
    }

    public func login(
        email: String,
        password: String,
        captchaToken: String,
        loginStartedAt: Int64
    ) async throws -> LoginOutcome {
        let body = LoginRequest(
            email: email, password: password,
            captchaToken: captchaToken, loginStartedAt: loginStartedAt, website: ""
        )
        let req = try makeRequest(path: "api/auth/login", method: .POST,
                                  body: AnyEncodable(body), tokenMode: true)
        let data = try await send(req)

        if let mfa = try? JSONDecoder().decode(MfaResponse.self, from: data),
           mfa.mfaRequired == true {
            return .mfaRequired(MfaChallenge(
                mfaToken: mfa.mfaToken ?? "",
                methods: mfa.methods ?? []
            ))
        }
        return .authenticated(try storeSession(from: data))
    }

    /// Finish an MFA login with a TOTP / email / backup code.
    public func verifyMfa(mfaToken: String, code: String) async throws -> AuthSession {
        let body = MfaVerifyRequest(mfaToken: mfaToken, code: code)
        let req = try makeRequest(path: "api/auth/mfa/verify", method: .POST,
                                  body: AnyEncodable(body), tokenMode: true)
        let data = try await send(req)
        return try storeSession(from: data)
    }

    /// Exchange a provider OIDC ID token (Apple / Google) for a session.
    /// A federated provider is the auth factor, so this never returns an MFA
    /// challenge. `name` is only meaningful on Apple's first authorization.
    public func oauthSignIn(provider: String, idToken: String, name: String? = nil) async throws -> AuthSession {
        let body = OAuthSignInRequest(idToken: idToken, name: name)
        let req = try makeRequest(path: "api/auth/oauth/\(provider)", method: .POST,
                                  body: AnyEncodable(body), tokenMode: true)
        let data = try await send(req)
        return try storeSession(from: data)
    }

    /// Request an emailed 6-digit code for the email-MFA path.
    public func sendEmailCode(mfaToken: String) async throws {
        let body = MfaTokenRequest(mfaToken: mfaToken)
        let req = try makeRequest(path: "api/auth/mfa/email/send", method: .POST,
                                  body: AnyEncodable(body))
        try await send(req)
    }

    /// Validate a stored token on launch. Returns the user, or nil when
    /// the server says we're anonymous.
    public func me() async throws -> User? {
        let req = try makeRequest(path: "api/auth/me", method: .GET)
        let data = try await send(req)
        return try decode(MeResponse.self, from: data).user
    }

    /// Re-send the email-verification message for the current (signed-in
    /// but unverified) session. Authed via the Bearer token.
    public func resendVerification() async throws {
        let req = try makeRequest(path: "api/auth/resend-verification", method: .POST)
        try await send(req)
    }

    /// Mark first-run onboarding complete for the current session. Authed
    /// via the Bearer token (CSRF is skipped for token auth server-side).
    public func markOnboarded() async throws {
        let req = try makeRequest(path: "api/account/onboarded", method: .POST)
        try await send(req)
    }

    // ── Plaid (bank linking, Pro-gated) ──────────────────────────────

    /// Current Plaid state: whether the server has credentials, whether the
    /// user is Pro, and their linked items + balances.
    public func plaidStatus() async throws -> PlaidStatus {
        let req = try makeRequest(path: "api/plaid/status", method: .GET)
        return try decode(PlaidStatus.self, from: try await send(req))
    }

    /// Create a Plaid Link token to open the native Link flow. Pass `itemId`
    /// for an update-mode token (re-auth an existing item); set
    /// `accountSelection` to open update mode with account selection (the
    /// NEW_ACCOUNTS_AVAILABLE "add accounts" flow).
    public func plaidLinkToken(itemId: Int? = nil, accountSelection: Bool = false) async throws -> String {
        let req: URLRequest
        if let itemId {
            req = try makeRequest(path: "api/plaid/link/token", method: .POST,
                                  body: AnyEncodable(PlaidLinkTokenBody(itemId: itemId, accountSelection: accountSelection ? true : nil)))
        } else {
            req = try makeRequest(path: "api/plaid/link/token", method: .POST)
        }
        return try decode(PlaidLinkTokenResponse.self, from: try await send(req)).linkToken
    }

    /// After a successful update-mode Link, mark the item repaired (no
    /// public-token exchange happens in update mode).
    public func plaidRepaired(itemId: Int) async throws {
        let req = try makeRequest(path: "api/plaid/item/\(itemId)/repaired", method: .POST)
        _ = try await send(req)
    }

    /// Exchange the Link `public_token` for a stored item (server pulls
    /// balances immediately).
    public func plaidExchange(publicToken: String) async throws {
        let req = try makeRequest(path: "api/plaid/link/exchange", method: .POST,
                                  body: AnyEncodable(PlaidExchangeBody(publicToken: publicToken)))
        _ = try await send(req)
    }

    /// Disconnect a linked item.
    public func plaidRemove(itemId: Int) async throws {
        let req = try makeRequest(path: "api/plaid/item/\(itemId)/remove", method: .POST)
        _ = try await send(req)
    }

    /// Re-pull balances for every linked item; returns the refreshed list.
    public func plaidRefresh() async throws -> [PlaidItem] {
        let req = try makeRequest(path: "api/plaid/refresh", method: .POST)
        return try decode(PlaidItemsResponse.self, from: try await send(req)).items
    }

    /// Revoke the session server-side and clear the local token.
    public func logout() async throws {
        let req = try makeRequest(path: "api/auth/logout", method: .POST)
        // Best-effort: clear locally even if the network call fails.
        defer { tokens.clear() }
        _ = try? await send(req)
    }

    private func storeSession(from data: Data) throws -> AuthSession {
        let r = try decode(SessionResponse.self, from: data)
        guard let token = r.token else {
            throw APIError.decoding("missing token in auth response")
        }
        tokens.set(token)
        return AuthSession(token: token, user: r.user)
    }

    // ── Data sync ─────────────────────────────────────────────────────

    public func fetchData() async throws -> AppData {
        let req = try makeRequest(path: "api/data", method: .GET)
        let data = try await send(req)
        return try decode(AppData.self, from: data)
    }

    public func saveData(_ appData: AppData) async throws {
        let body = DataPutBody(
            bills: appData.bills,
            cards: appData.cards,
            payments: appData.payments,
            accounts: appData.accounts,
            goals: appData.goals,
            transactions: appData.transactions,
            settings: appData.settings
        )
        let req = try makeRequest(path: "api/data", method: .PUT, body: AnyEncodable(body))
        try await send(req)
    }
}
