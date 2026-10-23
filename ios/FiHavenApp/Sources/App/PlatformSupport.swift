import SwiftUI
import Foundation
import FiHavenCore

/// `SwiftUI.Settings` — the macOS ⌘, scene — shares its name with the app's
/// synced settings model. The collision is invisible on iOS, where the scene
/// isn't declared at all, and shows up on macOS as "'Settings' is ambiguous
/// for type lookup" in every file that imports both SwiftUI and FiHavenCore.
/// Declaring the model in this module's own scope settles it once: the
/// fixture's own declaration wins over imported ones, and FiHavenApp spells
/// the scene out as `SwiftUI.Settings` where it means that one.
typealias Settings = FiHavenCore.Settings

#if canImport(UIKit)
import UIKit
/// Image / view-controller / window, named once so the shared code doesn't
/// carry a platform branch at every use. Google Sign-In and the passkey
/// sheet are the two places that need the concrete view controller type.
typealias PlatformImage = UIImage
typealias PlatformViewController = UIViewController
typealias PlatformPresentationAnchor = UIWindow
/// Google Sign-In's `signIn(withPresenting:)` takes a view controller on iOS
/// and a window on macOS, so the two platforms hand it different objects.
typealias PlatformAuthPresenter = UIViewController
#else
import AppKit
typealias PlatformImage = NSImage
typealias PlatformViewController = NSViewController
typealias PlatformPresentationAnchor = NSWindow
typealias PlatformAuthPresenter = NSWindow
#endif

extension Image {
    /// `Image(uiImage:)` and `Image(nsImage:)` are disjoint; this is the one
    /// place that picks between them (decoded issuer icons and the TOTP QR).
    init(platformImage: PlatformImage) {
        #if canImport(UIKit)
        self.init(uiImage: platformImage)
        #else
        self.init(nsImage: platformImage)
        #endif
    }
}

/// Decode a `data:image/...;base64,XXXX` URL into a platform image.
func imageFromDataURL(_ string: String) -> PlatformImage? {
    guard let commaIndex = string.firstIndex(of: ","),
          let data = Data(base64Encoded: String(string[string.index(after: commaIndex)...])),
          let image = PlatformImage(data: data) else {
        return nil
    }
    return image
}

/// Open a URL in whatever app owns it — the browser, the App Store, or
/// System Settings. `UIApplication.open` has no macOS equivalent; the Mac
/// hands this to `NSWorkspace`.
@MainActor
func openPlatformURL(_ url: URL) {
    #if canImport(UIKit)
    UIApplication.shared.open(url)
    #else
    NSWorkspace.shared.open(url)
    #endif
}

/// The view controller to present a modal from, or nil if there is no window
/// yet (both Google Sign-In and Plaid Link need a presenter, and SwiftUI has
/// no direct way to ask for one).
@MainActor
func topPlatformViewController() -> PlatformViewController? {
    #if canImport(UIKit)
    var top = keyPlatformWindow()?.rootViewController
    while let presented = top?.presentedViewController { top = presented }
    return top
    #else
    var top = NSApplication.shared.keyWindow?.contentViewController
    // AppKit presents modals as a stack, not a single `presentedViewController`.
    while let presented = top?.presentedViewControllers?.last { top = presented }
    return top
    #endif
}

/// The object Google Sign-In presents its web flow from.
@MainActor
func authPresenter() -> PlatformAuthPresenter? {
    #if canImport(UIKit)
    topPlatformViewController()
    #else
    keyPlatformWindow()
    #endif
}

/// The frontmost window, or any window if none is key — the presentation
/// anchor `ASWebAuthenticationSession` and `ASAuthorizationController` need.
@MainActor
func keyPlatformWindow() -> PlatformPresentationAnchor? {
    #if canImport(UIKit)
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let windows = scenes.flatMap(\.windows)
    return windows.first { $0.isKeyWindow } ?? windows.first
    #else
    NSApplication.shared.keyWindow ?? NSApplication.shared.windows.first
    #endif
}

/// Bring APNs registration up for whichever app object this platform has.
@MainActor
func registerForRemoteNotifications() {
    #if canImport(UIKit)
    UIApplication.shared.registerForRemoteNotifications()
    #else
    NSApplication.shared.registerForRemoteNotifications()
    #endif
}
