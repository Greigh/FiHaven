import SwiftUI
import AuthenticationServices
import GoogleSignIn

/// Combined login / signup screen with an inline Turnstile widget.
struct AuthView: View {
    @EnvironmentObject var env: AppEnvironment
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    enum Mode { case login, signup }
    @State private var mode: Mode = .login
    @State private var email = ""
    @State private var password = ""
    @State private var captchaToken: String?
    @State private var captchaReloadID = UUID()
    @State private var turnstileHeight: CGFloat = 72

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)

            VStack(spacing: 22) {
                Wordmark(size: 38)

                Text(mode == .login ? "Welcome back" : "Create your account")
                    .font(Theme.ui(16))
                    .foregroundStyle(Theme.muted)

                VStack(spacing: 14) {
                    field("Email") {
                        TextField("you@example.com", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
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

                    if captchaToken == nil {
                        // Cloudflare Turnstile — single-use token captured here.
                        TurnstileView(
                            siteKey: AppConfig.turnstileSiteKey,
                            onToken: { token in
                                performWithAnimation(!reduceMotion) { captchaToken = token }
                            },
                            onError: {
                                performWithAnimation(!reduceMotion) { captchaToken = nil }
                            },
                            onHeight: { h in
                                performWithAnimation(!reduceMotion) { turnstileHeight = min(max(h, 0), 120) }
                            }
                        )
                        .id(captchaReloadID)
                        .frame(height: turnstileHeight)
                        .frame(maxWidth: .infinity)
                        .transition(.opacity)
                        .accessibilityLabel("Security check")
                        .accessibilityHint("Completes automatically in the background")
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
                    .accessibilityHint(canSubmit ? "Sign in to your account" : "Complete the security check and enter your email and password")

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
                    .signInWithAppleButtonStyle(.black)
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
                            RoundedRectangle(cornerRadius: 8, style: .continuous).fill(.white)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .stroke(Color(white: 0.85), lineWidth: 1)
                        )
                    }
                    .disabled(env.working)
                }
                .ctCard(padding: 20)

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
            }
            .padding(.horizontal, 22)
            .frame(maxWidth: 460)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg.ignoresSafeArea())
        .onAppear { env.markAuthStarted() }
    }

    private var canSubmit: Bool {
        !env.working && email.contains("@") && password.count >= 6 && captchaToken != nil
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
        guard let root = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap({ $0.windows })
            .first(where: { $0.isKeyWindow })?.rootViewController else { return }
        GIDSignIn.sharedInstance.signIn(withPresenting: root) { result, error in
            guard error == nil, let idToken = result?.user.idToken?.tokenString else { return }
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
