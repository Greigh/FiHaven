import SwiftUI
import FiHavenCore

/// The "prove it's you" control shown before a sensitive account change.
///
/// Accounts with a password re-enter it. Sign in with Apple / Google accounts
/// have none, so they request a one-time code by email instead — the server
/// accepts either on the same endpoints (see `ReauthProof`). Every sheet that
/// gates a sensitive change renders this rather than its own password field,
/// so the two variants can't drift apart per-flow.
struct ReauthField: View {
    @EnvironmentObject var env: AppEnvironment

    /// The proof the parent will send. Kept in sync with whichever field shows.
    @Binding var proof: ReauthProof

    @State private var password = ""
    @State private var code = ""
    @State private var sending = false
    @State private var sent = false
    @State private var sendError: String?

    /// Absent means "has a password" — matches the server's older behaviour and
    /// keeps a stale cached user from hiding the password field.
    private var hasPassword: Bool { env.currentUser?.hasPassword ?? true }

    var body: some View {
        Group {
            if hasPassword {
                RevealableSecureField(placeholder: "Password", text: $password, contentType: .password)
                    .onChange(of: password) { _, new in proof = .password(new) }
            } else {
                HStack {
                    TextField("6-digit code", text: $code)
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                        .onChange(of: code) { _, new in proof = .emailedCode(new) }
                    Button(sending ? "Sending…" : (sent ? "Resend" : "Send code")) {
                        Task { await send() }
                    }
                    .font(Theme.ui(13))
                    .disabled(sending)
                }
                Text("You sign in with Apple or Google, so there's no password to confirm — we'll email you a code instead.")
                    .font(Theme.ui(12))
                    .foregroundStyle(Theme.muted)
                if let sendError {
                    Text(sendError).font(Theme.ui(12)).foregroundStyle(Theme.red)
                }
            }
        }
        .onAppear {
            // Start the binding in the shape this account will actually use, so
            // a parent's `proof.isEmpty` check is meaningful before first edit.
            proof = hasPassword ? .password(password) : .emailedCode(code)
        }
    }

    private func send() async {
        sending = true
        defer { sending = false }
        do {
            try await env.api.sendReauthCode()
            sent = true
            sendError = nil
        } catch let e as APIError {
            sendError = e.userMessage
        } catch {
            sendError = error.localizedDescription
        }
    }
}
