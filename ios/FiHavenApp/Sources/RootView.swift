import SwiftUI
import FiHavenCore

/// Routes between the loading splash, the auth flow, and the signed-in
/// tab shell based on `AppEnvironment.session`.
struct RootView: View {
    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var biometric: BiometricStore
    // First-run intro is local (no account yet) — shown once before auth.
    @AppStorage("fh_intro_seen") private var introSeen = false

    var body: some View {
        Group {
            switch env.session {
            case .loading:
                LoadingView()
            case .signedOut:
                #if DEBUG
                // FH_INTRO_SEEN=0|1 pins the first-run gate for sweep captures;
                // unset, the stored flag decides as usual.
                if let forced = ProcessInfo.processInfo.environment["FH_INTRO_SEEN"] {
                    if forced == "1" { AuthView() } else { IntroView() }
                } else if introSeen { AuthView() } else { IntroView() }
                #else
                if introSeen { AuthView() } else { IntroView() }
                #endif
            case .mfa(let challenge):
                MFAView(challenge: challenge)
            case .unverified(let user):
                VerifyEmailView(user: user)
            case .signedIn(let user):
                if biometric.locked {
                    LockView()
                } else if !user.onboarded {
                    OnboardingView()
                } else if let store = env.store {
                    MainTabView(user: user)
                        .environmentObject(store)
                        .environmentObject(env.billing)
                } else {
                    LoadingView()
                }
            }
        }
        .animationIfAllowed(.easeInOut(duration: 0.2), value: isSignedIn)
        .task {
            #if DEBUG
            // Scheduled before bootstrap so the delay covers sign-in too.
            SweepSnapshot.schedule(env: env)
            #endif
            // Defer heavy startup until after first frame to avoid launch aborts
            await Task.yield()
            fhLog("[RootView] starting bootstrap")
            await env.bootstrap()
            fhLog("[RootView] bootstrap finished")

            // Under the debugger, allow a tiny delay or complete skip of StoreKit
            #if DEBUG
            if isDebuggerAttached() {
                try? await Task.sleep(nanoseconds: 200_000_000) // 0.2s
            }
            // Default to skipping StoreKit in Debug builds unless explicitly overridden
            if ProcessInfo.processInfo.environment["FH_SKIP_STOREKIT"] != "0" {
                fhLog("[RootView] skipping StoreKit (DEBUG default; set FH_SKIP_STOREKIT=0 to enable)")
                return
            }
            #endif

            fhLog("[RootView] starting StoreKit")
            await env.billing.start()
            fhLog("[RootView] StoreKit started")
        }
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

