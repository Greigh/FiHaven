import SwiftUI

/// Shown over the signed-in app when the biometric lock is engaged.
/// Auto-prompts on appear; offers a manual retry and a sign-out escape.
struct LockView: View {
    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var biometric: BiometricStore

    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            Wordmark(size: 34)
            Image(systemName: biometric.symbol)
                .font(.system(size: 48))
                .foregroundStyle(Theme.accent)
                .padding(.top, 8)
            Text("FiHaven is locked")
                .font(Theme.ui(16)).foregroundStyle(Theme.muted)
            Spacer()
            Button("Unlock with \(biometric.label)") {
                Task { await biometric.unlock() }
            }
            .buttonStyle(PrimaryButtonStyle())
            .padding(.horizontal, 40)
            Button("Sign out") { Task { await env.logout() } }
                .font(Theme.ui(14))
                .foregroundStyle(Theme.muted)
                .padding(.bottom, 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg.ignoresSafeArea())
        .task { await biometric.unlock() }
    }
}
