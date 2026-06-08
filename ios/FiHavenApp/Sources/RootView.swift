import SwiftUI
import FiHavenCore

/// Routes between the loading splash, the auth flow, and the signed-in
/// tab shell based on `AppEnvironment.session`.
struct RootView: View {
    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var biometric: BiometricStore

    var body: some View {
        Group {
            switch env.session {
            case .loading:
                LoadingView()
            case .signedOut:
                AuthView()
            case .mfa(let challenge):
                MFAView(challenge: challenge)
            case .unverified(let user):
                VerifyEmailView(user: user)
            case .signedIn(let user):
                if biometric.locked {
                    LockView()
                } else if let store = env.store {
                    MainTabView(user: user)
                        .environmentObject(store)
                        .environmentObject(env.billing)
                } else {
                    LoadingView()
                }
            }
        }
        .animation(.easeInOut(duration: 0.2), value: isSignedIn)
    }

    private var isSignedIn: Bool {
        if case .signedIn = env.session { return true }
        return false
    }
}

struct LoadingView: View {
    var body: some View {
        VStack(spacing: 16) {
            Wordmark(size: 34)
            ProgressView()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg.ignoresSafeArea())
    }
}
