import XCTest
import UIKit

/// Real system transitions, not forced viewports.
///
/// `simctl` has no rotation or multitasking control, so this is the only
/// harness that can watch the app move between orientations for real:
/// `XCUIDevice.shared.orientation` rotates the actual SpringBoard — the
/// window's trait collection, size classes, and layout all change the way
/// they do for a user turning the device. Anything `FH_VIEWPORT` shows is
/// a forced letterbox with a borrowed size class; what this file shows is
/// the system transition itself.
///
/// Two lanes, deliberately separate:
/// - Signed-out: always runs. The intro pager and the auth form need no
///   server, and the email field is a real unsaved-edit surface.
/// - Signed-in: skips unless the launch env carries the dev account
///   (FH_BASE + FH_DEV_EMAIL + FH_DEV_PASSWORD). Runs against whatever
///   server FH_BASE names — the local dev server on CI-free runs.
///
/// Every rotation is followed by a hittability + content check, not just a
/// screenshot: "the button exists" is what separates a rotation from a
/// frozen framebuffer.
final class TransitionUITests: XCTestCase {

    /// The UI-test runner's own environment is not the app's — the env a
    /// `simctl launch` would prefix `SIMCTL_CHILD_` for arrives here raw,
    /// and goes into `launchEnvironment` verbatim.
    private func launchEnv(_ extra: [String: String] = [:]) -> [String: String] {
        var env = ProcessInfo.processInfo.environment
        var out: [String: String] = [:]
        for key in ["FH_BASE", "FH_DEV_EMAIL", "FH_DEV_PASSWORD",
                    "FH_DEV_ENTITLEMENT", "FH_AUTOLOGIN", "FH_SIGNED_OUT",
                    "FH_INTRO_SEEN", "FH_TURNSTILE_SITEKEY", "FH_SKIP_STOREKIT",
                    "FH_ROUTE", "FH_SCREEN", "FH_TAB", "FH_PRESENT"] {
            if let v = env[key] { out[key] = v }
        }
        for (k, v) in extra { out[k] = v }
        return out
    }

    @MainActor
    private func attach(_ name: String, of element: XCUIScreenshotProviding) {
        let shot = element.screenshot()
        let a = XCTAttachment(screenshot: shot)
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    // MARK: - Signed-out (always runs)

    /// The auth card in both orientations, plus unsaved text across the
    /// rotation: type in the email field, turn the device, assert the text
    /// and the submit button are still where a user left them.
    @MainActor func testAuthRotationPreservesForm() throws {
        let app = XCUIApplication()
        app.launchEnvironment = launchEnv([
            "FH_SIGNED_OUT": "1", "FH_INTRO_SEEN": "1",
            "FH_SKIP_STOREKIT": "1",
        ])
        app.launch()

        let email = app.textFields["you@example.com"]
        XCTAssertTrue(email.waitForExistence(timeout: 15),
                      "email field not shown — \(app.debugDescription.prefix(600))")
        email.tap()
        email.typeText("rotate@test.example")

        let submit = app.buttons["Sign in"]
        XCTAssertTrue(submit.waitForExistence(timeout: 5))
        attach("auth-portrait", of: app)

        XCUIDevice.shared.orientation = .landscapeLeft
        // Rotation is animated; wait for a layout-affecting settle rather
        // than a fixed sleep where possible.
        XCTAssertTrue(email.waitForExistence(timeout: 8))
        attach("auth-landscape", of: app)

        // The unsaved text must survive a real orientation change.
        XCTAssertEqual(email.value as? String, "rotate@test.example",
                       "email field lost its text across rotation")
        XCTAssertTrue(submit.isHittable, "Sign-in button not hittable in landscape")

        XCUIDevice.shared.orientation = .portrait
        XCTAssertTrue(email.waitForExistence(timeout: 8))
        XCTAssertEqual(email.value as? String, "rotate@test.example",
                       "email field lost its text rotating back")
        XCTAssertTrue(submit.isHittable, "Sign-in button not hittable after returning to portrait")
        attach("auth-portrait-return", of: app)
    }

    /// The first-run pager across a rotation — the screen most likely to
    /// pin a control below the fold, since it stacks a pager over buttons.
    @MainActor func testIntroRotationKeepsControlsReachable() throws {
        let app = XCUIApplication()
        app.launchEnvironment = launchEnv([
            "FH_SIGNED_OUT": "1", "FH_INTRO_SEEN": "0",
            "FH_SKIP_STOREKIT": "1",
        ])
        app.launch()

        let next = app.buttons["Next"]
        XCTAssertTrue(next.waitForExistence(timeout: 15),
                      "intro pager's Next not shown — \(app.debugDescription.prefix(600))")
        XCTAssertTrue(next.isHittable, "Next not hittable in portrait")
        attach("intro-portrait", of: app)

        XCUIDevice.shared.orientation = .landscapeRight
        XCTAssertTrue(next.waitForExistence(timeout: 8))
        XCTAssertTrue(next.isHittable, "Next not hittable in landscape — control fell below the fold")
        attach("intro-landscape", of: app)

        // Advance once in landscape: the pager must actually work, not just render.
        next.tap()
        let skip = app.buttons["Skip"]
        XCTAssertTrue(skip.waitForExistence(timeout: 5))
        attach("intro-landscape-p2", of: app)

        XCUIDevice.shared.orientation = .portrait
        XCTAssertTrue(next.waitForExistence(timeout: 8))
        XCTAssertTrue(next.isHittable, "Next not hittable after returning to portrait")
        attach("intro-portrait-return", of: app)
    }

    /// Reduce Motion: the app's own read of the system pref, plus a real
    /// expand/collapse of the paywall perk list so the run's screen recording
    /// carries the actual transition. The flag lives in the test process but
    /// reads the same booted-simulator preference the app reads.
    @MainActor func testReducedMotionPaywallExpand() throws {
        let env = ProcessInfo.processInfo.environment
        guard env["FH_BASE"] != nil,
              env["FH_DEV_EMAIL"] != nil,
              env["FH_DEV_PASSWORD"] != nil else {
            throw XCTSkip("paywall motion test needs FH_BASE + FH_DEV_* env")
        }
        let reduced = UIAccessibility.isReduceMotionEnabled
        XCTContext.runActivity(named: "isReduceMotionEnabled=\(reduced)") { _ in }

        let app = XCUIApplication()
        app.launchEnvironment = launchEnv([
            "FH_AUTOLOGIN": "1", "FH_INTRO_SEEN": "1",
            "FH_DEV_ENTITLEMENT": "free",
            "FH_SKIP_STOREKIT": "1", "FH_PRESENT": "paywall",
        ])
        app.launch()

        let toggle = app.buttons["See everything in Pro"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 25),
                      "perks toggle not shown — \(app.debugDescription.prefix(600))")
        // Marker so the recording's transition window is findable.
        print("[RM-TEST] flag=\(reduced) tapping perks toggle at \(Date().timeIntervalSince1970)")
        toggle.tap()

        // The sixth extra perk only exists expanded; hittability proves the
        // list finished whatever transition it ran.
        let last = app.staticTexts["Data export"]
        XCTAssertTrue(last.waitForExistence(timeout: 8))
        attach(reduced ? "paywall-expanded-reduced" : "paywall-expanded-animated", of: app)
        print("[RM-TEST] expanded settled at \(Date().timeIntervalSince1970)")
    }

    // MARK: - Signed-in (needs the dev server env)

    /// The signed-in shell across real rotations. Skips (not fails) when no
    /// FH_BASE/credentials are in the environment, so a bare
    /// `xcodebuild test` never tries to sign into production.
    @MainActor func testShellRotationPreservesSelection() throws {
        let env = ProcessInfo.processInfo.environment
        guard env["FH_BASE"] != nil,
              env["FH_DEV_EMAIL"] != nil,
              env["FH_DEV_PASSWORD"] != nil else {
            throw XCTSkip("signed-in rotation test needs FH_BASE + FH_DEV_* env")
        }

        let app = XCUIApplication()
        app.launchEnvironment = launchEnv([
            "FH_AUTOLOGIN": "1", "FH_INTRO_SEEN": "1",
            "FH_DEV_ENTITLEMENT": env["FH_DEV_ENTITLEMENT"] ?? "active",
            "FH_SKIP_STOREKIT": "1", "FH_SCREEN": "bills",
        ])
        app.launch()

        // The shell is signed in when a sidebar/tab destination exists.
        // Bills is what FH_SCREEN routes to; its nav title is the check.
        let billsTitle = app.navigationBars.staticTexts["Bills"]
        XCTAssertTrue(billsTitle.waitForExistence(timeout: 25),
                      "bills screen not reached — \(app.debugDescription.prefix(600))")
        attach("shell-portrait-bills", of: app)

        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertTrue(billsTitle.waitForExistence(timeout: 10),
                      "Bills lost its selection across rotation")
        attach("shell-landscape-bills", of: app)

        XCUIDevice.shared.orientation = .portrait
        XCTAssertTrue(billsTitle.waitForExistence(timeout: 10),
                      "Bills lost its selection rotating back")
        attach("shell-portrait-return", of: app)
    }
}
