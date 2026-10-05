import SwiftUI
import GoogleSignIn

@main
struct FiHavenApp: App {
    #if os(iOS)
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    #else
    // Owned by the app rather than the window: `.commands` lives on the
    // scene, so the menu bar can only reach state declared here.
    @StateObject private var tables = TableCommands()
    @StateObject private var nav = MacNavigation()
    #endif
    @StateObject private var env = AppEnvironment()
    @StateObject private var theme = ThemeStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        #if os(macOS)
        Window("FiHaven", id: "main") {
            RootView()
                .environmentObject(env)
                .environmentObject(theme)
                .environmentObject(env.biometric)
                .environmentObject(tables)
                .environmentObject(nav)
                .preferredColorScheme(theme.preference.colorScheme)
                .onOpenURL { url in GIDSignIn.sharedInstance.handle(url) }
                .ctWindowFrameGuard()
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
                #if DEBUG
                .task {
                    // The frame guard re-asserts the sweep's pinned size on
                    // resize notifications; this closes the race a capture can
                    // land in between the two. No-op when nothing is pinned.
                    while !Task.isCancelled {
                        try? await Task.sleep(for: .milliseconds(400))
                        ctReassertPinnedWindowSize()
                    }
                }
                .task {
                    // FH_KEYS=down,down,space — feed scripted keys to the
                    // front table's debug handle, for runs that cannot press
                    // real keys (see TableCommands.debugHandle).
                    guard let raw = ProcessInfo.processInfo.environment["FH_KEYS"],
                          !raw.isEmpty else { return }
                    try? await Task.sleep(for: .seconds(1.5))
                    for key in raw.split(separator: ",") {
                        sendDebugKey(String(key).trimmingCharacters(in: .whitespaces))
                        try? await Task.sleep(for: .milliseconds(250))
                    }
                }
                #endif
        }
        .defaultSize(width: MacWindowDefaults.size.width,
                     height: MacWindowDefaults.size.height)
        .commands {
            TransactionCommands(tables: tables)
            GoCommands(nav: nav)
            CommandGroup(after: .help) { KeyboardShortcutsMenu() }
        }

        // The scene is spelled `SwiftUI.Settings` because this module's own
        // `Settings` typealias (PlatformSupport.swift) names the synced
        // settings model — the scene and the model collide otherwise.
        SwiftUI.Settings {
            MacSettingsScene()
                .environmentObject(env)
                .environmentObject(theme)
                .preferredColorScheme(theme.preference.colorScheme)
        }
        #else
        WindowGroup {
            RootView()
                .environmentObject(env)
                .environmentObject(theme)
                .environmentObject(env.biometric)
                // Applied above the whole hierarchy so the choice also
                // covers the auth/loading screens, not just signed-in.
                .preferredColorScheme(theme.preference.colorScheme)
                // Complete Google Sign-In returns; Plaid's OAuth Universal Link
                // is claimed so it never reaches GIDSignIn.
                .onOpenURL { url in
                    #if os(iOS)
                    if ActivePlaidLink.claims(url) { return }
                    #endif
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
        #endif
    }

    #if os(macOS) && DEBUG
    /// Turn one `FH_KEYS` word into a key-down the front table can take.
    /// Bare keys — arrows, space, ⌫ — are the ones menus cannot carry, which
    /// is why they are the ones the table owns.
    @MainActor
    private func sendDebugKey(_ name: String) {
        guard let window = NSApp.keyWindow ?? NSApp.windows.first else { return }
        let (code, flags): (UInt16, NSEvent.ModifierFlags)
        switch name.lowercased() {
        case "up": (code, flags) = (126, [])
        case "down": (code, flags) = (125, [])
        case "left": (code, flags) = (123, [])
        case "right": (code, flags) = (124, [])
        case "space", " ": (code, flags) = (49, [])
        case "delete", "backspace", "⌫": (code, flags) = (51, [])
        case "return", "enter": (code, flags) = (36, [])
        case "shift+space": (code, flags) = (49, [.shift])
        case "cmd+delete", "command+delete", "⌘⌫": (code, flags) = (51, [.command])
        case "cmd+a", "command+a", "⌘a": (code, flags) = (0, [.command])
        default: return
        }
        guard let event = NSEvent.keyEvent(
            with: .keyDown, location: .zero, modifierFlags: flags, timestamp: 0,
            windowNumber: window.windowNumber, context: nil,
            characters: "", charactersIgnoringModifiers: "",
            isARepeat: false, keyCode: code
        ) else { return }
        _ = tables.debugHandle?(event)
    }
    #endif
}
