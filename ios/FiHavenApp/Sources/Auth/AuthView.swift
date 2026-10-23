import SwiftUI
import AuthenticationServices
import GoogleSignIn

/// Combined login / signup screen with an inline Turnstile widget.
struct AuthView: View {
    @EnvironmentObject var env: AppEnvironment
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme

    enum Mode { case login, signup }
    @State private var mode: Mode = .login
    @State private var email = ""
    @State private var password = ""
    @State private var captchaToken: String?
    @State private var captchaReloadID = UUID()
    @State private var turnstileHeight: CGFloat = 72
    @State private var captchaStalled = false

    /// How long the Turnstile widget gets to produce a token before the screen
    /// says something is wrong. Long enough that a slow-but-working challenge
    /// doesn't trip it, short enough that nobody is left guessing.
    private static let captchaDeadline: Duration = .seconds(12)

    /// DEBUG + `FH_TURNSTILE_SITEKEY` only: the widget mounts invisible and
    /// reveals when Cloudflare draws it, or at a deadline when it can't —
    /// the stalled state the sweep photographs.
    @State private var turnstileHidden = false

    var body: some View {
        layout
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.bg.ignoresSafeArea())
            .onAppear {
                env.markAuthStarted()
                #if DEBUG
                fhLog("[AuthView] sign-in screen shown")
                if ProcessInfo.processInfo.environment["FH_TURNSTILE_SITEKEY"] != nil {
                    turnstileHidden = true
                }
                #endif
            }
            // Conditional-UI passkey check: surfaces a saved passkey in the
            // QuickType bar while the email field is focused (silent otherwise).
            .task { await env.loginWithPasskey(auto: true) }
            #if DEBUG
            // The stalled-check deadline: under a FH_TURNSTILE_SITEKEY override
            // the widget stays hidden until Cloudflare draws it (onHeight), and
            // at 12 s it shows anyway — an answer that can't be answered should
            // still be something a person can see.
            .task {
                guard ProcessInfo.processInfo.environment["FH_TURNSTILE_SITEKEY"] != nil else { return }
                try? await Task.sleep(nanoseconds: 12_000_000_000)
                // Through a fresh task, as with the stalled notice below: a
                // `.task` write inherits the mount transaction, which can
                // freeze the reveal's opacity change at ~0 alpha.
                Task { @MainActor in revealSecurityCheck() }
            }
            #endif
    }

    // ── Layout ────────────────────────────────────────────────────────
    // On the Mac the phone's centered column reads as a card floating in a
    // void, so the window gets the split it has room for: a brand pane on the
    // left carrying the intro's pitch, the form centered in the rest.
    @ViewBuilder
    private var layout: some View {
        #if os(macOS)
        HStack(spacing: 0) {
            brandPane
            // Centered when it fits, scrolling when the window is shorter
            // than the form — the same ViewThatFits idiom the shell sidebar
            // uses for its catalog. The candidates must NOT carry an
            // infinite frame: accepting the proposal would make the plain
            // column always "fit" and the fallback would never fire.
            ViewThatFits(in: .vertical) {
                formColumn
                ScrollView {
                    formColumn
                        .frame(maxWidth: .infinity)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.bg)
        }
        #else
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            formColumn
            Spacer(minLength: 0)
        }
        #endif
    }

    #if os(macOS)
    /// The left pane: the intro page's hero — disc, pitch, feature list —
    /// plus the credit where a Mac panel conventionally bottoms out.
    private var brandPane: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer(minLength: 48)
            ZStack {
                Circle()
                    .fill(LinearGradient(
                        colors: [Theme.accent.opacity(0.20), Theme.accent.opacity(0.05)],
                        startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 120, height: 120)
                BrandMark(size: 62)
            }
            Spacer().frame(height: 30)
            Text("Five calm minutes a week instead of a frantic afternoon every payday.")
                .font(Theme.ui(22, weight: .semibold))
                .foregroundStyle(Theme.text)
                .fixedSize(horizontal: false, vertical: true)
            Spacer().frame(height: 26)
            VStack(alignment: .leading, spacing: 14) {
                brandFeature("list.bullet.rectangle.fill", "Track recurring bills in one place")
                brandFeature("creditcard.fill", "Credit cards & 0% promo periods")
                brandFeature("chart.line.uptrend.xyaxis", "A clear plan to pay down debt")
            }
            Spacer()
            MadeWithLove(style: .compact)
            Spacer().frame(height: 26)
        }
        .padding(.horizontal, 44)
        // 280 + the form's ~360 fits the window's 640pt floor; above that
        // the pane opens at 440 and can grow to 500.
        .frame(minWidth: 280, idealWidth: 440, maxWidth: 500)
        .frame(maxHeight: .infinity)
        .background(
            ZStack {
                Theme.bg
                LinearGradient(
                    colors: [Theme.accent.opacity(0.10), Theme.accent.opacity(0.03)],
                    startPoint: .top, endPoint: .bottom)
            }
        )
        .overlay(alignment: .trailing) {
            Rectangle().fill(Theme.border).frame(width: 1)
        }
        .accessibilityElement(children: .contain)
    }

    private func brandFeature(_ icon: String, _ text: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.accent)
                .frame(width: 24)
                .accessibilityHidden(true)
            Text(text)
                .font(Theme.ui(14))
                .foregroundStyle(Theme.text)
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }
    #endif

    /// Wordmark + heading + card + mode toggle — what a phone shows as the
    /// whole screen, and what the Mac shows inside the right pane.
    private var formColumn: some View {
        VStack(spacing: 22) {
            #if os(macOS)
            // The brand pane owns the wordmark; the pane's own heading is
            // the greeting, promoted to a real title.
            Text(mode == .login ? "Welcome back" : "Create your account")
                .font(Theme.ui(22, weight: .bold))
                .foregroundStyle(Theme.text)
            #else
            Wordmark(size: 38)

            Text(mode == .login ? "Welcome back" : "Create your account")
                .font(Theme.ui(16))
                .foregroundStyle(Theme.muted)
            #endif

            formCard

            Button {
                performWithAnimation(!reduceMotion) {
                    mode = (mode == .login ? .signup : .login)
                }
                env.authError = nil
            } label: {
                Text(mode == .login
                     ? "No account? Create one"
                     : "Already have an account? Sign in")
                    .font(Theme.ui(14, weight: .medium))
                    .foregroundStyle(Theme.accent)
            }
            // macOS's default button style would draw this as a bordered
            // push-button — a grey slab where a text link belongs.
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 22)
        .frame(maxWidth: 460)
    }

    /// The form body — card-wrapped on iOS, bare on the Mac pane, where a
    /// bordered card floating on the pane background is the muddy look the
    /// old screenshot had.
    @ViewBuilder
    private var formCard: some View {
        #if os(macOS)
        formBody
        #else
        formBody.ctCard(padding: 20)
        #endif
    }

    private var formBody: some View {
        VStack(spacing: 14) {
                    field("Email") {
                        TextField("you@example.com", text: $email)
                            .ctTextContentType(.emailAddress)
                            .ctKeyboardType(.emailAddress)
                            .ctAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                    field("Password") {
                        RevealableSecureField(
                            placeholder: "••••••••••",
                            text: $password,
                            contentType: mode == .login ? .password : .newPassword
                        )
                    }

                    if mode == .login {
                        HStack {
                            Spacer()
                            Link("Forgot Password?", destination: AppEnvironment.webBaseURL.appendingPathComponent("reset"))
                                .font(Theme.ui(13, weight: .medium))
                                .foregroundStyle(Theme.accent)
                        }
                        .padding(.top, -4)
                    }

                    // Cloudflare Turnstile. Kept mounted even after it solves so
                    // the token auto-refreshes before it can expire (sitting on
                    // the screen otherwise leaves a stale token and a disabled
                    // submit). A fresh `.id(captchaReloadID)` resets it after a
                    // failed submit, since tokens are single-use.
                    TurnstileView(
                        siteKey: AppConfig.turnstileSiteKey,
                        onToken: { token in
                            performWithAnimation(!reduceMotion) {
                                captchaToken = token
                                captchaStalled = false
                            }
                        },
                        onError: {
                            performWithAnimation(!reduceMotion) { captchaToken = nil }
                        },
                        onHeight: { h in
                            performWithAnimation(!reduceMotion) { turnstileHeight = min(max(h, 0), 120) }
                            #if DEBUG
                            revealSecurityCheck()
                            #endif
                        }
                    )
                    .id(captchaReloadID)
                    .opacity(turnstileHidden ? 0 : 1)
                    .frame(height: turnstileHeight)
                    .frame(maxWidth: .infinity)
                    .transition(.opacity)
                    .accessibilityLabel("Security check")
                    .accessibilityHint("Completes automatically in the background")
                    // The widget renders nothing when it solves, so a challenge
                    // that never completes used to look like nothing at all:
                    // Sign in sat greyed out with no reason given and no way to
                    // retry. Errors alone aren't the signal — Turnstile retries
                    // them on its own — so give the whole attempt a deadline.
                    .task(id: captchaReloadID) {
                        captchaStalled = false
                        try? await Task.sleep(for: Self.captchaDeadline)
                        #if DEBUG
                        fhLog("[AuthView] captcha deadline: cancelled=\(Task.isCancelled) token=\(captchaToken != nil)")
                        #endif
                        guard !Task.isCancelled, captchaToken == nil else { return }
                        // A `.task` closure keeps the transaction the view
                        // mounted with — writing `captchaStalled` straight here
                        // (or inside `withAnimation`, which nests under it)
                        // makes the notice's insert animation start from a
                        // stale begin-time and freeze at ~0 alpha: the row is
                        // in the tree but never becomes visible. A fresh task
                        // runs the write on a clean transaction, and the
                        // animation then completes like any other insert.
                        Task { @MainActor in
                            performWithAnimation(!reduceMotion) { captchaStalled = true }
                        }
                    }

                    if captchaStalled, captchaToken == nil {
                        captchaStalledNotice
                    }

                    if let notice = env.authNotice {
                        FormNoticeBanner(message: notice)
                    }
                    if let error = env.authError {
                        FormErrorBanner(message: error)
                    }

                    Button {
                        Task { await submit() }
                    } label: {
                        Text(env.working
                             ? "Please wait…"
                             : (mode == .login ? "Sign in" : "Create account"))
                    }
                    .buttonStyle(PrimaryButtonStyle(enabled: canSubmit))
                    .disabled(!canSubmit)
                    .accessibilityHint(
                        canSubmit
                            ? (mode == .login ? "Sign in to your account" : "Create your FiHaven account")
                            : "Complete the security check and enter your email and password"
                    )

                    if mode == .signup {
                        signupLegalNotice
                    }

                    // Federated sign-in. Sign in with Apple is native (no SDK);
                    // it posts the identity token to /api/auth/oauth/apple.
                    HStack(spacing: 8) {
                        Rectangle().fill(Theme.border).frame(height: 1)
                        Text("or").font(Theme.ui(12)).foregroundStyle(Theme.muted)
                        Rectangle().fill(Theme.border).frame(height: 1)
                    }
                    .padding(.vertical, 2)

                    SignInWithAppleButton(.continue) { request in
                        request.requestedScopes = [.fullName, .email]
                    } onCompletion: { result in
                        handleApple(result)
                    }
                    // .black disappears into the dark surface — `.white` is
                    // the style Apple ships for dark backgrounds.
                    .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                    .cornerRadius(Theme.radiusPill)
                    .frame(height: 48)
                    .disabled(env.working)

                    // Google Sign-In (GoogleSignIn SDK) → /api/auth/oauth/google.
                    // White button + official "G" mark, sized to match the
                    // Apple button (48pt) per Google's branding guidelines.
                    Button { handleGoogle() } label: {
                        HStack(spacing: 10) {
                            Image("GoogleG").resizable().scaledToFit().frame(width: 18, height: 18)
                            Text("Continue with Google")
                                .font(Theme.ui(16, weight: .semibold))
                                .foregroundStyle(Color(red: 0.23, green: 0.23, blue: 0.23))
                        }
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(
                            RoundedRectangle(cornerRadius: Theme.radiusPill, style: .continuous).fill(.white)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.radiusPill, style: .continuous)
                                .stroke(Color(white: 0.85), lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                    .disabled(env.working)

                    // Passwordless passkey sign-in (explicit). The conditional
                    // check on appear also offers it in the QuickType bar.
                    if mode == .login {
                        Button { Task { await env.loginWithPasskey(auto: false) } } label: {
                            HStack(spacing: 8) {
                                Image(systemName: "person.badge.key.fill")
                                Text("Sign in with a passkey")
                            }
                            .font(Theme.ui(14, weight: .medium))
                            .foregroundStyle(Theme.accent)
                            .frame(maxWidth: .infinity, minHeight: 36)
                        }
                        // A text link, not a bordered push-button (macOS's
                        // default style would box it).
                        .buttonStyle(.plain)
                        .disabled(env.working)
                    }
                }
    }

    #if DEBUG
    /// Shows the Turnstile widget once, logging the reveal the auth-stalled
    /// sweep sample greps for. Both reveal paths funnel here — the first
    /// height report (Cloudflare drew it) and the deadline (it didn't).
    private func revealSecurityCheck() {
        guard turnstileHidden else { return }
        turnstileHidden = false
        fhLog("[AuthView] security check hidden -> shown")
    }
    #endif

    private var canSubmit: Bool {
        !env.working && email.contains("@") && password.count >= 6 && captchaToken != nil
    }

    /// Shown when the security check never produced a token. Names the two ways
    /// out — retry, or one of the federated buttons, none of which need it.
    private var captchaStalledNotice: some View {
        VStack(spacing: 6) {
            Text("Couldn’t complete the security check. Check your connection and try again, or use one of the sign-in options below.")
                .font(Theme.ui(12))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                // The login card competes for vertical space with the keyboard
                // and the federated buttons; without this the notice is handed
                // a one-line height and truncates mid-sentence.
                .fixedSize(horizontal: false, vertical: true)
            Button("Try again") {
                performWithAnimation(!reduceMotion) { captchaReloadID = UUID() }
            }
            .font(Theme.ui(13, weight: .semibold))
            .foregroundStyle(Theme.accent)
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .transition(.opacity)
        .accessibilityElement(children: .contain)
        .onAppear { fhLog("[AuthView] stalled notice on screen") }
    }

    /// Sign-up consent — mirrors the web login terms notice; App Review expects
    /// terms + privacy to be reachable before account creation.
    private var signupLegalNotice: some View {
        VStack(spacing: 4) {
            Text("By creating an account you agree to our")
                .font(Theme.ui(12))
                .foregroundStyle(Theme.muted)
            HStack(spacing: 4) {
                Link("Terms of Use", destination: URL(string: "https://fihaven.app/terms")!)
                    .font(Theme.ui(12, weight: .medium))
                Text("and")
                    .font(Theme.ui(12))
                    .foregroundStyle(Theme.muted)
                Link("Privacy Policy", destination: URL(string: "https://fihaven.app/privacy")!)
                    .font(Theme.ui(12, weight: .medium))
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.top, 4)
    }

    private func submit() async {
        guard let token = captchaToken else { return }
        performWithAnimation(!reduceMotion) { captchaToken = nil } // tokens are single-use
        switch mode {
        case .login: await env.login(email: email, password: password, captchaToken: token)
        case .signup: await env.signup(email: email, password: password, captchaToken: token)
        }
        // If we're still on this screen (auth failed), get a fresh token.
        performWithAnimation(!reduceMotion) { captchaReloadID = UUID() }
    }

    /// Hand Apple's identity token to the server. Apple includes the user's
    /// name only on the very first authorization, so we forward it when present.
    private func handleApple(_ result: Result<ASAuthorization, Error>) {
        guard case .success(let auth) = result,
              let cred = auth.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = cred.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8) else { return }
        var name: String?
        if let full = cred.fullName {
            let parts = [full.givenName, full.familyName].compactMap { $0 }
            if !parts.isEmpty { name = parts.joined(separator: " ") }
        }
        Task { await env.oauthSignIn(provider: "apple", idToken: idToken, name: name) }
    }

    /// Present Google Sign-In (GIDClientID is read from Info.plist) and post
    /// the returned ID token to the server.
    private func handleGoogle() {
        guard let presenter = authPresenter() else { return }
        GIDSignIn.sharedInstance.signIn(withPresenting: presenter) { result, error in
            // Every failure here used to `return` silently, so a Google sign-in
            // that didn't complete looked exactly like the button doing nothing:
            // the web flow closed and the login screen sat there with no reason
            // given, on screen or in the log.
            if let error {
                let ns = error as NSError
                // Backing out of the sheet is a deliberate choice, not an error
                // worth shouting about.
                if ns.code == GIDSignInError.canceled.rawValue { return }
                fhLog("[AuthView] Google sign-in failed: \(ns.domain) \(ns.code) — \(ns.localizedDescription)")
                Task { @MainActor in
                    env.authError = "Google sign-in failed. \(ns.localizedDescription)"
                }
                return
            }
            guard let idToken = result?.user.idToken?.tokenString else {
                fhLog("[AuthView] Google sign-in returned no ID token")
                Task { @MainActor in
                    env.authError = "Google didn't return a sign-in token. Please try again."
                }
                return
            }
            let name = result?.user.profile?.name
            Task { await env.oauthSignIn(provider: "google", idToken: idToken, name: name) }
        }
    }

    @ViewBuilder
    private func field(_ label: String, @ViewBuilder _ content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            FieldLabel(text: label)
            content()
                .font(Theme.ui(16))
                .padding(.horizontal, 12)
                .padding(.vertical, 11)
                .background(Theme.surface2)
                .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                        .stroke(Theme.border, lineWidth: 1)
                )
        }
    }
}

