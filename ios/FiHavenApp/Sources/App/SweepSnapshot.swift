import Foundation
import SwiftUI

#if DEBUG
import FiHavenCore
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
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
        let e = ProcessInfo.processInfo.environment
        guard let path = e["FH_SNAPSHOT"], !path.isEmpty else { return }
        let delay = TimeInterval(e["FH_SNAPSHOT_DELAY"] ?? "") ?? 5
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(max(delay, 0) * 1_000_000_000))
            write(to: path, env: env)
        }
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
    #elseif canImport(AppKit)
    @MainActor private static func write(to path: String, env: AppEnvironment) {
        // An attached sheet is its own panel surface — the window's backing
        // store never contains it, so a sweep that photographs the window
        // alone misses every `FH_PRESENT` capture. When one is up, the sheet
        // IS the thing under audit: photograph its content instead.
        var target = NSApp.windows.first(where: { $0.isVisible && !($0 is NSPanel) })
        if let sheet = target?.attachedSheet { target = sheet }
        guard let window = target, let content = window.contentView else {
            fhLog("[Snapshot] FAILED no window")
            return
        }
        // The window photographs itself through its own display cache —
        // `cacheDisplay` is deprecated, but it is still the only API that asks
        // AppKit for the window's already-composited pixels, and reading our
        // own backing store is what keeps Screen Recording permission out of
        // a sweep that should run unattended. CGWindowList and ScreenCaptureKit
        // both need that grant even for our own window.
        if ProcessInfo.processInfo.environment["FH_DUMP_VIEWS"] == "1" {
            fhLog("[V] window app=\(window.effectiveAppearance.name.rawValue) bg=\(window.backgroundColor) opaque=\(window.isOpaque)")
            dumpView(content, depth: 0)
        }
        guard let rep = content.bitmapImageRepForCachingDisplay(in: content.bounds) else {
            fhLog("[Snapshot] FAILED bitmap rep")
            return
        }
        content.cacheDisplay(in: content.bounds, to: rep)
        guard let data = rep.representation(using: .png, properties: [:]) else {
            fhLog("[Snapshot] FAILED png encode")
            return
        }
        var screen = "none"
        if case .signedIn = env.session { screen = SweepProbe.renderedScreen }
        let w = Int(content.bounds.width), h = Int(content.bounds.height)
        do {
            try data.write(to: URL(fileURLWithPath: path), options: .atomic)
            fhLog("[Snapshot] wrote \(path) screen=\(screen) window=\(w)x\(h) scale=\(Int(window.backingScaleFactor))")
        } catch {
            fhLog("[Snapshot] FAILED \(error.localizedDescription)")
        }
    }

    /// `FH_DUMP_VIEWS=1`: the window's real view tree — which NSView carries
    /// the opaque light surface a screenshot keeps blaming on SwiftUI.
    private static func dumpView(_ v: NSView, depth: Int) {
        var extra = ""
        if v.isHidden { extra += " hidden" }
        if v.alphaValue < 1 { extra += " a=\(v.alphaValue)" }
        if v.isOpaque { extra += " OPAQUE" }
        if let vev = v as? NSVisualEffectView {
            extra += " material=\(vev.material.rawValue) blend=\(vev.blendingMode.rawValue) state=\(vev.state.rawValue)"
        }
        if let sv = v as? NSScrollView {
            extra += " drawsBg=\(sv.drawsBackground) bg=\(sv.backgroundColor)"
        }
        if let tv = v as? NSTableView {
            extra += " tblBg=\(tv.backgroundColor)"
        }
        if let bg = v.layer?.backgroundColor, bg.alpha > 0 {
            extra += " layerBg=\(bg)"
        }
        let f = v.frame
        fhLog("[V] \(String(repeating: "  ", count: depth))\(type(of: v)) f=(\(Int(f.minX)),\(Int(f.minY)) \(Int(f.width))x\(Int(f.height))) app=\(v.effectiveAppearance.name.rawValue)\(extra)")
        v.subviews.forEach { dumpView($0, depth: depth + 1) }
    }
    #endif
}

#if canImport(UIKit)
/// `FH_VIEWPORT=WxH` or `WxH:compact` — lays the whole app out inside a
/// fixed-size letterbox so a sweep can exercise window sizes the simulator
/// will not produce: a phone has one size, an iPad sim cannot be rotated or
/// split by `simctl`, and a narrow multitasking layout is the case the size
/// class actually changes for.
///
/// `:compact` also overrides `horizontalSizeClass`, because the size alone is
/// not enough: SwiftUI's size class comes from the *window's* traits, not the
/// frame a modifier wraps the content in — a 375pt letterbox on an iPad would
/// otherwise lay out regular, which is the one answer the check exists to
/// give. A real iPad split gives a narrow app the compact class, so the
/// letterbox asks for it the same way.
///
/// The letterbox is deliberately visible — an orange hairline on a dim
/// surround — because the capture has to say which size the layout answered:
/// the PNG's device pixels are the *canvas*, and the table records the
/// viewport from the `[Viewport]` log line, not from the image's size.
extension View {
    func ctViewport() -> some View {
        modifier(ViewportForcer())
    }
}

private struct ViewportForcer: ViewModifier {
    /// The parsed `FH_VIEWPORT`, or nil for a normal full-window launch.
    private static let spec: (size: CGSize, compact: Bool)? = {
        let raw = ProcessInfo.processInfo.environment["FH_VIEWPORT"] ?? ""
        let parts = raw.lowercased().split(separator: ":")
        // `split` drops empty subsequences, so an unset or empty hook leaves
        // `parts` empty — the parse must not index it, or every ordinary
        // launch dies in `ContiguousArrayBuffer` before the first view.
        guard let dims = parts.first?.split(separator: "x"), dims.count == 2,
              let w = Double(dims[0]), let h = Double(dims[1]), w > 0, h > 0
        else { return nil }
        let compact = parts.count > 1 ? parts[1] == "compact" : false
        return (CGSize(width: w, height: h), compact)
    }()

    @State private var logged = false

    func body(content: Content) -> some View {
        if let spec = Self.spec {
            GeometryReader { geo in
                ZStack {
                    // The surround is what makes the letterbox legible in a
                    // capture: a dim field outside the hairline, so the
                    // screenshot itself says where the app's canvas ended.
                    Color.black.opacity(0.55)
                    content
                        .frame(width: spec.size.width, height: spec.size.height)
                        .clipped()
                        .border(Color.orange, width: 1)
                        .environment(\.horizontalSizeClass, spec.compact ? .compact : nil)
                }
                .onAppear {
                    guard !logged else { return }
                    logged = true
                    fhLog("[Viewport] forced \(Int(spec.size.width))x\(Int(spec.size.height)) class=\(spec.compact ? "compact" : "device") canvas=\(Int(geo.size.width))x\(Int(geo.size.height))")
                }
            }
            .ignoresSafeArea()
        } else {
            content
        }
    }
}
#endif
#endif

#if canImport(UIKit) && !DEBUG
extension View {
    /// `FH_VIEWPORT` is a sweep hook; Release builds have nothing to force.
    func ctViewport() -> some View { self }
}
#endif

#if DEBUG
/// `FH_PRESENT=<name>` — presents a named editor, sheet, or full-screen view
/// over the live shell so a sweep can photograph views that only exist
/// behind user gestures (every `.sheet` editor, the settings sheets, the
/// onboarding gate, and the signed-out-only screens when a session is up).
///
/// Resolution is *lazy*: names that need a fixture (`bill-edit` needs a
/// bill) wait for the store to load and report `[Present] UNSATISFIED`
/// instead of silently photographing the shell behind a never-opened
/// editor — a missing fixture is a failed capture, not a quiet pass.
///
/// Names (`<x>` marks a fixture-dependent one — first row is used):
///   bill-new bill-edit<x> card-new card-edit<x> pay<x> pay-card<x>
///   tx-new tx-edit<x> edit-payment<x> income-new income-edit<x>
///   income-adj-new account-new account-edit<x> goal-new goal-edit<x>
///   settings settings-sheet:<id> onboarding verify-email paywall pro
///   bank admin tabs-editor
///
/// `settings-sheet:<id>` takes a `SettingsSheet` raw value:
///   changeName changeEmail changePassword clearData deleteAccount
///   totpSetup totpDisable emailEnable emailDisable backupCodes timezone
enum AuditPresent {
    /// `String` is already Identifiable-compatible via `.id = self` below.
    static var spec: String? {
        let raw = ProcessInfo.processInfo.environment["FH_PRESENT"] ?? ""
        return raw.isEmpty ? nil : raw
    }
}

private struct AuditSheet: Identifiable { let id: String }

extension View {
    /// Wraps the signed-in shell so `FH_PRESENT` can mount a sheet on top of
    /// whichever presentation the platform uses — the presentation a real
    /// `.sheet` gets, on the real window/tabs, not a stand-in.
    func ctAuditPresentation(store: AppStore) -> some View {
        modifier(AuditPresentation(store: store))
    }
}

private struct AuditPresentation: ViewModifier {
    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var theme: ThemeStore
    @EnvironmentObject var biometric: BiometricStore
    @ObservedObject var store: AppStore
    @State private var sheetID: AuditSheet?

    func body(content: Content) -> some View {
        content
            .sheet(item: $sheetID) { id in
                sheetView(id.id)
                    .environmentObject(env)
                    .environmentObject(theme)
                    .environmentObject(biometric)
                    .environmentObject(store)
                    .environmentObject(env.billing)
            }
            .task {
                guard let spec = AuditPresent.spec else { return }
                // Fixture-dependent names wait for the data they need; a
                // spec that can never resolve is reported rather than
                // photographed as the shell.
                var waited = 0
                while !Task.isCancelled, waited < 80 {
                    if ready(spec) {
                        fhLog("[Present] showing \(spec)")
                        sheetID = AuditSheet(id: spec)
                        return
                    }
                    try? await Task.sleep(nanoseconds: 300_000_000)
                    waited += 1
                }
                fhLog("[Present] UNSATISFIED \(spec) — fixture never arrived")
            }
    }

    /// Whether the spec's prerequisites exist yet.
    private func ready(_ spec: String) -> Bool {
        switch spec {
        case "bill-edit": return !store.data.bills.isEmpty
        case "card-edit": return !store.data.cards.isEmpty
        case "pay": return !store.data.bills.isEmpty
        case "pay-card": return !store.data.cards.isEmpty
        case "tx-edit": return !store.data.transactions.isEmpty
        case "edit-payment": return !store.data.payments.isEmpty
        case "income-edit": return !store.data.settings.incomes.isEmpty
        case "account-edit": return !store.data.accounts.isEmpty
        case "goal-edit": return !store.data.goals.isEmpty
        default: return store.loaded || spec == "settings"
        }
    }

    /// Specs that are navigation push destinations in production — they are
    /// never `.sheet`s in the app, so mounting one inside the hook's sheet
    /// leaves its `List`/`ScrollView` at its (tiny) ideal height. On macOS a
    /// page spec gets the window-like size a pushed view would fill; iOS
    /// sheets already get a generous detent.
    private func isPageSpec(_ spec: String) -> Bool {
        switch spec.split(separator: ":").first.map(String.init) ?? spec {
        case "household-settings", "budget-rules", "reminder-days", "about",
             "tabs-editor", "admin", "settings":
            return true
        default:
            return false
        }
    }

    @ViewBuilder
    private func sheetView(_ spec: String) -> some View {
        let parts = spec.split(separator: ":").map(String.init)
        let specName = parts[0]
        Group {
            switch specName {
        case "bill-new": BillEditorView(bill: nil)
        case "bill-edit": BillEditorView(bill: store.data.bills.first)
        case "card-new": CardEditorView(card: nil, defaultType: "card")
        case "card-edit": CardEditorView(card: store.data.cards.first, defaultType: store.data.cards.first?.type ?? "card")
        case "pay":
            if let b = store.data.bills.first {
                PayView(target: PayTarget(type: "bill", refId: String(b.id), name: b.name))
            }
        case "pay-card":
            if let c = store.data.cards.first {
                PayView(target: PayTarget(type: "card", refId: String(c.id), name: c.name))
            }
        case "tx-new": TransactionEditorView()
        case "tx-edit": TransactionEditorView(edit: store.data.transactions.first)
        case "edit-payment": EditPaymentView(payment: store.data.payments.first!)
        case "income-new": IncomeEditorView(source: nil)
        case "income-edit": IncomeEditorView(source: store.data.settings.incomes.first)
        case "income-adj-new":
            IncomeAdjustmentEditorView(adjustment: nil, monthKey: Income.periodAnchorMonth(store.currentBounds))
        case "account-new": AccountEditorView(account: nil)
        case "account-edit": AccountEditorView(account: store.data.accounts.first)
        case "goal-new": GoalEditorView(goal: nil)
        case "goal-edit": GoalEditorView(goal: store.data.goals.first)
        case "settings": SettingsView(user: env.currentUser!)
        // The drill-downs are `NavigationLink` destinations inside Settings,
        // not sheets — each still mounts fine inside the sheet's own
        // navigation context, wrapped in a NavigationStack so its title and
        // back affordance render as they do under the real push.
        case "household-settings":
            NavigationStack {
                HouseholdSettingsView(api: env.api, myEmail: env.currentUser?.email ?? "")
            }
        case "budget-rules": NavigationStack { BudgetRuleSettingsView() }
        case "reminder-days": NavigationStack { ReminderDaysView() }
        case "about": NavigationStack { AboutView() }
        case "mfa":
            // A synthesized challenge: the real one arrives only as a
            // session branch, which a signed-in sweep cannot reach — and the
            // view's layout is the thing under review, not the token.
            MFAView(challenge: MfaChallenge(mfaToken: "sweep", methods: ["totp", "email"]))
        case "settings-sheet": settingsSheet(parts.count > 1 ? parts[1] : "")
        case "onboarding": OnboardingView()
        case "verify-email": VerifyEmailView(user: env.currentUser!)
        case "paywall": PaywallView()
        case "pro": ProView()
        case "tabs-editor": NavigationStack { TabsEditorView() }
        #if canImport(UIKit)
        case "bank": BankView()
        #endif
        case "admin": NavigationStack { AdminView() }
        default:
            Text("FH_PRESENT: unknown spec '\(spec)'")
            }
        }
        #if os(macOS)
        .frame(minHeight: isPageSpec(spec) ? 560 : 0)
        #endif
    }

    @ViewBuilder
    private func settingsSheet(_ id: String) -> some View {
        let user = env.currentUser
        switch id {
        case "changeName": ChangeNameSheet(current: user!)
        case "changeEmail": ChangeEmailSheet(current: user!)
        case "changePassword": ChangePasswordSheet()
        case "clearData": ClearDataSheet()
        case "deleteAccount": DeleteAccountSheet()
        case "totpSetup": TotpSetupSheet()
        case "totpDisable": TotpDisableSheet()
        case "emailEnable": EmailEnableSheet(email: user?.email ?? "")
        case "emailDisable": EmailDisableSheet()
        case "backupCodes": BackupCodesSheet()
        case "timezone": TimezoneSheet()
        default: Text("FH_PRESENT: unknown settings-sheet '\(id)'")
        }
    }
}
#endif
