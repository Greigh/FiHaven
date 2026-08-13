import SwiftUI
import FiHavenCore

/// Shown when the signed-in account hasn't confirmed its email yet. The
/// confirmation link is opened from the email (it lands on the web verify
/// page); here the user can resend it and re-check once they've clicked it.
struct VerifyEmailView: View {
    @EnvironmentObject var env: AppEnvironment
    let user: User

    enum ResendState { case idle, sending, sent, failed }
    @State private var resend: ResendState = .idle
    @State private var checking = false
    @State private var notYet = false
    @State private var changingEmail = false

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)

            VStack(spacing: 22) {
                Wordmark(size: 34)
                Text("Confirm your email")
                    .font(Theme.ui(16))
                    .foregroundStyle(Theme.muted)

                VStack(spacing: 14) {
                    Text("We sent a confirmation link to \(user.email). Open it to unlock FiHaven, then tap “I’ve confirmed” below.")
                        .font(Theme.ui(14))
                        .foregroundStyle(Theme.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    if notYet {
                        FormErrorBanner(message: "Still not confirmed — check your inbox (and spam), then try again.")
                    }

                    Button {
                        Task {
                            checking = true; notYet = false
                            let ok = await env.refreshVerification()
                            checking = false
                            if !ok { notYet = true }
                        }
                    } label: {
                        Text(checking ? "Checking…" : "I’ve confirmed — continue")
                    }
                    .buttonStyle(PrimaryButtonStyle(enabled: !checking))
                    .disabled(checking)
                    .accessibilityHint("Checks whether your email address is confirmed")

                    Button {
                        Task {
                            resend = .sending
                            resend = await env.resendVerification() ? .sent : .failed
                        }
                    } label: {
                        Text(resendLabel)
                            .font(Theme.ui(14, weight: .medium))
                            .foregroundStyle(Theme.accent)
                    }
                    .disabled(resend == .sending)

                    // A mistyped address at signup is otherwise a dead end:
                    // the only way off this screen is a mail nobody will get.
                    Button {
                        changingEmail = true
                    } label: {
                        Text("Wrong email? Change it")
                            .font(Theme.ui(14, weight: .medium))
                            .foregroundStyle(Theme.accent)
                    }
                    .accessibilityHint("Send the confirmation to a different address")
                }
                .ctCard(padding: 20)

                Button {
                    Task { await env.logout() }
                } label: {
                    Text("Sign out")
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
        // The same sheet Settings uses. On success it re-enters .unverified
        // with the new address, so this screen simply redraws pointing at the
        // corrected inbox.
        .sheet(isPresented: $changingEmail) {
            ChangeEmailSheet(current: user)
                .environmentObject(env)
                .onDisappear { resend = .idle; notYet = false }
        }
    }

    private var resendLabel: String {
        switch resend {
        case .idle: return "Resend the email"
        case .sending: return "Sending…"
        case .sent: return "Sent — check your inbox"
        case .failed: return "Couldn’t send — tap to retry"
        }
    }
}
