import SwiftUI

/// Combined login / signup screen with an inline Turnstile widget.
struct AuthView: View {
    @EnvironmentObject var env: AppEnvironment

    enum Mode { case login, signup }
    @State private var mode: Mode = .login
    @State private var email = ""
    @State private var password = ""
    @State private var captchaToken: String?
    @State private var captchaReloadID = UUID()

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
                        SecureField("••••••••••", text: $password)
                            .textContentType(mode == .login ? .password : .newPassword)
                    }

                    // Cloudflare Turnstile — single-use token captured here.
                    TurnstileView(
                        siteKey: AppConfig.turnstileSiteKey,
                        onToken: { captchaToken = $0 },
                        onError: { captchaToken = nil }
                    )
                    .id(captchaReloadID)
                    .frame(height: 72)
                    .frame(maxWidth: .infinity)

                    if let error = env.authError {
                        Text(error)
                            .font(Theme.ui(13))
                            .foregroundStyle(Theme.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
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
                }
                .ctCard(padding: 20)

                Button {
                    withAnimation { mode = (mode == .login ? .signup : .login) }
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

    private func submit() async {
        guard let token = captchaToken else { return }
        captchaToken = nil  // tokens are single-use
        switch mode {
        case .login: await env.login(email: email, password: password, captchaToken: token)
        case .signup: await env.signup(email: email, password: password, captchaToken: token)
        }
        // If we're still on this screen (auth failed), get a fresh token.
        captchaReloadID = UUID()
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
