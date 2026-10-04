import Foundation

#if DEBUG
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// The rendered screen, as the sweep's capture log reports it.
///
/// `FH_SCREEN` is a *request* — a name that does not route lands on the
/// dashboard, and a sweep that logged the request would call that capture a
/// success. Views update this when they render so `screen=` in the snapshot
/// line is what the PNG actually shows; the writer reports `none` whenever
/// the signed-in shell is not mounted, so a signed-out sample cannot borrow
/// the last signed-in selection out of UserDefaults.
enum SweepProbe {
    @MainActor static var renderedScreen = "none"
}

/// `FH_SNAPSHOT=<path>` + `FH_SNAPSHOT_DELAY=<s>`: photograph the window and
/// write a PNG for the sweep. The app takes its own picture — reading our own
/// window never trips the Screen Recording prompt that an external
/// `screencapture` of the window would, and a sweep that needs a human to
/// click Allow once per machine is a sweep nobody reruns.
enum SweepSnapshot {
    /// Called once from `RootView.task`; the delay has to cover bootstrap,
    /// sign-in and the data load, so the sweep passes it per launch.
    @MainActor static func schedule(env: AppEnvironment) {
        #if canImport(UIKit)
        let e = ProcessInfo.processInfo.environment
        guard let path = e["FH_SNAPSHOT"], !path.isEmpty else { return }
        let delay = TimeInterval(e["FH_SNAPSHOT_DELAY"] ?? "") ?? 5
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(max(delay, 0) * 1_000_000_000))
            write(to: path, env: env)
        }
        #endif
    }

    #if canImport(UIKit)
    @MainActor private static func write(to path: String, env: AppEnvironment) {
        guard let scene = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .first(where: { $0.activationState == .foregroundActive })
            ?? UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene }).first,
              let window = scene.windows.first(where: { $0.isKeyWindow })
            ?? scene.windows.first else {
            fhLog("[Snapshot] FAILED no window")
            return
        }
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        guard let data = image.pngData() else {
            fhLog("[Snapshot] FAILED png encode")
            return
        }
        var screen = "none"
        if case .signedIn = env.session { screen = SweepProbe.renderedScreen }
        let w = Int(window.bounds.width), h = Int(window.bounds.height)
        do {
            try data.write(to: URL(fileURLWithPath: path), options: .atomic)
            fhLog("[Snapshot] wrote \(path) screen=\(screen) window=\(w)x\(h) scale=\(Int(window.screen.scale))")
        } catch {
            fhLog("[Snapshot] FAILED \(error.localizedDescription)")
        }
    }
    #endif
}
#endif
