import SwiftUI

#if canImport(UIKit)
import UIKit

/// The types behind the shims below. On iOS these are the real SwiftUI /
/// UIKit ones, so call sites read exactly as they always did; on macOS they
/// are the small stand-ins the shared code needs, because the Mac has no
/// touch keyboard, no swipe actions, and no `PresentationDetent`.
typealias PlatformAutocapitalization = TextInputAutocapitalization
typealias PlatformKeyboardType = UIKeyboardType
typealias PlatformTextContentType = UITextContentType
#else
/// macOS has no autocapitalization setting — the Mac keyboard does not
/// auto-shift, so there is nothing to switch off.
enum PlatformAutocapitalization: Equatable { case never, sentences, words, characters }

/// macOS has one keyboard, so a keyboard *type* means nothing. The cases
/// mirror the ones the app actually asks for (`UIKeyboardType.URL` keeps its
/// spelling so call sites are identical on both platforms).
enum PlatformKeyboardType: Equatable {
    case `default`
    case URL
    case decimalPad
    case numberPad
    case emailAddress
    case numbersAndPunctuation
}

/// macOS has no AutoFill content types to declare.
enum PlatformTextContentType: Equatable {
    case oneTimeCode
    case emailAddress
    case password
    case newPassword
    case username
}
#endif

/// A sheet detent, spelled out because `PresentationDetent` itself is not
/// declared on macOS — a shim that took `Set<PresentationDetent>` wouldn't
/// even compile there.
enum CTSheetDetent { case medium, large }

extension View {
    /// `.ctInlineTitle()` is iOS-only; macOS has one
    /// window-title style, so the call drops out rather than making all 28
    /// call sites carry a platform branch.
    func ctInlineTitle() -> some View {
        #if canImport(UIKit)
        navigationBarTitleDisplayMode(.inline)
        #else
        self
        #endif
    }

    /// The Fi monogram + screen name that iOS centres in the navigation bar.
    ///
    /// The Mac shows the same name in the window's own title, right where the
    /// toolbar begins, so adding a second copy in the middle of the toolbar
    /// reads as a duplicated title rather than a brand mark. On the Mac the
    /// titlebar says it once.
    func ctBrandedTitle(_ title: String) -> some View {
        #if canImport(UIKit)
        toolbar {
            ToolbarItem(placement: .principal) {
                BrandedNavTitle(title: title)
            }
        }
        #else
        self
        #endif
    }

    /// `listStyle(.insetGrouped)` is iOS-only. macOS gets `inset`, which is
    /// the closest thing it has.
    func ctGroupedList() -> some View {
        #if canImport(UIKit)
        listStyle(.insetGrouped)
        #else
        listStyle(.inset)
        #endif
    }

    /// Sheet detents are a touch affordance; a Mac sheet sizes to its content.
    func ctDetents(_ detents: [CTSheetDetent]) -> some View {
        #if canImport(UIKit)
        presentationDetents(Set(detents.map { $0 == .medium ? .medium : .large }))
        #else
        self
        #endif
    }

    /// Swipe actions need a touch screen. Every call site also carries the
    /// same actions in a context menu, which is how a Mac has them.
    func ctSwipeActions<C: View>(
        edge: HorizontalEdge = .trailing,
        @ViewBuilder content: () -> C
    ) -> some View {
        #if canImport(UIKit)
        swipeActions(edge: edge, content: content)
        #else
        self
        #endif
    }

    /// Always-on reorder state, behind the Tabs and Dashboard-widget editors.
    /// A macOS `List` reorders by drag and has no edit mode at all, and the
    /// `\.editMode` key path is unavailable there.
    func ctAlwaysEditing() -> some View {
        #if canImport(UIKit)
        environment(\.editMode, .constant(.active))
        #else
        self
        #endif
    }

    func ctKeyboardType(_ type: PlatformKeyboardType) -> some View {
        #if canImport(UIKit)
        keyboardType(type)
        #else
        self
        #endif
    }

    func ctAutocapitalization(_ style: PlatformAutocapitalization) -> some View {
        #if canImport(UIKit)
        textInputAutocapitalization(style)
        #else
        self
        #endif
    }

    func ctTextContentType(_ type: PlatformTextContentType?) -> some View {
        #if canImport(UIKit)
        textContentType(type)
        #else
        self
        #endif
    }

    /// A list row's frame, for the screens whose rows are built by hand.
    ///
    /// On iOS a row is a card: padded, rounded, hairline border, one row per
    /// gap. That is right for a phone — five rows fill the screen and each one
    /// is a thumb target — and wrong for a Mac, where a 1280pt window shows
    /// forty rows and a stack of bordered boxes is mostly empty space. The Mac
    /// gets a flat row with a hairline underneath, the shape AppKit's own
    /// `NSTableView` draws, plus the hover highlight that says which row the
    /// pointer is over.
    func ctRowCard(hovering: Bool = false) -> some View {
        #if canImport(UIKit)
        self
            .padding(14)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radiusCard, style: .continuous)
                    .stroke(Theme.border, lineWidth: 1)
            )
        #else
        self
            .padding(.vertical, 6)
            .padding(.horizontal, 10)
            .background(hovering ? Theme.surface2 : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(Theme.border.opacity(0.7))
                    .frame(height: 1)
            }
        #endif
    }

    /// The insets around a hand-built list row.
    ///
    /// iOS keeps the gap that lets each row read as its own card. The Mac uses
    /// the hairline-to-hairline spacing of a table, so the rows in a list meet
    /// edge to edge and only `ctRowCard` draws a line between them.
    func ctRowInsets() -> some View {
        #if canImport(UIKit)
        listRowInsets(EdgeInsets(top: 5, leading: 16, bottom: 5, trailing: 16))
        #else
        listRowInsets(EdgeInsets(top: 0, leading: 10, bottom: 0, trailing: 10))
        #endif
    }

    /// The quick actions at the end of a row.
    ///
    /// On iOS they are always on screen: there is no hover and a swipe is
    /// undiscoverable. The Mac's equivalent is the row's own context menu,
    /// which every caller already carries, so the inline copies are held back
    /// until the pointer is over the row — the way Mail and Finder do it. The
    /// space is reserved either way, so revealing them never nudges the row.
    func ctRowActions(_ visible: Bool) -> some View {
        #if canImport(UIKit)
        self
        #else
        opacity(visible ? 1 : 0)
        #endif
    }

    /// A button that draws exactly its label, with no platform chrome.
    ///
    /// macOS's default button style paints a bezel *around* a custom label:
    /// "Continue with Google" was laid out 353pt wide inside a 376pt card (the
    /// AppKit button reserved the rest), and a grey pill appeared behind the
    /// passkey and "Create one" rows. iOS's default style already draws a
    /// custom label as-is, so `.plain` is a no-op there — the two platforms
    /// then show the same branded button, which is what the design has always
    /// described.
    func ctPlainButton() -> some View {
        buttonStyle(.plain)
    }

    /// Keeps a Mac window on the screen it is on, gives it the size its scene
    /// asks for, and remembers the user's own resize; see
    /// `MacWindowFrameGuard`. A no-op on iOS, where the OS owns the frame.
    ///
    /// - Parameters:
    ///   - size: the size the window opens at when nothing is saved.
    ///   - minSize: the smallest the user may drag it; content-sized windows
    ///     (the ⌘, window) pass their own.
    ///   - autosaveName: which defaults key remembers the frame. One per
    ///     window, or the two windows would fight over the same rectangle.
    func ctWindowFrameGuard(
        size: CGSize = MacWindowDefaults.size,
        minSize: CGSize = MacWindowDefaults.minSize,
        autosaveName: String = MacWindowDefaults.autosaveName
    ) -> some View {
        #if canImport(UIKit)
        self
        #else
        background(MacWindowFrameGuard(size: size, minSize: minSize, autosaveName: autosaveName))
        #endif
    }
}

/// The geometry a Mac window opens with.
///
/// These live outside the frame guard below because a default argument is
/// type-checked on every platform: `ctWindowFrameGuard()`'s signature asks for
/// them on iOS too, where the modifier itself is a no-op.
enum MacWindowDefaults {
    static let size = CGSize(width: 1280, height: 860)
    static let minSize = CGSize(width: 640, height: 520)
    static let autosaveName = "FiHavenWindow"
}

/// When a Mac pane splits in two.
///
/// Four screens put a second column beside their content — the Calendar's day
/// inspector, Payoff's controls, Budget's goals, Home's widgets — and all four
/// are asking the same question: is there room for two? Each answering it with
/// its own number is how one screen stays split at a width another has already
/// given up on, so the baseline is here. A screen whose content needs more than
/// the baseline says so locally, the way a table supplies its own column
/// thresholds to `MacTableWidth.fit`.
///
/// The baseline is a side column plus a main column that is still a column:
/// at 640pt — `MacWindowDefaults.minSize`, which the app allows — the window
/// leaves the detail pane 404pt, and a 320pt side column taken out of that
/// starves the content it is meant to annotate to 84pt.
enum MacPaneColumns {
    /// The narrower of the two. Wide enough for a slider, a segmented picker, a
    /// goal's name and a figure, or a widget card's own rows.
    static let sideWidth: CGFloat = 320
    /// Below this, one column: the side column becomes a section under the
    /// content instead of a column beside it.
    static let minSplitWidth: CGFloat = 820

    /// The pane width at which a screen may put its side column beside a main
    /// column of the given width.
    ///
    /// A screen whose main column is a table derives its threshold through
    /// this rather than typing a number, because the right number is the sum of
    /// the table's own columns — which the table already knows (see
    /// `MacTableWidth.fit`) and which changes when its columns do. A threshold
    /// typed by hand silently stops matching the table it was measured for.
    ///
    /// Never below `minSplitWidth`: a screen built around a narrow table still
    /// should not split a pane that has barely room for one column.
    static func sideSplit(mainColumn: CGFloat) -> CGFloat {
        max(minSplitWidth, mainColumn + sideWidth)
    }
}

#if !canImport(UIKit)
import AppKit

/// Gives the Mac window the size the scene asks for, keeps it on the screen,
/// and lets AppKit remember it.
///
/// Three things went wrong here, all of them visible in the same screenshot:
///
/// * SwiftUI's `Window` scene sized the window to the display — every screen is
///   `maxHeight: .infinity`, so `.defaultSize(width: 1280, height: 860)` was
///   never consulted and the app came up 1012pt tall on a 1083pt screen.
/// * Nothing clamped a window that was *larger* than the display. macOS's own
///   `constrainFrameRect` does not shrink one; it only keeps the titlebar
///   reachable. So the frame left behind by the old "Designed for iPad" build —
///   1280x1733, from the iPad layout in portrait — came back at that size: the
///   intro laid itself out in a 1733pt canvas, the header stayed pinned at the
///   top, and everything below the fold, Next button included, sat off the
///   bottom of the screen.
/// * `Window` never saved the frame, so a resize was lost on quit and the next
///   launch filled the display again.
///
/// `contentMinSize` is the other half: without it a Mac window can be dragged
/// down to a strip none of these layouts fit in.
private struct MacWindowFrameGuard: NSViewRepresentable {
    let size: CGSize
    let minSize: CGSize
    let autosaveName: String

    func makeNSView(context: Context) -> NSView {
        FrameGuardView(size: size, minSize: minSize, autosaveName: autosaveName)
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}

private final class FrameGuardView: NSView {
    private let preferredSize: NSSize
    private let minimumSize: NSSize
    private let autosaveName: String

    /// Runs once per window, not on every re-attach of the hosting view.
    private var applied = false

    #if DEBUG
    /// The observer that keeps a pinned window pinned; see `watchFrame(_:of:)`.
    private var frameWatcher: NSObjectProtocol?
    /// The size the pin is holding the window at, for `reassertPinned()`; nil
    /// when nothing is pinned, which is also when there is nothing to re-assert.
    private var pinnedSize: NSSize?
    /// How many times each drifted size has been put back, so the log can report
    /// the magnitude of the fight without a line per frame.
    private var driftCounts: [String: Int] = [:]

    /// The pin in force, for the one caller that needs it synchronously.
    ///
    /// Weak, because a closed window's guard is nobody's pin any more.
    private static weak var pin: FrameGuardView?

    /// Puts the window back to the size the pin asks for, right now.
    ///
    /// The guard's own correction is a turn of the run loop behind the resize
    /// that needs undoing (see `watchFrame(_:of:)`), so anything that measures
    /// the window in between sees SwiftUI's proposal instead of the pinned
    /// size: one floor sweep reported 659x520 for a 640x520 pin, and the next
    /// reported 640x520 for the same screen. A capture re-asserts first, which
    /// leaves nothing to race.
    static func reassertPinned() {
        guard let pin, let window = pin.window, let size = pin.pinnedSize,
              window.frame.size != size else { return }
        var frame = window.frame
        frame.size = size
        window.setFrame(frame, display: true)
    }
    #endif

    init(size: CGSize, minSize: CGSize, autosaveName: String) {
        self.preferredSize = NSSize(width: size.width, height: size.height)
        self.minimumSize = NSSize(width: minSize.width, height: minSize.height)
        self.autosaveName = autosaveName
        super.init(frame: .zero)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not a nib view") }

    #if DEBUG
    deinit {
        if let frameWatcher { NotificationCenter.default.removeObserver(frameWatcher) }
    }
    #endif

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        guard let window else { return }
        window.contentMinSize = minimumSize
        guard !applied else { return }
        applied = true
        // SwiftUI sizes the window itself during the layout pass that follows
        // the content being installed, so a `setFrame` from inside
        // `viewDidMoveToWindow` is immediately overwritten by a window as tall
        // as the display. One turn of the run loop later it sticks.
        DispatchQueue.main.async { [weak self] in self?.apply(to: window) }
    }

    private func apply(to window: NSWindow) {
        guard let screen = window.screen ?? NSScreen.main else { return }
        let visible = screen.visibleFrame

        #if DEBUG
        // `FH_WINDOW=1440x900` pins the size for a screenshot sweep, which
        // needs every screen captured at the same width for the shots to be
        // comparable. The autosave name is deliberately *not* adopted on this
        // path: AppKit saves whatever frame it is given under that name, so a
        // sweep would otherwise rewrite the size someone chose for their own
        // window. Clamped like any other frame, so asking for more than the
        // display has comes back at the display's size.
        if let forced = Self.forcedSize {
            let frame = Self.clamp(centered(forced, in: visible), to: visible)
            // `contentMaxSize` is what makes the pin hold. `setFrame` on its
            // own loses: SwiftUI sizes the window to the scene's `defaultSize`
            // during the layout pass that follows, and `FH_WINDOW=640x520`
            // came back as 640 wide over the default 860 of height — on every
            // screen, so it read as an app-wide minimum rather than a pin that
            // missed. AppKit will not grow a window past its content maximum,
            // and that is the one bound SwiftUI cannot overrule.
            window.contentMinSize = forced
            window.contentMaxSize = forced
            window.setFrame(frame, display: true)
            // The same one-turn-later re-assert the restored path gets from
            // `viewDidMoveToWindow`, and the size the window actually settled
            // at rather than the size asked for: a sweep that reports 640x520
            // while photographing 640x883 is worse than no pin at all, and the
            // log line is the only place that can say so.
            DispatchQueue.main.async { [weak self] in
                window.setFrame(frame, display: true)
                self?.logPinned(forced, window)
            }
            pinnedSize = forced
            Self.pin = self
            watchFrame(forced, of: window)
            return
        }
        #endif

        // Adopting the autosave name also restores whatever frame is stored
        // under it, so it comes first and the decision below overrides it.
        window.setFrameAutosaveName(autosaveName)

        // A saved frame counts only when it still fits the display in front of
        // us. The old "Designed for iPad" build wrote a 1280x1733 frame (the
        // iPad layout in portrait) under a key with this app's bundle id, and
        // restoring one of those is what put the app's content — the intro's
        // Next button included — below the bottom edge of the screen. macOS
        // does not refuse an oversized frame, it silently constrains it, so
        // the check has to be on the stored numbers rather than on the window.
        let saved = savedFrame()
        let usable = saved.flatMap { visible.contains($0) ? $0 : nil }
        var frame = usable ?? centeredDefault(in: visible)
        frame = Self.clamp(frame, to: visible)
        window.setFrame(frame, display: true)
        fhLog("[Window] \(autosaveName) frame \(Int(frame.width))x\(Int(frame.height)) restored=\(usable != nil) in \(Int(visible.width))x\(Int(visible.height)) visible")
    }

    #if DEBUG
    /// A pinned window that anything grows is put back the moment it happens.
    ///
    /// Asserting once is not enough, and the evidence is a screenshot that
    /// says one size and shows another: `contentMaxSize` plus a `setFrame` one
    /// turn later held 640x520 for long enough to log `settled 640x520`, and
    /// the capture taken five seconds later was 640x883 again. SwiftUI's scene
    /// re-sizes the window once the content has actually laid itself out,
    /// which is a second or two in — after the deferred assert and well before
    /// a sweep's `FH_SNAPSHOT_DELAY`. So the pin watches the window rather than
    /// arguing with it once, and the resize it undoes is what the line below
    /// reports. DEBUG only, and only while `FH_WINDOW` is set.
    ///
    /// *Who* is asking was measured rather than inferred, and it is neither of
    /// the two things the fight was first read as. The stack under the resize is
    /// `NSHostingView.windowDidLayout` → `NSHostingView.updateAnimatedWindowSize`,
    /// so what grows the window is SwiftUI proposing a size that fits the
    /// content, on every layout pass — not AppKit restoring a saved frame (the
    /// `NSWindow Frame main` key this app would restore from does not exist in
    /// its defaults, and the pin path never adopts an autosave name). It is a
    /// preference rather than a floor: while SwiftUI kept asking for 640x661,
    /// the window's own `contentMinSize` was 140x556, and every 640x520 floor
    /// capture is a real screen with a real table in it. So 520 is a size the
    /// layout holds and SwiftUI simply disagrees about, which is why the answer
    /// here is the correction below and not a larger
    /// `MacWindowDefaults.minSize`.
    ///
    /// The fight is loud — 980 identical lines on the Cards floor capture, ~35
    /// on a screen that re-proposes less often — and ninety lines a second is
    /// what buries the rest of a screen's log. So a drifted size gets a line the
    /// first time it appears and then only when its count doubles: the last line
    /// of a run reports the magnitude without the flood.
    private func watchFrame(_ size: NSSize, of window: NSWindow) {
        let watched = window
        frameWatcher = NotificationCenter.default.addObserver(
            forName: NSWindow.didResizeNotification, object: window, queue: .main
        ) { [weak self, weak watched] _ in
            // Not here: a resize notification is delivered from inside the
            // display cycle, and a `setFrame` from this stack re-enters the
            // constraint pass AppKit is in the middle of — it throws, and the
            // app dies on the next layout. The correction goes on the next turn
            // of the run loop, by which time the cycle has finished. A frame
            // at the wrong height for a few milliseconds is invisible; a
            // SIGTRAP is not.
            DispatchQueue.main.async {
                guard let self, let watched, watched.frame.size != size else { return }
                var frame = watched.frame
                let drifted = frame.size
                frame.size = size
                watched.setFrame(frame, display: true)
                let key = "\(Int(drifted.width))x\(Int(drifted.height))"
                let repeats = (self.driftCounts[key] ?? 0) + 1
                self.driftCounts[key] = repeats
                // First time (1), then 2, 4, 8 … — a power of two — so the
                // last line a run prints still says how big the fight got.
                guard repeats.nonzeroBitCount == 1 else { return }
                let sofar = repeats > 1 ? " (×\(repeats) so far)" : ""
                fhLog("[Window] \(self.autosaveName) pinned \(Int(size.width))x\(Int(size.height)); put back from \(key)\(sofar)")
                if ProcessInfo.processInfo.environment["FH_DIAG_FRAME"] == "1" {
                    Self.describeFrameProposers(watched)
                }
            }
        }
    }

    /// The pin's own size, and the three views that have to agree on it: the
    /// window's frame, its content, and the frame view the snapshot
    /// rasterizes. A sweep reports the last of these, so a disagreement is
    /// exactly the thing that made this worth logging.
    private func logPinned(_ size: NSSize, _ window: NSWindow) {
        let content = window.contentView.map { "\(Int($0.frame.width))x\(Int($0.frame.height))" } ?? "nil"
        let chrome = window.contentView?.superview.map { "\(Int($0.frame.width))x\(Int($0.frame.height))" } ?? "nil"
        fhLog("[Window] \(autosaveName) pinned \(Int(size.width))x\(Int(size.height)); window \(Int(window.frame.width))x\(Int(window.frame.height)) content \(content) chrome \(chrome), autosave untouched")
    }

    /// Who asked for the size the guard just undid. `FH_DIAG_FRAME=1` only.
    ///
    /// A window does not resize itself: `NSHostingView.updateAnimatedWindowSize`
    /// asks for whatever the SwiftUI content reports, and the question this
    /// answers is *which* number it asked with. It settled the open ledger
    /// entry: the answer is the window's own **minimum** (`contentMinSize`,
    /// 140x556 on every screen, installed by SwiftUI over the guard's), not any
    /// view's `fittingSize` — every one of those measures 0x0. A 640x520 frame
    /// leaves 415pt of content on this Mac once its 105pt of titlebar and
    /// toolbar are taken off, which is below that minimum, so AppKit grows the
    /// window to 556 + 105 = 661. The candidates worth re-checking first are
    /// therefore the *minimum*, not the content's ideal height.
    private static func describeFrameProposers(_ window: NSWindow) {
        func size(_ view: NSView?) -> String {
            guard let view else { return "nil" }
            let fit = view.fittingSize
            return "\(Int(view.frame.width))x\(Int(view.frame.height)) fit \(Int(fit.width))x\(Int(fit.height))"
        }
        var lines = ["content=\(size(window.contentView))",
                     "contentMin=\(Int(window.contentMinSize.width))x\(Int(window.contentMinSize.height))"]
        func walk(_ view: NSView, _ depth: Int) {
            guard depth <= 3 else { return }
            // The generic parameter of a hosting view prints as the whole
            // modified-content chain, which is a paragraph; the class name is
            // the part that identifies it.
            let name = String(describing: type(of: view)).split(separator: "<").first.map(String.init) ?? "?"
            if name.contains("SplitView") || name.contains("Hosting") || view is NSScrollView {
                lines.append("\(String(repeating: "  ", count: depth))\(name) \(size(view))")
            }
            for sub in view.subviews { walk(sub, depth + 1) }
        }
        if let content = window.contentView { walk(content, 1) }
        fhLog("[DiagFrame] " + lines.joined(separator: " | "))
    }
    #endif

    /// The frame AppKit last saved for this window, or nil if there is none.
    ///
    /// The value is the eight-number string AppKit writes: origin, size, then
    /// the bounds of the screen it was on.
    private func savedFrame() -> NSRect? {
        guard let raw = UserDefaults.standard.string(forKey: "NSWindow Frame \(autosaveName)") else { return nil }
        let numbers = raw.split(separator: " ").compactMap { Double($0) }
        guard numbers.count >= 4 else { return nil }
        return NSRect(x: numbers[0], y: numbers[1], width: numbers[2], height: numbers[3])
    }

    private func centeredDefault(in visible: NSRect) -> NSRect {
        let size = NSSize(width: max(minimumSize.width, min(preferredSize.width, visible.width)),
                          height: max(minimumSize.height, min(preferredSize.height, visible.height)))
        return centered(size, in: visible)
    }

    /// The same rectangle at the middle of the display, for any size.
    private func centered(_ size: NSSize, in visible: NSRect) -> NSRect {
        NSRect(x: visible.midX - size.width / 2,
               y: visible.midY - size.height / 2,
               width: size.width,
               height: size.height)
    }

    #if DEBUG
    /// `FH_WINDOW=1440x900`, the size a screenshot sweep asks for. Nil — and so
    /// the ordinary restored-or-defaulted frame — in Release and whenever the
    /// variable is unset or malformed. Deliberately the same shape as the iOS
    /// `FH_VIEWPORT`, which is the hook this one stands in for on a platform
    /// whose window is simply resizable.
    private static var forcedSize: NSSize? {
        let parts = (ProcessInfo.processInfo.environment["FH_WINDOW"] ?? "")
            .lowercased().split(separator: "x")
        guard parts.count == 2,
              let w = Double(parts[0]), let h = Double(parts[1]), w > 0, h > 0
        else { return nil }
        return NSSize(width: w, height: h)
    }
    #endif

    /// Shrinks the frame to the screen and pulls it back inside when part of it
    /// hangs off an edge.
    private static func clamp(_ frame: NSRect, to visible: NSRect) -> NSRect {
        var clamped = frame
        clamped.size.width = min(clamped.width, visible.width)
        clamped.size.height = min(clamped.height, visible.height)
        clamped.origin.x = min(max(clamped.minX, visible.minX), max(visible.maxX - clamped.width, visible.minX))
        clamped.origin.y = min(max(clamped.minY, visible.minY), max(visible.maxY - clamped.height, visible.minY))
        return clamped
    }
}

#if DEBUG
/// Puts a pinned window (`FH_WINDOW`) back on the size it was pinned to, now.
///
/// DEBUG-only, because the pin is: the snapshot hook calls this immediately
/// before it reads the window's geometry, so a capture cannot land between
/// SwiftUI's content-fit proposal and the guard's correction. See
/// `FrameGuardView.reassertPinned()` for why that race is worth closing.
@MainActor
func ctReassertPinnedWindowSize() {
    FrameGuardView.reassertPinned()
}
#endif

/// The summary a Mac screen puts above its table: one line, flush to the
/// window's edges and closed by a hairline.
///
/// It is a table's own header rather than a card floating above it — the
/// table underneath starts at its column headers, the way a table on a Mac
/// starts — and one line is the whole point: a stack of labelled figures is a
/// third of the window spent on three numbers, which is a phone's answer to a
/// narrow screen, not a Mac's to a wide one.
///
/// Every screen that has one uses this, so Bills, Cards and Payoff read as the
/// same app rather than three takes on the same idea.
struct MacSummaryStrip<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            content
        }
        // First baseline, because the parts are words and figures of different
        // sizes: a $4,120.00 next to its label has to sit on the same line of
        // type, not in the same box.
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Theme.surface)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Theme.border).frame(height: 1)
        }
    }
}

/// One labelled figure inside a `MacSummaryStrip`: "STATEMENT $4,120.00".
///
/// The label is the strip's small caps and the amount is the figures' mono, so
/// a row of them reads across. The amount never truncates and never wraps —
/// a figure with an ellipsis in it is worse than no figure — which leaves the
/// label as the part that gives way when the window is dragged narrow.
///
/// `help` is where the sentence a phone prints under the number goes on a Mac:
/// hovering the figure that raises the question answers it, without spending a
/// line of the window on prose nobody asked for yet.
struct MacStripFigure: View {
    let label: String
    let value: String
    var tint: Color = Theme.text
    var help: String?

    var body: some View {
        // Only the figures with something to say get a tooltip: an empty
        // `.help` still installs one on some versions, which then flashes a
        // blank box for every figure the mouse crosses.
        if let help {
            pair.help(help)
        } else {
            pair
        }
    }

    private var pair: some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            Text(label.uppercased())
                .font(Theme.ui(10, weight: .bold))
                .tracking(0.6)
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
            Text(value)
                .font(Theme.mono(13, weight: .semibold))
                .foregroundStyle(tint)
                .monospacedDigit()
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
        }
    }
}
#endif
