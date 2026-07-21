import SwiftUI
import GoogleSignIn

@main
struct FiHavenApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var env = AppEnvironment()
    @StateObject private var theme = ThemeStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(env)
                .environmentObject(theme)
                .environmentObject(env.biometric)
                // Applied above the whole hierarchy so the choice also
                // covers the auth/loading screens, not just signed-in.
                .preferredColorScheme(theme.preference.colorScheme)
                // Complete Google Sign-In and Plaid OAuth Universal Link returns.
                .onOpenURL { url in
                    if ActivePlaidLink.resume(from: url) { return }
                    GIDSignIn.sharedInstance.handle(url)
                }
                .onChange(of: scenePhase) { _, phase in
                    switch phase {
                    case .background:
                        env.biometric.noteBackgrounded()
                    case .active:
                        env.biometric.maybeLockOnForeground()
                    default:
                        break
                    }
                }
        }
    }
}
