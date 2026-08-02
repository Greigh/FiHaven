import Foundation
import SwiftUI
import FiHavenCore

/// Top-level auth/session state.
enum SessionState {
    case loading
    case signedOut
    case mfa(MfaChallenge)
    case unverified(User)
    case signedIn(User)
}

/// App-wide coordinator: owns the API client, the Keychain token store,
/// the captcha provider, and the auth state machine. Creates the AppStore
/// on sign-in.
@MainActor
final class AppEnvironment: ObservableObject {
    let api: APIClient
    let tokens: TokenStore
    /// StoreKit + entitlement coordinator, shared app-wide for gating.
    let billing: StoreManager
    /// Biometric app-lock state + preference, shared app-wide.
    let biometric = BiometricStore()

    @Published private(set) var session: SessionState = .loading
    @Published var authError: String?
    /// A non-error message for the auth screen — currently the confirmation
    /// that an account was deleted, which the user sees after being returned
    /// to sign-in. Cleared on the next sign-in attempt.
    @Published var authNotice: String?
    @Published private(set) var working = false
    @Published private(set) var store: AppStore?

    private var authStartedAt = APIClient.now()

    init() {
        let tokenStore = KeychainTokenStore(service: "app.fihaven")
        let config = Self.resolveConfig()
        print("[AppEnvironment] API base URL = \(config.baseURL.absoluteString)")
        let api = APIClient(config: config, tokens: tokenStore)
        self.tokens = tokenStore
        self.api = api
        self.billing = StoreManager(api: api)
        self.session = .signedOut
        PushRegistrar.shared.configure(api: api)
        print("[AppEnvironment] Initialized — deferring bootstrap to first view task")
    }

    /// Pick the API base URL. A `FH_BASE` environment variable (set in the
    /// Xcode scheme's Run → Arguments) overrides everything — point a dev
    /// build at production with `FH_BASE=https://fihaven.app`
    /// and no rebuild. Otherwise DEBUG uses the local server, release uses
    /// production. Mirrors the FH_BASE knob in FiHavenCoreChecks.
    private static func resolveConfig() -> APIConfig {
        if let raw = ProcessInfo.processInfo.environment["FH_BASE"],
           !raw.isEmpty, let url = URL(string: raw) {
            return APIConfig(baseURL: url)
        }
        #if DEBUG
        #if targetEnvironment(simulator)
        // Simulator can talk to localhost
        return .localhost
        #else
        // Physical devices can't reach Mac localhost; default to production
        return .production
        #endif
        #else
        return .production
        #endif
    }

    /// Base URL of the web app (same origin as the API). Used to open
    /// browser-only flows — e.g. lost-2FA recovery at `/recover`, which
    /// deliberately lives on the web so the destructive wipe is confirmed
    /// from an emailed link rather than inside the app.
    static var webBaseURL: URL { resolveConfig().baseURL }

    /// Mark when the auth screen appeared (anti-bot timing gate).
    func markAuthStarted() { authStartedAt = APIClient.now() }

    func bootstrap() async {
        print("[AppEnvironment] bootstrap() begin")
        if tokens.get() != nil {
            do {
                if let user = try await api.me() {
                    await enterSignedIn(user)
                    print("[AppEnvironment] bootstrap() restored session; entering signed-in")
                    return
                }
                // The server answered and said this token belongs to nobody, so
                // the session is genuinely over — retire it and everything that
                // outlives it. (A *thrown* error below is transient and must
                // not discard a working session's reminders.)
                tokens.clear()
                NotificationScheduler.cancelAll()
            } catch {
                // Transient failure with a stored token: fall through to
                // signed-out rather than trapping on a blank screen.
            }
        }
        if autoLoginRequested {
            // The dev Turnstile secret is "always-pass", so a placeholder
            // token is accepted; no widget needed for the automated path.
            let env = ProcessInfo.processInfo.environment
            await login(
                email: env["FH_DEV_EMAIL"] ?? "demo@fihaven.app",
                password: env["FH_DEV_PASSWORD"] ?? "demopassword11",
                captchaToken: "dev-bypass-token",
                startedAtOverride: APIClient.now() - 3000
            )
            if case .loading = session { session = .signedOut }
            print("[AppEnvironment] bootstrap() auto-login path completed; session=\(String(describing: session))")
            return
        }
        session = .signedOut
        print("[AppEnvironment] bootstrap() finished; session=signedOut")
    }

    func login(
        email: String,
        password: String,
        captchaToken: String,
        startedAtOverride: Int64? = nil
    ) async {
        await runAuth {
            let outcome = try await self.api.login(
                email: email, password: password,
                captchaToken: captchaToken,
                loginStartedAt: startedAtOverride ?? self.authStartedAt
            )
            switch outcome {
            case .authenticated(let s): await self.enterSignedIn(s.user, fresh: true)
            case .mfaRequired(let challenge): self.session = .mfa(challenge)
            }
        }
    }

    func signup(email: String, password: String, captchaToken: String) async {
        await runAuth {
            let s = try await self.api.signup(
                email: email, password: password,
                captchaToken: captchaToken, loginStartedAt: self.authStartedAt
            )
            await self.enterSignedIn(s.user, fresh: true)
        }
    }

    /// Sign in with a provider OIDC ID token (Apple / Google).
    func oauthSignIn(provider: String, idToken: String, name: String? = nil) async {
        await runAuth {
            let outcome = try await self.api.oauthSignIn(provider: provider, idToken: idToken, name: name)
            switch outcome {
            case .authenticated(let s): await self.enterSignedIn(s.user, fresh: true)
            case .mfaRequired(let challenge): self.session = .mfa(challenge)
            }
        }
    }

    /// Passwordless passkey sign-in. `auto` runs the conditional-UI check that
    /// surfaces a passkey in the QuickType bar; it stays silent if the user
    /// doesn't pick one. An explicit tap (auto: false) shows the modal sheet.
    func loginWithPasskey(auto: Bool = false) async {
        do {
            let start = try await api.passkeyLoginStart()
            let assertion = try await PasskeyAuth.shared.assertion(
                challengeB64URL: start.challengeB64URL, rpId: start.rpId, autoFill: auto)
            let s = try await api.passkeyLoginFinish(challengeId: start.challengeId, response: assertion)
            await enterSignedIn(s.user, fresh: true)
        } catch {
            // Silent for the automatic check; surface a message on explicit taps.
            if !auto, let e = error as? APIError { authError = e.userMessage }
        }
    }

    func verifyMfa(code: String) async {
        guard case .mfa(let challenge) = session else { return }
        await runAuth {
            let s = try await self.api.verifyMfa(mfaToken: challenge.mfaToken, code: code)
            await self.enterSignedIn(s.user, fresh: true)
        }
    }

    func sendEmailCode() async {
        guard case .mfa(let challenge) = session else { return }
        try? await api.sendEmailCode(mfaToken: challenge.mfaToken)
    }

    func cancelMfa() {
        session = .signedOut
        authError = nil
    }

    /// Re-send the verification email for the current unverified session.
    /// Returns true on success (the view shows a status from it).
    func resendVerification() async -> Bool {
        do { try await api.resendVerification(); return true }
        catch { return false }
    }

    /// Re-check verification after the user opens the email link elsewhere.
    /// Enters the app when confirmed; returns false (and stays put) if not.
    func refreshVerification() async -> Bool {
        do {
            if let user = try await api.me() {
                if user.emailVerified {
                    await enterSignedIn(user, fresh: true)
                    return true
                }
                session = .unverified(user)
                return false
            }
            session = .signedOut
            return false
        } catch let error as APIError {
            authError = error.userMessage
            return false
        } catch {
            authError = error.localizedDescription
            return false
        }
    }

    func logout() async {
        store?.endSession()
        PushRegistrar.shared.clear()
        try? await api.logout()
        billing.reset()
        store = nil
        session = .signedOut
    }

    /// The signed-in user, if any.
    var currentUser: User? {
        if case .signedIn(let user) = session { return user }
        return nil
    }

    /// Reflect a profile change (name/email) in the displayed user.
    func applyUser(_ user: User) {
        if case .signedIn = session { session = .signedIn(user) }
    }

    /// After a successful change-email: stay signed in but gate on verify when required.
    func applyEmailChange(email: String, verificationRequired: Bool) {
        let name = currentUser?.name
        let user = User(email: email, name: name, emailVerified: !verificationRequired)
        session = verificationRequired ? .unverified(user) : .signedIn(user)
    }

    /// Mark first-run onboarding complete, then drop the gate so the tab
    /// shell appears. Best-effort: we flip the local flag regardless so a
    /// transient network error doesn't trap the user on the intro.
    func completeOnboarding() async {
        try? await api.markOnboarded()
        if var user = currentUser {
            user.onboarded = true
            applyUser(user)
        }
    }

    /// Called after account deletion: drop straight to signed-out.
    /// Tear down after the server confirmed the account is gone. `email` is
    /// carried through so the sign-in screen can say *which* account was
    /// deleted — by this point `currentUser` is already cleared.
    func didDeleteAccount(email: String? = nil) {
        store?.endSession()
        tokens.clear()
        billing.reset()
        store = nil
        session = .signedOut
        authError = nil
        authNotice = email.map { "Your account with \($0) has been deleted. No turning back." }
            ?? "Your account has been deleted. No turning back."
    }

    // ── helpers ──────────────────────────────────────────────────────

    private func enterSignedIn(_ user: User, fresh: Bool = false) async {
        print("[AppEnvironment] enterSignedIn(fresh:\(fresh)) begin")
        // Unconfirmed email → the verify screen, never the dashboard. The
        // server also returns email-unverified on data calls, but gating
        // here avoids loading the store at all.
        guard user.emailVerified else {
            session = .unverified(user)
            print("[AppEnvironment] enterSignedIn end; session=\(session)")
            return
        }
        // A fresh password/MFA sign-in already authenticated the user, so
        // don't gate behind biometrics; a token-restored session (cold
        // launch) stays locked until unlocked.
        if fresh { biometric.markUnlocked() }
        let store = AppStore(api: api)
        // Nothing is cached on disk, so a rejected token means the session is
        // unusable: return to sign-in instead of showing an empty dashboard.
        store.onSessionExpired = { [weak self] in
            guard let self else { return }
            Task { @MainActor in
                guard case .signedIn = self.session else { return }
                await self.logout()
                self.authError = "Your session expired. Please sign in again."
            }
        }
        self.store = store
        session = .signedIn(user)
        await store.load()
        // Seed the entitlement from the data fetch to avoid a gating
        // flicker, then start StoreKit (authoritative refresh + listener).
        billing.seed(store.data.entitlement)
        #if DEBUG
        // Default to skipping StoreKit in Debug unless explicitly overridden
        if ProcessInfo.processInfo.environment["FH_SKIP_STOREKIT"] == "0" {
            await billing.start()
        } else {
            print("[AppEnvironment] Skipping StoreKit start (DEBUG default; set FH_SKIP_STOREKIT=0 to enable)")
        }
        #else
        await billing.start()
        #endif
        print("[AppEnvironment] enterSignedIn end; session=\(session)")
    }

    private func runAuth(_ op: @escaping () async throws -> Void) async {
        working = true
        authError = nil
        // The deletion confirmation belongs to the account that just went
        // away; starting a fresh sign-in retires it.
        authNotice = nil
        defer { working = false }
        do {
            try await op()
        } catch let error as APIError {
            authError = error.userMessage
        } catch {
            authError = error.localizedDescription
        }
    }

    private var autoLoginRequested: Bool {
        #if DEBUG
        return ProcessInfo.processInfo.environment["FH_AUTOLOGIN"] == "1"
        #else
        return false
        #endif
    }
}

