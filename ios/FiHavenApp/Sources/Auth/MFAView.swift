import SwiftUI
import FiHavenCore

/// Second-factor screen shown when login returns `mfaRequired`. Handles
/// TOTP / backup / email codes (passkeys are a later phase).
struct MFAView: View {
    @EnvironmentObject var env: AppEnvironment
    @Environment(\.openURL) private var openURL
    let challenge: MfaChallenge

    @State private var code = ""
    @State private var emailSent = false

    private var hasEmail: Bool { challenge.methods.contains("email") }

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)

            VStack(spacing: 22) {
                Wordmark(size: 34)
                Text("Two-factor verification")
                    .font(Theme.ui(16))
                    .foregroundStyle(Theme.muted)

                VStack(spacing: 14) {
                    Text(promptText)
                        .font(Theme.ui(14))
                        .foregroundStyle(Theme.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    FieldLabel(text: "Code")
                    TextField("123456", text: $code)
                        .font(Theme.mono(20, weight: .medium))
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                        .autocorrectionDisabled()
                        .accessibilityLabel("Verification code")
                        .onChange(of: code) { _, newValue in
                            // Keep digits only, but never reassign during the
                            // same update (avoids an autofill feedback hang).
                            let filtered = newValue.filter { $0.isNumber }
                            if filtered != newValue {
                                DispatchQueue.main.async { code = filtered }
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 11)
                        .background(Theme.surface2)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                                .stroke(Theme.border, lineWidth: 1)
                        )

                    if let error = env.authError {
                        FormErrorBanner(message: error)
                    }

                    Button {
                        Task { await env.verifyMfa(code: code) }
                    } label: {
                        Text(env.working ? "Verifying…" : "Verify")
                    }
                    .buttonStyle(PrimaryButtonStyle(enabled: canSubmit))
                    .disabled(!canSubmit)
                    .accessibilityHint(canSubmit ? "Verifies your two-factor code" : "Enter a 6-digit code")

                    if hasEmail {
                        Button {
                            Task {
                                await env.sendEmailCode()
                                emailSent = true
                            }
                        } label: {
                            Text(emailSent ? "Code sent — check your email" : "Email me a code")
                                .font(Theme.ui(14, weight: .medium))
                                .foregroundStyle(Theme.accent)
                        }
                    }
                }
                .ctCard(padding: 20)

                Button {
                    openURL(AppEnvironment.webBaseURL.appendingPathComponent("recover"))
                } label: {
                    Text("Lost your 2FA device?")
                        .font(Theme.ui(13, weight: .medium))
                        .foregroundStyle(Theme.accent)
                }

                Button {
                    env.cancelMfa()
                } label: {
                    Text("Cancel")
                        .font(Theme.ui(14, weight: .medium))
                        .foregroundStyle(Theme.muted)
                }
            }
            .padding(.horizontal, 22)
            .frame(maxWidth: 460)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg.ignoresSafeArea())
    }

    private var canSubmit: Bool { !env.working && code.count >= 6 }

    private var promptText: String {
        if challenge.methods.contains("totp") {
            return "Enter the 6-digit code from your authenticator app, or a backup code."
        } else if hasEmail {
            return "Request a code by email, then enter it below."
        }
        return "Enter your verification code."
    }
}
