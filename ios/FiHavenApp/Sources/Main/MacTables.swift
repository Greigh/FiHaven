#if os(macOS)
import SwiftUI
import Foundation
import FiHavenCore
import AppKit

/// Sorts the models don't carry themselves.
///
/// A `TableColumn` sorts by a `KeyPath` on the row value, so every sortable
/// column needs a stored or computed property that is `Comparable`. Where the
/// model only has the raw material for that — a day-of-month, a `Bool` — these
/// fill in, so each column sorts the way its header promises instead of
/// falling back to the model's declaration order.
///
/// **These are the cheap case, and a `…SortKey` extension is what to reach for
/// first.** They read only the row. A column whose order needs context the row
/// does not carry — a timezone, another plan's figures, a suggestion computed
/// from a target date — cannot be an extension, because a `KeyPath` has no
/// arguments to pass it; those carry the value on a row wrapper instead, the way
/// `MacPayoffRow` and `MacGoalRow` do. Both spell the value as a `…SortKey` or a
/// `…Order` that is `Comparable` and sorts the absent case last, and both are
/// only ever read by the column whose header promises them.
extension Bill {
    /// The Due column. `dueDay` is the only due information the model carries
    /// without a timezone; a bill with no day sorts last, which is where the
    /// "No due date" rows belong.
    var dueSortKey: Int { dueDay ?? 99 }

    /// `Bool` is not `Comparable`, so the Autopay column needs a number. Set
    /// rows lead, because "which of these run themselves?" is why you sort it.
    var autopaySortKey: Int { autopay ? 0 : 1 }

    /// The Paid-to column's sort value. A missing business is an empty string,
    /// not a name, so it sorts with the rest of the blanks rather than first.
    var businessSortKey: String { business ?? "" }
}

extension Card {
    /// The Due column — same rule as `Bill.dueSortKey`.
    var dueSortKey: Int { dueDay ?? 99 }

    /// The Issuer column's sort value — see `Bill.businessSortKey`.
    var issuerSortKey: String { issuer ?? "" }

    /// The Min column's sort value. A column can't sort on an optional key
    /// path, and a minimum that was never filled in reads as nothing due, so
    /// the blank rows sort as zero.
    var minPaymentSortKey: Double { minPayment ?? 0 }

    /// The Utilization column, as a fraction of the limit.
    var utilizationSortKey: Double { utilization ?? 0 }

    /// `Schedule.utilization` is `Double?`; this is the same figure with the
    /// no-limit case (a loan) read as zero.
    var utilization: Double? { Schedule.utilization(self) }
}

extension SpendTransaction {
    /// The row's own name — the merchant, or the category when there isn't one
    /// — as both the cell and its sort read it, so the two cannot disagree.
    var titleSortKey: String { merchant.isEmpty ? category : merchant }

    /// The Source column, sorted by the words it shows rather than by the
    /// `plaid`/`manual` slugs behind them: the column reads "Bank · pending",
    /// so that is what its order has to follow.
    var sourceSortKey: String {
        guard isBank else { return "Manual" }
        return pending ? "Bank · pending" : "Bank"
    }
}

extension Payment {
    /// The Amount column. A skip is not money out, so it sorts with the zeroes
    /// rather than by the amount it never had — and `Bool` is not `Comparable`,
    /// so the flag itself cannot be the key.
    var amountSortKey: Double { skipped ? 0 : amount }

    /// The Kind column: the two nouns the phone's row badges, plus the skip.
    /// "Bill" leads, which is where the log's bulk is.
    var kindSortKey: String { skipped ? "Skip" : (type == "card" ? "Card" : "Bill") }

    /// The row's own name when it has one — a payment recorded without a name
    /// still has to be titled something.
    var titleSortKey: String { name.isEmpty ? type.capitalized : name }

    /// "YYYY-MM" sorts chronologically as text, which is the whole reason the
    /// model carries it.
    var monthSortKey: String { monthKey }
}

extension Account {
    /// The Kind column, which shows the same word the phone's account row does
    /// (`NetWorthView.types`) — see `NetWorthView.kindLabel`.
    var kindLabel: String { NetWorthView.kindLabel(type) }
    var kindIcon: String { NetWorthView.kindIcon(type) }
}

extension IncomeSource {
    /// The "Every" column, reading the phone's own frequency vocabulary so the
    /// two platforms cannot word the same cadence differently.
    func frequencyLabel() -> String {
        Income.frequencies.first { $0.key == frequency }?.label ?? frequency.capitalized
    }

    /// "37.5", not "37.50000001" — a weekly hours figure is a number a person
    /// typed, and a table column is no place to show its float error.
    func trimmedHours() -> String {
        let rounded = (hoursPerWeek * 10).rounded() / 10
        return (rounded == rounded.rounded() ? String(Int(rounded)) : String(rounded))
    }
}

extension SubscriptionsFinder.Item {
    /// The Kind column. A number, not the word, so the tracked rows — the ones
    /// actually being paid for — sort first and the suggestions follow.
    var kindSortKey: Int { source == "bill" ? 0 : 1 }
    var kindLabel: String { source == "bill" ? "Tracked" : "Suggested" }
}

// MARK: - The rows, as the menu bar and the keyboard see them

/// The primary verb a table's rows offer, and the words for it.
///
/// Space and the first item of the menu act on the selection through this, so
/// the words live here rather than in the menu: that is what lets one menu-bar
/// item read "Mark 3 Bills Paid" on one screen and "Keep 2 Transactions" on
/// another. A table with no such verb simply has none — nothing marks an
/// account as done, and a table of payments has nothing to take back.
struct RowVerb {
    /// "Mark" / "Unmark" — or "Keep" / "Discard", "Accept" / "Decline".
    let onWord: String
    let offWord: String
    /// What follows the noun: " Paid" for a bill, so the item reads "Mark 3
    /// Bills Paid"; empty where the verb already says all of it ("Keep 2
    /// Transactions").
    let suffix: String
    /// Whether a row already reads as done — which way the verb goes.
    let isOn: (String) -> Bool
    let set: (String, Bool) -> Void

    init(
        onWord: String,
        offWord: String,
        suffix: String = "",
        isOn: @escaping (String) -> Bool,
        set: @escaping (String, Bool) -> Void
    ) {
        self.onWord = onWord
        self.offWord = offWord
        self.suffix = suffix
        self.isOn = isOn
        self.set = set
    }
}

/// What a table's rows can do, in the terms both the menu bar and the keyboard
/// need.
///
/// The tables differ in their columns, in their nouns and in which verbs they
/// have at all — a table of loans is not a table of cards, and a table of
/// accounts has neither of the verbs the other two do — but not in how a key
/// reaches a row: space runs the primary verb, ⌫ or ⌘⌫ runs the destructive
/// one, ⌘N adds another. Each table describes itself here and shares the
/// handling below it.
struct RowActions {
    /// The rows on screen, in the order the table is showing them. The arrow
    /// keys walk this, so ↓ always moves down the visible list — whatever
    /// column header happens to be sorting it.
    let ids: [String]
    /// The row's noun, singular and plural: "Bill"/"Bills", "Loan"/"Loans".
    /// The menu is shared, so each title has to name its own screen.
    let noun: String
    let plural: String
    /// The menu bar's name for these rows — "Bill", "Account", "Payment".
    /// One menu serves every screen, so its own title has to come from the
    /// table in front rather than being fixed at build time.
    let menuTitle: String
    /// The verb space carries, or nil where the screen has no such verb.
    let verb: RowVerb?
    /// The destructive verb ⌫ and ⌘⌫ carry, or nil where the screen has no
    /// such verb. Nil does not mean "no way to delete": on the phone a
    /// spending row deliberately has no ✕ beside its pencil, because a one-tap
    /// mis-hit there is a lost transaction — but a table's ⌫, its context menu
    /// and the menu bar's own item are all deliberate, so the Mac gets the verb
    /// the phone's editor keeps. What nil means is a screen with nothing to
    /// remove at all: the accounts table, whose list is built on Balances.
    let remove: ((String) -> Void)?
    /// Whether removing hides a row or deletes it, per the user's setting. It
    /// picks the menu's verb as well as the action.
    let archives: Bool

    /// The rows' verb states, in order.
    ///
    /// The menu's own words depend on this as well as on the rows and the
    /// selection: space marks a row done without changing either, and a verb
    /// that still reads "Mark Bill Paid" after the bill is paid is the one
    /// thing here a user would notice. Cheap to build and to compare, which is
    /// all it has to be to be watched.
    var verbSignature: [Bool] {
        guard let verb else { return [] }
        return ids.map(verb.isOn)
    }
}

extension RowActions {
    /// The verbs as the menu bar reads them.
    ///
    /// The titles are settled here rather than in the menu so they can follow
    /// the selection — "Mark 3 Bills Paid", "Unmark Bill" — and so they name
    /// the noun of the screen the selection is on. A verb the table does not
    /// have comes back nil, which is what takes its item out of the menu rather
    /// than leaving a permanently greyed line on a screen where it means
    /// nothing.
    func commands(selection: Set<String>, addTitle: String?, add: @escaping () -> Void) -> RowCommands {
        let chosen = ids.filter(selection.contains)
        let count = chosen.count
        // A selection that is already done offers the way back rather than
        // doing it twice, and space follows whatever the menu says.
        let allOn = verb.map { !chosen.isEmpty && chosen.allSatisfy($0.isOn) } ?? false

        let markTitle = verb.map { verb in
            allOn
                ? (count == 1 ? "\(verb.offWord) \(noun)" : "\(verb.offWord) \(count) \(plural)")
                : (count == 1 ? "\(verb.onWord) \(noun)\(verb.suffix)" : "\(verb.onWord) \(count) \(plural)\(verb.suffix)")
        }
        let deleteTitle = remove == nil
            ? nil
            : (count == 1
                ? (archives ? "Archive \(noun)" : "Delete \(noun)")
                : (archives ? "Archive \(count) \(plural)" : "Delete \(count) \(plural)"))

        return RowCommands(
            menuTitle: menuTitle,
            addTitle: addTitle,
            add: add,
            markTitle: markTitle,
            canMark: markTitle != nil && count > 0,
            mark: { if let verb { for id in chosen { verb.set(id, !allOn) } } },
            deleteTitle: deleteTitle,
            canDelete: deleteTitle != nil && count > 0,
            delete: { if let remove { for id in chosen { remove(id) } } }
        )
    }
}

// MARK: - The keys a menu cannot carry

/// The table's own keys: space, the arrows and ⌫.
///
/// They cannot be menu items. AppKit matches a menu's key equivalent before the
/// responder chain runs, so a plain space in a menu would be taken from every
/// text field in the app — the search field first of all. They are read from
/// the window's own event stream here instead, and only while a table is on
/// screen: this modifier is attached to the table, so its monitor is up for
/// exactly as long as there are rows it could act on.
///
/// With the table focused the arrows are left to it. A `Table` is AppKit's own
/// `NSTableView` underneath, which already moves the selection, extends it with
/// ⇧ and selects all with ⌘A; doing that here as well would move it twice. What
/// this adds is everything around that — arriving on a screen with nothing
/// focused, when the arrows would otherwise do nothing at all — and the two
/// keys the table has no opinion about: space to mark paid, ⌫ to delete.
/// Internal rather than private only so a debug run can report
/// `TableKeyboard.KeyOwner` — which of its three answers applies is the whole
/// of the feature's safety story.
struct TableKeyboard: ViewModifier {
    let actions: RowActions
    @Binding var selection: Set<String>
    /// The add verb's noun and action, so the menu bar's items can be built
    /// here — where the selection and the row order are — rather than in the
    /// menu, which is shared by every screen. Nil where the screen has nothing
    /// to add: a rollup of accounts is filled in on Balances, and a log of
    /// payments records things that already happened.
    let addTitle: String?
    let add: () -> Void
    /// Where the built verbs go. See `TableCommands`.
    let tables: TableCommands

    /// The render's own values, kept in a box.
    ///
    /// The monitor is installed once, on the first appear, and a closure that
    /// captured `self` would hold the row list from that moment — which is the
    /// empty one, because a table appears before its rows arrive. The box is
    /// what lets a key press read the table as it is now. (`selection` and the
    /// two cursor fields need no box: they are property wrappers, so a copy of
    /// them still forwards to the one shared storage.)
    private final class Live {
        var actions: RowActions?
        var addTitle: String?
        var add: () -> Void = {}
    }

    /// Where the last step left the cursor, and the end ⇧ drags. Two, not one:
    /// ⇧↓ and then ⇧↑ has to take a row back, which it can only do while it
    /// still knows which end is the fixed one.
    @State private var drop: String?
    @State private var anchor: String?
    @State private var monitor: Any?
    /// This table's own name on the command channel, so it can retract its
    /// verbs without retracting those of whoever replaced it.
    @State private var token = UUID()
    @State private var live = Live()

    func body(content: Content) -> some View {
        // A plain assignment to a box this view owns: no SwiftUI state changes
        // here, only the values the keys below should read from now on.
        live.actions = actions
        live.addTitle = addTitle
        live.add = add
        return content
            .onAppear { install(); post() }
            .onDisappear { uninstall(); tables.retract(token) }
            .onChange(of: actions.ids) { _, ids in reflow(ids); post() }
            // The selection is part of the menu's own words — "Mark 3 Bills
            // Paid" — so a click or an arrow key has to republish them.
            .onChange(of: selection) { _, _ in post() }
            // And so is what the rows already are: space marks a bill paid
            // without touching the list or the selection. (An empty signature
            // is a table with no such verb, which never changes.)
            .onChange(of: actions.verbSignature) { _, _ in post() }
    }

    /// Hands the menu bar the verbs as they stand. The selection is included,
    /// so ⌘⌫ knows what it is about to remove before the menu is ever opened.
    private func post() {
        guard let actions = live.actions else { return }
        tables.publish(
            actions.commands(selection: selection, addTitle: live.addTitle, add: live.add),
            for: token
        )
    }

    // MARK: Lifecycle

    /// A local monitor sees every key the app is handed, which is the point of
    /// it — and the reason `handle` is so careful about who else wanted them.
    @MainActor
    private func install() {
        guard monitor == nil else { return }
        monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
            handle(event) ? nil : event
        }
        if selection.isEmpty, let first = live.actions?.ids.first { selection = [first] }
        #if DEBUG
        // A scripted run cannot always make itself the frontmost app — someone
        // else may be using the machine — so the hook goes straight to the
        // decision, with the event's own window standing in for the key window.
        tables.setDebugHandle({ event in
            guard let window = event.window else { return false }
            return self.decide(event, in: window)
        }, for: token)
        #endif
    }

    @MainActor
    private func uninstall() {
        if let monitor { NSEvent.removeMonitor(monitor) }
        monitor = nil
        #if DEBUG
        tables.setDebugHandle(nil, for: token)
        #endif
    }

    /// Keeps the selection over rows that are still there.
    ///
    /// A filter typed, a header clicked, a row deleted: the rows can be
    /// re-ordered or cut short under the selection, and an id that is no longer
    /// on screen would leave ⌘⌫ pointing at nothing. An empty selection with
    /// rows to choose from takes the first one, so the keys are live as soon as
    /// the screen has something to show rather than after a click.
    private func reflow(_ ids: [String]) {
        let live = Set(ids)
        if !selection.isSubset(of: live) { selection = selection.intersection(live) }
        if let drop, !live.contains(drop) { self.drop = nil }
        if let anchor, !live.contains(anchor) { self.anchor = nil }
        if selection.isEmpty, let first = ids.first { selection = [first] }
    }

    // MARK: Keys

    /// `true` when the key was the table's and has been dealt with, so the
    /// event is swallowed; `false` hands it on to whoever else wanted it.
    @MainActor
    private func handle(_ event: NSEvent) -> Bool {
        // A key is the table's only if the window it was sent to is the key
        // window: a sheet — the editor, the filter list — is a window of its
        // own, and a key pressed there is not meant for the table behind it.
        guard let window = NSApp.keyWindow, event.window === window else { return false }
        return decide(event, in: window)
    }

    /// What the table does with a key that reached its window.
    @MainActor
    private func decide(_ event: NSEvent, in window: NSWindow) -> Bool {
        guard let actions = live.actions, !actions.ids.isEmpty else { return false }

        // Arrow keys arrive carrying `.function` and `.numericPad`, so only the
        // four modifiers a user can actually mean are looked at.
        let flags = event.modifierFlags.intersection([.shift, .command, .control, .option])

        switch KeyOwner.of(window) {
        // A text field mid-typing, a focused button, the sidebar's own list:
        // all of them had these keys first.
        case .elsewhere:
            return false

        // The table's own AppKit view already does the arrows, ⇧ and ⌘A — and
        // does them better than this could, scrolling the selection into view
        // as it goes. Only the keys it has no opinion about are answered here.
        case .table:
            switch (event.keyCode, flags) {
            case (Key.space, []): return mark(actions)
            case (Key.delete, []): return remove(actions)
            default: return false
            }

        // Nothing has the keyboard: the screen just appeared, or something was
        // clicked that does not take focus. The arrows still have to work.
        case .nothing:
            if flags == .command, event.charactersIgnoringModifiers?.lowercased() == "a" {
                selection = Set(actions.ids)
                return true
            }
            switch (event.keyCode, flags) {
            case (Key.space, []): return mark(actions)
            case (Key.delete, []): return remove(actions)
            case (Key.down, []): return step(actions, 1, extend: false)
            case (Key.up, []): return step(actions, -1, extend: false)
            case (Key.down, .shift): return step(actions, 1, extend: true)
            case (Key.up, .shift): return step(actions, -1, extend: true)
            default: return false
            }
        }
    }

    /// An arrow key, as a step through the rows the table is showing.
    private func step(_ actions: RowActions, _ delta: Int, extend: Bool) -> Bool {
        let ids = actions.ids
        guard !ids.isEmpty else { return false }

        // Where the last step left the cursor. Without one — a fresh screen, or
        // a click the monitor never saw — the selection says where to start,
        // and an empty selection starts at the end the arrow is heading away
        // from, so the first press lands on a row either way.
        let chosen = selection.compactMap { ids.firstIndex(of: $0) }
        let start: Int
        if let drop, let index = ids.firstIndex(of: drop) {
            start = index
        } else if let top = chosen.min(), let bottom = chosen.max() {
            start = delta > 0 ? bottom : top
        } else {
            start = delta > 0 ? -1 : ids.count
        }

        let next = min(max(start + delta, 0), ids.count - 1)
        let id = ids[next]
        if extend {
            // ⇧ drags from an earlier ⇧ step's anchor, or from the far edge of
            // the current selection, so it grows what is already chosen rather
            // than replacing it.
            let from: Int
            if let anchor, let index = ids.firstIndex(of: anchor) {
                from = index
            } else if delta > 0 {
                from = chosen.min() ?? min(max(start, 0), ids.count - 1)
            } else {
                from = chosen.max() ?? min(max(start, 0), ids.count - 1)
            }
            selection = Set(ids[min(from, next)...max(from, next)])
            anchor = ids[from]
        } else {
            selection = [id]
            anchor = id
        }
        drop = id
        return true
    }

    /// Space: mark the selection paid, or take it back when it already is.
    ///
    /// `false` with nothing selected — the key would have to guess which row it
    /// meant, and marking the wrong bill paid is not a guess worth making. The
    /// menu item is disabled in exactly that state.
    private func mark(_ actions: RowActions) -> Bool {
        guard let verb = actions.verb else { return false }
        let chosen = actions.ids.filter(selection.contains)
        guard !chosen.isEmpty else { return false }
        let on = !chosen.allSatisfy(verb.isOn)
        for id in chosen { verb.set(id, on) }
        return true
    }

    /// ⌫ and ⌘⌫. No confirmation, the way Mail and Finder do it, and the
    /// user's archive-instead-of-delete setting still decides what it means.
    private func remove(_ actions: RowActions) -> Bool {
        guard let remove = actions.remove else { return false }
        let chosen = actions.ids.filter(selection.contains)
        guard !chosen.isEmpty else { return false }
        for id in chosen { remove(id) }
        return true
    }

    /// The key codes the table reads, by position rather than by character: a
    /// key's characters depend on the layout in use, and these four do not.
    private enum Key {
        static let space: UInt16 = 49
        /// The ⌫ key. ⌘⌫ arrives through the menu bar, not through this.
        static let delete: UInt16 = 51
        static let down: UInt16 = 125
        static let up: UInt16 = 126
    }

    /// Who wants the keys a table also wants.
    ///
    /// Not a private detail of this modifier: a scripted run reports it as
    /// `[Keys] owner=…`, and which of the three applies is the whole of the
    /// feature's safety story.
    enum KeyOwner: CustomStringConvertible {
        /// The table itself, as AppKit's `NSTableView`.
        case table
        /// Nothing in the window has claimed them.
        case nothing
        /// Something with its own use for them: a text field, a focused
        /// control, or the sidebar's list.
        case elsewhere

        var description: String {
            switch self {
            case .table: return "table"
            case .nothing: return "nothing"
            case .elsewhere: return "elsewhere"
            }
        }

        @MainActor
        static func of(_ window: NSWindow) -> KeyOwner {
            guard let responder = window.firstResponder else { return .nothing }
            // The sidebar has to be named before the table, and it cannot be
            // named by its class: its list is an `NSOutlineView`, and so — as
            // it turns out — is SwiftUI's own `Table` on the Mac. Where a view
            // lives is what tells them apart. ↑ in the sidebar belongs to the
            // screen list, not to the rows beside it.
            if let view = responder as? NSView, isSidebar(view) { return .elsewhere }
            // The field editor a focused text field has to type into.
            if responder is NSTextView { return .elsewhere }
            // The table's own view, before the controls below: a table *is* an
            // `NSControl`, so asking about controls first would answer for the
            // table and leave the arrows to AppKit nowhere to belong.
            if responder is NSTableView { return .table }
            // Buttons, sliders, pop-up menus, segmented and search controls.
            if responder is NSControl { return .elsewhere }
            // The window, its content view, or a SwiftUI host view: nothing has
            // taken the keyboard, so it is the table's to use.
            return .nothing
        }

        /// Whether a view sits inside the sidebar column.
        ///
        /// Tested by the marker the shell already uses to find that column
        /// (`FiHavenApp.sidebarView(in:)`): its content is the screen list,
        /// whose host type is generic over `MacScreen`. There is no AppKit
        /// class to ask instead — the sidebar's list and a `Table` are the same
        /// kind of view — so this is what is left.
        @MainActor
        private static func isSidebar(_ view: NSView) -> Bool {
            var node: NSView? = view
            while let current = node {
                if String(describing: type(of: current)).contains("MacScreen") { return true }
                node = current.superview
            }
            return false
        }
    }
}

/// The columns every table's date cell formats through.
///
/// A table row is one line tall, so a date is written as the shortest form
/// that is still unambiguous: "Sep 29", with the year only when it is not this
/// one. Formatted by Foundation rather than a hand-rolled pattern, so it
/// follows the locale the way the rest of the window does.
enum MacTableDate {
    static func short(_ iso: String, tz: TimeZone) -> String {
        guard let date = DateLogic.parseDate(iso, tz: tz) else { return iso }
        let f = DateFormatter()
        f.calendar = DateLogic.calendar(tz: tz)
        f.timeZone = tz
        f.locale = .autoupdatingCurrent
        f.setLocalizedDateFormatFromTemplate(
            Calendar.current.component(.year, from: date) == Calendar.current.component(.year, from: Date())
                ? "MMMd" : "yMMMd"
        )
        return f.string(from: date)
    }

    /// A `Date` written the same way, for the model fields that are already
    /// parsed — a subscription's next due date, say.
    static func short(_ date: Date, tz: TimeZone) -> String {
        let f = DateFormatter()
        f.calendar = DateLogic.calendar(tz: tz)
        f.timeZone = tz
        f.locale = .autoupdatingCurrent
        f.setLocalizedDateFormatFromTemplate(
            Calendar.current.component(.year, from: date) == Calendar.current.component(.year, from: Date())
                ? "MMMd" : "yMMMd"
        )
        return f.string(from: date)
    }
}

/// The height a table needs to show all of its rows without scrolling inside
/// itself.
///
/// The screens whose table cannot be the whole window — Spending, History and
/// Rewards all keep a panel or a chart above it — put theirs inside the page's
/// own scroll view, and a `Table` in a scroll view has no height of its own:
/// without one it collapses to nothing, and a fixed one that is too short buys
/// the user a second scrollbar to find. So the height is the row count, priced
/// from the metric a Mac table actually uses.
func macTableHeight(rows: Int, rowHeight: CGFloat = 24, header: CGFloat = 26) -> CGFloat {
    CGFloat(max(rows, 1)) * rowHeight + header
}

/// How much table a Mac table has room for.
///
/// A `Table` does not compress its way out of a narrow window: it lays out at
/// the widths its columns ask for and lets the last ones run off the edge, so
/// the whole right of the screen — on Bills the Amount column, on Spending the
/// figure — simply was not there. That was invisible until the screenshot
/// harness told the truth about the size it had been given (see `FH_WINDOW` in
/// [`ios/README.md`]): a `640x520` window was being photographed as
/// `640x883`, so every review of a narrow window was a review of a wide one.
///
/// So a table reads its pane and drops columns by rank instead of clipping
/// them. Each table works out its own three widths from its own `ideal:`
/// column widths — a table with two columns has no use for the same numbers as
/// one with eight, and a shared threshold dropped the wrong column on the
/// wrong screen. The tiers mean the same thing everywhere: `wide` is every
/// column at the width it asked for, `medium` is without the supporting
/// columns (autopay, notes, the source), `narrow` is the identifying column and
/// its figures.
enum MacTableWidth {
    /// Every column, at the widths the columns asked for.
    case wide
    /// The supporting columns go: autopay, notes, the source, the minimum
    /// payment. What the row is, when it is due and what it costs stay.
    case medium
    /// The identifying column and its figures — the phone's list, in a table.
    case narrow

    /// The three widths a table needs, given as the sum of the `ideal:` widths
    /// of the columns each tier shows. Read once, in the table that owns them,
    /// so a number is always next to the columns that justify it.
    static func fit(_ pane: CGFloat, wide: CGFloat, medium: CGFloat) -> MacTableWidth {
        let tier: MacTableWidth = pane >= wide ? .wide : (pane >= medium ? .medium : .narrow)
        #if DEBUG
        // A table in a scroll view is offered an unbounded width, so a tier
        // chosen from a width nobody can see is how the Amount column ends up
        // off the edge of a 640pt window. Say what was measured.
        fhLog("[Table] pane \(Int(pane))pt → \(String(describing: tier)) (wide ≥\(Int(wide)), medium ≥\(Int(medium)))")
        #endif
        return tier
    }
}

/// The Bills screen as a real table.
///
/// The phone's list is a column of cards, which is the right shape for five
/// rows on a screen. A Mac window shows all twelve bills at once and has the
/// width for columns, so the same facts come apart into one line each: click a
/// header to sort, click to select, ⌘-click to extend, right-click for the
/// actions and double-click to edit. What the phone stacks into a status
/// sentence ("Due in 3 days · Oct 1") is here a date plus the row's state
/// colour, because a table row is one line tall.
struct MacBillsTable: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var tables: TableCommands
    let bills: [Bill]
    @Binding var selection: Set<String>
    @Binding var sortOrder: [KeyPathComparator<Bill>]
    let onAdd: () -> Void
    /// "New Bill" — the noun belongs to the screen, and the menu that shows it
    /// is shared.
    let addTitle: String
    let onPay: (Bill) -> Void
    let onEdit: (Bill) -> Void
    let onSetPaid: (Bill, Bool) -> Void
    let onSkip: (Bill) -> Void
    let onUnskip: (Bill) -> Void
    let onArchive: (Bill) -> Void
    let onDelete: (Bill) -> Void

    /// `useArchive` decides whether the destructive action hides a bill or
    /// removes it, exactly as the swipe action does on the phone.
    private var destructiveLabel: String { store.data.settings.archiveInsteadOfDelete ? "Archive" : "Delete" }

    /// The pane's width decides the columns, so the reader wraps the table in a
    /// `GeometryReader` and hands the result down; the rest of the screen — the
    /// summary header, the search field — is width-agnostic and untouched.
    ///
    /// The two numbers are this table's own columns added up with room to
    /// spare: 24 + 230 + 170 + 110 + 110 + 110 + 70 = 824 for all seven, and
    /// 754 without Autopay. The spare is not decoration — a column whose cell
    /// fills its width (`Amount` does) lays out wider than the `ideal:` it
    /// declares, so a threshold set exactly at the sum still clips the last
    /// column. Fifteen per cent is what that measured out at; a shared
    /// threshold got this wrong too, at 860pt, which is the bug the tier was
    /// added to fix.
    var body: some View {
        GeometryReader { pane in
            table(MacTableWidth.fit(pane.size.width, wide: 950, medium: 870))
        }
    }

    private func table(_ width: MacTableWidth) -> some View {
        Table(bills, selection: $selection, sortOrder: $sortOrder) {
            // An unsortable leading column: the state is a mark, not a value
            // anyone sorts a table by.
            TableColumn("") { bill in
                Image(systemName: A11y.paidStateIcon(store.paidState(type: "bill", refId: bill.id)))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(stateColor(bill))
                    .accessibilityLabel(stateLabel(bill))
            }
            .width(min: 22, ideal: 24, max: 28)

            TableColumn("Bill", value: \.name) { bill in
                HStack(spacing: 7) {
                    IconMark(
                        icon: CTConstants.iconInfo(forCategory: bill.category,
                                                   overrides: store.data.settings.categoryIcons),
                        size: 14,
                        fallbackEmoji: CTConstants.categoryIcons[bill.category] ?? "📌"
                    )
                    .accessibilityHidden(true)
                    Text(bill.name).lineLimit(1)
                }
            }
            .width(min: 150, ideal: 230)

            // Ranked by what a bill *is*: the name, the date and the figure are
            // the row, and who it is paid to and what it is for are the two
            // columns a narrow window can do without.
            if width != .narrow {
                TableColumn("Paid to", value: \.businessSortKey) { bill in
                    Text(bill.businessSortKey.isEmpty ? "—" : bill.businessSortKey)
                        .foregroundStyle(bill.businessSortKey.isEmpty ? Theme.muted : Theme.text)
                        .lineLimit(1)
                }
                .width(min: 90, ideal: 170)

                TableColumn("Category", value: \.category) { bill in
                    Text(bill.category).foregroundStyle(Theme.muted).lineLimit(1)
                }
                .width(min: 70, ideal: 110)
            }

            TableColumn("Due", value: \.dueSortKey) { bill in
                Text(dueText(bill))
                    .foregroundStyle(dueColor(bill))
                    .lineLimit(1)
            }
            .width(min: 80, ideal: 110)

            TableColumn("Amount", value: \.amountOrZero) { bill in
                Text(Money.fmt(bill.amountOrZero))
                    .font(Theme.mono(13, weight: .semibold))
                    .monospacedDigit()
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .width(min: 84, ideal: 110)

            // The first to go: a tick the row already carries elsewhere (the
            // row's colour, and the row menu's Mark/Unmark) and the least
            // missed when the window is narrow.
            if width == .wide {
                TableColumn("Autopay", value: \.autopaySortKey) { bill in
                    Image(systemName: bill.autopay ? "checkmark.circle.fill" : "minus")
                        .font(.system(size: 12))
                        .foregroundStyle(bill.autopay ? Theme.green : Theme.muted)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .accessibilityLabel(bill.autopay ? "Autopay on" : "Autopay off")
                }
                .width(min: 54, ideal: 70)
            }
        }
        .alternatingRowBackgrounds()
        // The selection is the target, not the clicked row: `ids` is every
        // selected bill, so one right-click marks a dozen paid.
        .contextMenu(forSelectionType: String.self) { ids in
            menu(for: ids)
        } primaryAction: { ids in
            if let bill = single(ids) { onEdit(bill) }
        }
        .overlay {
            if bills.isEmpty {
                ContentUnavailableView(
                    store.loaded ? "No bills match" : "Loading…",
                    systemImage: "doc.text",
                    description: Text(store.loaded
                        ? "Adjust the search or the filters, or add a bill with ⌘N."
                        : "Fetching your bills.")
                )
            }
        }
        // The bare keys — space, ⌫, the arrows — stay with the table, since a
        // menu would take them from the rest of the window. The ⌘ keys go up
        // as focused values instead, because AppKit matches a menu's key
        // equivalent before the responder chain sees the event: ⌘⌫ and ⌘N then
        // work whichever view holds focus, the search field included.
        .modifier(TableKeyboard(actions: rowActions, selection: $selection,
                                addTitle: addTitle, add: onAdd, tables: tables))
    }

    /// What the keyboard and the menu bar can do, in the one shape both read.
    ///
    /// The ids come from the rows on screen — filtered and sorted — so ↓ walks
    /// the list as it is displayed rather than in the model's own order, and
    /// the menu's counts match what the user is looking at.
    private var rowActions: RowActions {
        RowActions(
            ids: bills.map(\.id),
            noun: "Bill",
            plural: "Bills",
            menuTitle: "Bill",
            verb: RowVerb(
                onWord: "Mark",
                offWord: "Unmark",
                suffix: " Paid",
                isOn: { store.paidState(type: "bill", refId: $0) == .full },
                set: { id, paid in
                    guard let bill = bills.first(where: { $0.id == id }) else { return }
                    onSetPaid(bill, paid)
                }
            ),
            remove: { id in
                guard let bill = bills.first(where: { $0.id == id }) else { return }
                if store.data.settings.archiveInsteadOfDelete { onArchive(bill) } else { onDelete(bill) }
            },
            archives: store.data.settings.archiveInsteadOfDelete
        )
    }

    // MARK: - Cells

    private func stateLabel(_ bill: Bill) -> String {
        if store.isSkipped(type: "bill", refId: bill.id) { return "Skipped" }
        switch store.paidState(type: "bill", refId: bill.id) {
        case .full: return "Paid"
        case .partial: return "Partially paid"
        case .unpaid: return "Unpaid"
        }
    }

    /// The mark's colour, using the same vocabulary as the phone row: green
    /// once a payment has landed, orange once part of one has.
    private func stateColor(_ bill: Bill) -> Color {
        if store.isSkipped(type: "bill", refId: bill.id) { return Theme.muted }
        switch store.paidState(type: "bill", refId: bill.id) {
        case .full: return Theme.green
        case .partial: return Theme.orange
        case .unpaid: return Theme.muted
        }
    }

    /// The next due date, or the reason there isn't one. Formatted by
    /// Foundation rather than a hand-rolled pattern, so it follows the user's
    /// locale the way the rest of the window does.
    private func dueText(_ bill: Bill) -> String {
        if store.paidState(type: "bill", refId: bill.id) == .full { return "Paid this month" }
        if store.isSkipped(type: "bill", refId: bill.id) { return "Skipped this month" }
        if store.needsAmount(type: "bill", refId: bill.id) { return "No amount set" }
        if store.nothingDue(type: "bill", refId: bill.id) { return "Nothing due" }
        guard let next = BillSchedule.nextDueDate(bill, tz: store.tz) else { return "—" }
        return next.formatted(.dateTime.month(.abbreviated).day())
    }

    private func dueColor(_ bill: Bill) -> Color {
        if store.paidState(type: "bill", refId: bill.id) == .full { return Theme.green }
        if store.needsAmount(type: "bill", refId: bill.id) { return Theme.orange }
        let days = BillSchedule.effectiveDaysUntilDue(
            bill,
            whenFullyPaid: false,
            tz: store.tz
        )
        if store.isSkipped(type: "bill", refId: bill.id) { return Theme.muted }
        if days < 0 { return Theme.red }
        if days <= 3 { return Theme.orange }
        return Theme.text
    }

    // MARK: - Actions

    private func single(_ ids: Set<String>) -> Bill? {
        guard ids.count == 1, let id = ids.first else { return nil }
        return bills.first { $0.id == id }
    }

    private func targets(_ ids: Set<String>) -> [Bill] {
        bills.filter { ids.contains($0.id) }
    }

    @ViewBuilder
    private func menu(for ids: Set<String>) -> some View {
        let rows = targets(ids)
        if rows.count == 1, let bill = rows.first {
            Button { onPay(bill) } label: { Label("Record payment", systemImage: "checkmark.circle") }
            Button { onSetPaid(bill, store.paidState(type: "bill", refId: bill.id) != .full) } label: {
                Label(store.paidState(type: "bill", refId: bill.id) == .full ? "Unmark paid" : "Mark paid",
                      systemImage: store.paidState(type: "bill", refId: bill.id) == .full
                          ? "arrow.uturn.backward" : "checkmark.seal")
            }
            Button {
                if store.isSkipped(type: "bill", refId: bill.id) { onUnskip(bill) } else { onSkip(bill) }
            } label: {
                Label(store.isSkipped(type: "bill", refId: bill.id) ? "Un-skip this month" : "Skip this month",
                      systemImage: "forward.end")
            }
            Divider()
            if store.data.settings.archiveInsteadOfDelete {
                Button { onArchive(bill) } label: { Label("Archive", systemImage: "archivebox") }
            } else {
                Button(role: .destructive) { onDelete(bill) } label: { Label("Delete", systemImage: "trash") }
            }
            Button { onEdit(bill) } label: { Label("Edit bill", systemImage: "pencil") }
        } else if !rows.isEmpty {
            // Several rows at once: the actions that mean the same thing for
            // all of them. Paying is deliberately not one of them — a payment
            // is recorded per bill, with its own amount and date.
            Button {
                for bill in rows { onSetPaid(bill, true) }
            } label: {
                Label("Mark \(rows.count) paid", systemImage: "checkmark.seal")
            }
            Button {
                for bill in rows { onSetPaid(bill, false) }
            } label: {
                Label("Unmark \(rows.count)", systemImage: "arrow.uturn.backward")
            }
            Divider()
            Button(role: .destructive) {
                for bill in rows { onDelete(bill) }
            } label: {
                Label("\(destructiveLabel) \(rows.count)", systemImage: "trash")
            }
        }
    }
}

/// The Cards screen as a real table — and the Loans screen with it, since the
/// two are the same view filtered by `type`.
///
/// A card row on the phone stacks a name, an issuer, a utilization bar and a
/// corner of figures, because there is nowhere else to put them. A table has
/// columns: the same figures line up under headers, sort against each other,
/// and the utilization column disappears on the Loans screen where there is no
/// limit to measure against.
struct MacCardsTable: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var tables: TableCommands
    let cards: [Card]
    let isLoanView: Bool
    @Binding var selection: Set<String>
    @Binding var sortOrder: [KeyPathComparator<Card>]
    let onAdd: () -> Void
    /// "New Card" / "New Loan" — the two screens share this table, and the
    /// menu that shows the title is shared with the rest of the window.
    let addTitle: String
    let onPay: (Card) -> Void
    let onEdit: (Card) -> Void
    let onSetPaid: (Card, Bool) -> Void
    let onSkip: (Card) -> Void
    let onUnskip: (Card) -> Void
    let onArchive: (Card) -> Void
    let onDelete: (Card) -> Void

    /// Its own columns added up, with the same fifteen per cent of room:
    /// 24 + 230 + 150 + 120 + 110 + 90 + 150 + 90 = 964 for every column on a
    /// card, and 814 without Utilization (which a loan has no meaning for) — so
    /// the wide threshold is the card's number and a loan table simply stops
    /// dropping columns at a size where the card next door is still dropping
    /// one.
    var body: some View {
        GeometryReader { pane in
            table(MacTableWidth.fit(pane.size.width, wide: 1110, medium: 835))
        }
    }

    private func table(_ width: MacTableWidth) -> some View {
        Table(cards, selection: $selection, sortOrder: $sortOrder) {
            TableColumn("") { card in
                Image(systemName: A11y.paidStateIcon(store.paidState(type: "card", refId: card.id)))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(stateColor(card))
                    .accessibilityLabel(stateLabel(card))
            }
            .width(min: 22, ideal: 24, max: 28)

            TableColumn("Card", value: \.name) { card in
                HStack(spacing: 7) {
                    IconMark(icon: IssuerIcons.iconInfo(for: card), size: 15)
                        .accessibilityHidden(true)
                    Text(card.name).lineLimit(1)
                    if let last = card.lastDigits, !last.isEmpty {
                        Text("•••• \(last)")
                            .font(Theme.mono(10))
                            .foregroundStyle(Theme.muted)
                    }
                }
            }
            .width(min: 150, ideal: 230)

            // The issuer and the minimum payment are what a card *is*; a
            // narrow window keeps them and drops the measures of it instead.
            if width != .narrow {
                TableColumn(isLoanView ? "Lender" : "Issuer", value: \.issuerSortKey) { card in
                    Text(card.issuerSortKey.isEmpty ? "—" : card.issuerSortKey)
                        .foregroundStyle(card.issuerSortKey.isEmpty ? Theme.muted : Theme.text)
                        .lineLimit(1)
                }
                .width(min: 90, ideal: 150)
            }

            TableColumn("Due", value: \.dueSortKey) { card in
                Text(dueText(card)).foregroundStyle(dueColor(card)).lineLimit(1)
            }
            .width(min: 80, ideal: 120)

            TableColumn("Balance", value: \.balance) { card in
                money(card.balance)
            }
            .width(min: 84, ideal: 110)

            if width != .narrow {
                TableColumn("Min", value: \.minPaymentSortKey) { card in
                    money(card.minPayment ?? 0, dim: card.minPayment == nil)
                }
                .width(min: 70, ideal: 90)
            }

            if !isLoanView && width == .wide {
                TableColumn("Utilization", value: \.utilizationSortKey) { card in
                    utilizationCell(card)
                }
                .width(min: 110, ideal: 150)
            }

            TableColumn("APR", value: \.regularAPR) { card in
                HStack(spacing: 4) {
                    if promoIsActive(card) {
                        Text("0%")
                            .font(Theme.mono(12, weight: .medium))
                            .foregroundStyle(Theme.green)
                    }
                    Text(String(format: "%.2f%%", card.regularAPR))
                        .font(Theme.mono(11))
                        .foregroundStyle(Theme.muted)
                }
                .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .width(min: 70, ideal: 90)
        }
        .alternatingRowBackgrounds()
        .contextMenu(forSelectionType: String.self) { ids in
            menu(for: ids)
        } primaryAction: { ids in
            if let card = single(ids) { onEdit(card) }
        }
        .overlay {
            if cards.isEmpty {
                ContentUnavailableView(
                    store.loaded ? (isLoanView ? "No loans match" : "No cards match") : "Loading…",
                    systemImage: "creditcard",
                    description: Text(store.loaded
                        ? "Adjust the search or the filters, or add one with ⌘N."
                        : "Fetching your cards.")
                )
            }
        }
        // The bare keys stay with the table and the ⌘ keys go up to the menu
        // bar — see the same pair on `MacBillsTable`.
        .modifier(TableKeyboard(actions: rowActions, selection: $selection,
                                addTitle: addTitle, add: onAdd, tables: tables))
    }

    /// What the keyboard and the menu bar can do, in the one shape both read.
    /// The nouns follow `isLoanView`: this table draws two screens, and ⌘N has
    /// to say "New Loan" on the one that only holds loans.
    private var rowActions: RowActions {
        RowActions(
            ids: cards.map(\.id),
            noun: isLoanView ? "Loan" : "Card",
            plural: isLoanView ? "Loans" : "Cards",
            menuTitle: isLoanView ? "Loan" : "Card",
            verb: RowVerb(
                onWord: "Mark",
                offWord: "Unmark",
                suffix: " Paid",
                isOn: { store.paidState(type: "card", refId: $0) == .full },
                set: { id, paid in
                    guard let card = cards.first(where: { $0.id == id }) else { return }
                    onSetPaid(card, paid)
                }
            ),
            remove: { id in
                guard let card = cards.first(where: { $0.id == id }) else { return }
                if store.data.settings.archiveInsteadOfDelete { onArchive(card) } else { onDelete(card) }
            },
            archives: store.data.settings.archiveInsteadOfDelete
        )
    }

    /// Archive or delete, per the user's own setting — the same choice the
    /// bills table, the swipe actions and the Transaction menu all make.
    private var destructiveLabel: String {
        store.data.settings.archiveInsteadOfDelete ? "Archive" : "Delete"
    }

    // MARK: - Cells

    private func money(_ amount: Double, dim: Bool = false) -> some View {
        Text(Money.fmt(amount))
            .font(Theme.mono(13, weight: .semibold))
            .foregroundStyle(dim ? Theme.muted : Theme.text)
            .monospacedDigit()
            .frame(maxWidth: .infinity, alignment: .trailing)
    }

    /// Percentage and a hairline bar in one cell: the number is what you sort
    /// and compare, the bar is what makes a table of them scannable.
    private func utilizationCell(_ card: Card) -> some View {
        let used = card.utilizationSortKey
        let high = used > 0.5
        return HStack(spacing: 6) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.surface2)
                    Capsule()
                        .fill(high ? Theme.orange : Theme.accent)
                        .frame(width: max(2, geo.size.width * min(1, used)))
                }
            }
            .frame(width: 46, height: 5)
            Text("\(Int(used * 100))%")
                .font(Theme.mono(11, weight: .medium))
                .foregroundStyle(high ? Theme.orange : Theme.muted)
                .monospacedDigit()
                .frame(width: 34, alignment: .trailing)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Utilization \(Int(used * 100)) percent")
    }

    private func stateLabel(_ card: Card) -> String {
        if store.isSkipped(type: "card", refId: card.id) { return "Skipped" }
        switch store.paidState(type: "card", refId: card.id) {
        case .full: return "Paid"
        case .partial: return "Partially paid"
        case .unpaid: return "Unpaid"
        }
    }

    private func stateColor(_ card: Card) -> Color {
        if store.isSkipped(type: "card", refId: card.id) { return Theme.muted }
        switch store.paidState(type: "card", refId: card.id) {
        case .full: return Theme.green
        case .partial: return Theme.orange
        case .unpaid: return Theme.muted
        }
    }

    /// How long until the payment lands, from the same Core call the phone row
    /// uses. The table shows the countdown rather than the sentence: "in 5 days"
    /// fits a column where "Due Oct 17 · in 5 days" does not.
    private func dueState(_ card: Card) -> (text: String, color: Color) {
        if store.isSkipped(type: "card", refId: card.id) { return ("Skipped", Theme.muted) }
        if store.paidState(type: "card", refId: card.id) == .full { return ("Paid", Theme.green) }
        if store.needsAmount(type: "card", refId: card.id) { return ("No amount set", Theme.orange) }
        guard let day = card.dueDay, day > 0 else { return ("No due day", Theme.muted) }
        let days = DateLogic.effectiveDaysUntilDue(
            dueDay: day,
            whenFullyPaid: false,
            tz: store.tz
        )
        switch days {
        case ..<0: return ("Overdue", Theme.red)
        case 0: return ("Due today", Theme.orange)
        case 1: return ("Tomorrow", Theme.orange)
        case 2...5: return ("In \(days) days", Theme.orange)
        default: return ("In \(days) days", Theme.text)
        }
    }

    private func dueText(_ card: Card) -> String { dueState(card).text }
    private func dueColor(_ card: Card) -> Color { dueState(card).color }

    /// A promo is only worth flagging while it is still running, which is the
    /// same test the phone row makes.
    private func promoIsActive(_ card: Card) -> Bool {
        guard card.hasPromo else { return false }
        return DateLogic.monthsUntil(card.promoEndDate, tz: store.tz) > 0
    }

    // MARK: - Actions

    private func single(_ ids: Set<String>) -> Card? {
        guard ids.count == 1, let id = ids.first else { return nil }
        return cards.first { $0.id == id }
    }

    private func targets(_ ids: Set<String>) -> [Card] {
        cards.filter { ids.contains($0.id) }
    }

    @ViewBuilder
    private func menu(for ids: Set<String>) -> some View {
        let rows = targets(ids)
        if rows.count == 1, let card = rows.first {
            Button { onPay(card) } label: { Label("Record payment", systemImage: "checkmark.circle") }
            Button { onSetPaid(card, store.paidState(type: "card", refId: card.id) != .full) } label: {
                Label(store.paidState(type: "card", refId: card.id) == .full ? "Unmark paid" : "Mark paid",
                      systemImage: store.paidState(type: "card", refId: card.id) == .full
                          ? "arrow.uturn.backward" : "checkmark.seal")
            }
            Button {
                if store.isSkipped(type: "card", refId: card.id) { onUnskip(card) } else { onSkip(card) }
            } label: {
                Label(store.isSkipped(type: "card", refId: card.id) ? "Un-skip this month" : "Skip this month",
                      systemImage: "forward.end")
            }
            Divider()
            if store.data.settings.archiveInsteadOfDelete {
                Button { onArchive(card) } label: { Label("Archive", systemImage: "archivebox") }
            } else {
                Button(role: .destructive) { onDelete(card) } label: { Label("Delete", systemImage: "trash") }
            }
            Button { onEdit(card) } label: { Label("Edit card", systemImage: "pencil") }
        } else if !rows.isEmpty {
            Button {
                for card in rows { onSetPaid(card, true) }
            } label: {
                Label("Mark \(rows.count) paid", systemImage: "checkmark.seal")
            }
            Button {
                for card in rows { onSetPaid(card, false) }
            } label: {
                Label("Unmark \(rows.count)", systemImage: "arrow.uturn.backward")
            }
            Divider()
            Button(role: .destructive) {
                for card in rows { onDelete(card) }
            } label: {
                Label("\(destructiveLabel) \(rows.count)", systemImage: "trash")
            }
        }
    }
}

/// The Spending screen as a real table.
///
/// The phone stacks a merchant, a category and a date under a bank badge, with
/// the editor behind the row and the delete inside the editor. A table gives
/// each of those a column, so the period's spending can be sorted by amount or
/// by category and read down: what the phone puts in a subtitle — whether the
/// row came from the bank, and whether it is still pending — is the Source
/// column here, and the rows with a keep-or-discard decision are the ones that
/// column names.
struct MacSpendingTable: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var tables: TableCommands
    let transactions: [SpendTransaction]
    @Binding var selection: Set<String>
    @Binding var sortOrder: [KeyPathComparator<SpendTransaction>]
    let onAdd: () -> Void
    let addTitle: String
    let onEdit: (SpendTransaction) -> Void

    /// The widest table in the app: 26 + 240 + 120 + 100 + 140 + 180 + 110 =
    /// 916, and 736 without the Note column, both with the same fifteen per
    /// cent of room. It is also the table whose pane measures largest and fits
    /// least: it sits inside the screen's own scroll view, where the width a
    /// `GeometryReader` is offered is the scroll content's rather than the
    /// window's, so its numbers are the furthest from the sum.
    var body: some View {
        GeometryReader { pane in
            table(MacTableWidth.fit(pane.size.width, wide: 1055, medium: 850))
        }
    }

    private func table(_ width: MacTableWidth) -> some View {
        Table(transactions, selection: $selection, sortOrder: $sortOrder) {
            TableColumn("") { tx in
                Text(SpendingView.catIcon(tx.category))
                    .font(.system(size: 13))
                    .frame(maxWidth: .infinity, alignment: .center)
                    .accessibilityLabel(tx.category)
            }
            .width(min: 24, ideal: 26, max: 30)

            TableColumn("Merchant", value: \.titleSortKey) { tx in
                Text(tx.titleSortKey)
                    .foregroundStyle(tx.merchant.isEmpty ? Theme.muted : Theme.text)
                    .lineLimit(1)
            }
            .width(min: 150, ideal: 240)

            if width != .narrow {
                TableColumn("Category", value: \.category) { tx in
                    Text(tx.category).foregroundStyle(Theme.muted).lineLimit(1)
                }
                .width(min: 80, ideal: 120)
            }

            // Date goes at the narrowest: the smallest window a Mac user can
            // drag to leaves 398pt of table, and the merchant and the figure
            // are the two facts a spending row is *for* — the date sorts on its
            // own header while it is there, and the phone's list below the fold
            // still has it.
            if width == .wide || width == .medium {
                TableColumn("Date", value: \.date) { tx in
                    Text(MacTableDate.short(tx.date, tz: store.tz))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
                .width(min: 74, ideal: 100)
            }

            if width != .narrow {
                TableColumn("Source", value: \.sourceSortKey) { tx in
                    sourceCell(tx)
                }
                .width(min: 96, ideal: 140)
            }

            // The first to go, and the one a person can most afford to lose
            // from a glance: it is the only column that is prose.
            if width == .wide {
                TableColumn("Note", value: \.note) { tx in
                    Text(tx.note.isEmpty ? "—" : tx.note)
                        .foregroundStyle(tx.note.isEmpty ? Theme.muted.opacity(0.6) : Theme.muted)
                        .lineLimit(1)
                }
                .width(min: 90, ideal: 180)
            }

            TableColumn("Amount", value: \.amount) { tx in
                amountCell(tx)
            }
            .width(min: 84, ideal: 110)
        }
        .alternatingRowBackgrounds()
        .contextMenu(forSelectionType: String.self) { ids in
            menu(for: ids)
        } primaryAction: { ids in
            if let tx = single(ids) { onEdit(tx) }
        }
        .overlay {
            if transactions.isEmpty {
                ContentUnavailableView(
                    store.loaded ? "No transactions match" : "Loading…",
                    systemImage: "dollarsign.circle",
                    description: Text(store.loaded
                        ? "Adjust the search, or log one with ⌘N."
                        : "Fetching your spending.")
                )
            }
        }
        .modifier(TableKeyboard(actions: rowActions, selection: $selection,
                                addTitle: addTitle, add: onAdd, tables: tables))
    }

    /// What the keyboard and the menu bar can do, in the one shape both read.
    ///
    /// The primary verb is the one decision a spending row can carry: a bank
    /// import that is still pending is either kept or discarded, which is the
    /// same choice the row's own checkmark makes on the phone. `isOn` is true
    /// for a row that is settled, so the verb reads "Keep" until there is
    /// something to keep — and the `set` below only ever touches bank rows, so
    /// a transaction the user typed can never be discarded by a key press.
    private var rowActions: RowActions {
        RowActions(
            ids: transactions.map(\.id),
            noun: "Transaction",
            plural: "Transactions",
            menuTitle: "Transaction",
            verb: RowVerb(
                onWord: "Keep",
                offWord: "Discard",
                isOn: { id in
                    guard let tx = transactions.first(where: { $0.id == id }), tx.isBank else { return false }
                    return !tx.pending
                },
                set: { id, on in
                    guard let tx = transactions.first(where: { $0.id == id }), tx.isBank else { return }
                    if on { store.acceptBankTransaction(tx) } else { store.declineBankTransaction(tx) }
                }
            ),
            remove: { id in
                guard let tx = transactions.first(where: { $0.id == id }) else { return }
                store.deleteTransaction(tx)
            },
            archives: false
        )
    }

    // MARK: - Cells

    /// Where the row came from, in the phone's own words. A pending import is
    /// the only one that still wants an answer, so it is the only one that
    /// says so.
    private func sourceCell(_ tx: SpendTransaction) -> some View {
        HStack(spacing: 5) {
            Image(systemName: tx.isBank ? "building.columns" : "square.and.pencil")
                .font(.system(size: 10))
            Text(tx.sourceSortKey)
        }
        .foregroundStyle(tx.pending ? Theme.accent : Theme.muted)
        .lineLimit(1)
    }

    /// A transfer shows its amount as the muted figure it truly is: it moved
    /// the user's own money, so it is in the list but in none of the totals —
    /// and the tooltip is where a table says why.
    @ViewBuilder
    private func amountCell(_ tx: SpendTransaction) -> some View {
        let amount = Text(Money.fmt(tx.amount))
            .font(Theme.mono(13, weight: .semibold))
            .foregroundStyle(tx.countsAsSpending ? Theme.text : Theme.muted)
            .monospacedDigit()
            .frame(maxWidth: .infinity, alignment: .trailing)
        if tx.countsAsSpending {
            amount
        } else {
            amount.help("A transfer between your own accounts — listed, but not counted as spending")
        }
    }

    // MARK: - Actions

    private func single(_ ids: Set<String>) -> SpendTransaction? {
        guard ids.count == 1, let id = ids.first else { return nil }
        return transactions.first { $0.id == id }
    }

    private func targets(_ ids: Set<String>) -> [SpendTransaction] {
        transactions.filter { ids.contains($0.id) }
    }

    @ViewBuilder
    private func menu(for ids: Set<String>) -> some View {
        let rows = targets(ids)
        if rows.count == 1, let tx = rows.first {
            Button { onEdit(tx) } label: { Label("Edit transaction", systemImage: "pencil") }
            if tx.isBank {
                Divider()
                if tx.pending {
                    Button { store.acceptBankTransaction(tx) } label: {
                        Label("Keep this charge", systemImage: "checkmark.circle")
                    }
                }
                Button(role: .destructive) { store.declineBankTransaction(tx) } label: {
                    Label("Discard from bank", systemImage: "xmark.circle")
                }
                .help("Removes it and hides the charge from future bank syncs")
            }
            Divider()
            Button(role: .destructive) { store.deleteTransaction(tx) } label: {
                Label("Delete transaction", systemImage: "trash")
            }
        } else if !rows.isEmpty {
            let pending = rows.filter { $0.isBank && $0.pending }
            if !pending.isEmpty {
                Button {
                    for tx in pending { store.acceptBankTransaction(tx) }
                } label: {
                    Label("Keep \(pending.count) bank charge\(pending.count == 1 ? "" : "s")", systemImage: "checkmark.circle")
                }
            }
            Divider()
            Button(role: .destructive) {
                for tx in rows { store.deleteTransaction(tx) }
            } label: {
                Label("Delete \(rows.count)", systemImage: "trash")
            }
        }
    }
}

/// The Subscriptions screen as a real table.
///
/// The phone splits this screen in two — the subscriptions being paid for, and
/// a section of suggestions from spending — because a phone has room for one
/// list at a time. A table has a Kind column, so both kinds sit in one list
/// that can be sorted either way, and the answer to "what am I paying for?" is
/// the tracked rows at the top of it. Accepting a suggestion is a decision
/// about that row alone, so it lives in the row's menu rather than on a key;
/// what the keyboard gets is ⌘N, because a subscription the finder missed is
/// still just a bill.
struct MacSubscriptionsTable: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var tables: TableCommands
    let items: [SubscriptionsFinder.Item]
    @Binding var selection: Set<String>
    @Binding var sortOrder: [KeyPathComparator<SubscriptionsFinder.Item>]
    let onAdd: () -> Void
    let addTitle: String
    /// The badge's own words, built by the screen — the tone vocabulary lives
    /// with the rest of the row there, and the table only has to place it.
    let status: (SubscriptionsFinder.Item) -> (icon: String, text: String, tone: A11y.MoneyTone)
    let onEdit: (Bill) -> Void
    let onAccept: (SubscriptionsFinder.Item) -> Void
    let onDecline: (SubscriptionsFinder.Item) -> Void
    let onAddFrom: (SubscriptionsFinder.Item) -> Void
    let onManageLink: (SubscriptionsFinder.Item) -> Void

    var body: some View {
        Table(items, selection: $selection, sortOrder: $sortOrder) {
            TableColumn("") { item in
                Text(SubscriptionIcons.emoji(item.name, category: "Subscriptions"))
                    .font(.system(size: 13))
                    .frame(maxWidth: .infinity, alignment: .center)
                    .accessibilityLabel(item.name)
            }
            .width(min: 24, ideal: 26, max: 30)

            TableColumn("Subscription", value: \.name) { item in
                Text(item.name).lineLimit(1)
            }
            .width(min: 150, ideal: 220)

            TableColumn("Kind", value: \.kindSortKey) { item in
                Text(item.kindLabel)
                    .foregroundStyle(item.source == "bill" ? Theme.text : Theme.accent)
                    .lineLimit(1)
            }
            .width(min: 74, ideal: 100)

            TableColumn("Status") { item in
                let s = status(item)
                SubscriptionStatusBadge(icon: s.icon, text: s.text, tone: s.tone)
                    .lineLimit(1)
            }
            .width(min: 120, ideal: 190)

            TableColumn("Next") { item in
                Text(dueText(item)).foregroundStyle(Theme.muted).lineLimit(1)
            }
            .width(min: 80, ideal: 110)

            TableColumn("Manage") { item in
                if let url = item.manageUrl, let link = URL(string: url) {
                    Link(destination: link) {
                        Label("Open", systemImage: "arrow.up.right.square")
                            .font(Theme.ui(12))
                    }
                    .help(url)
                } else {
                    Text("—").foregroundStyle(Theme.muted.opacity(0.6))
                }
            }
            .width(min: 74, ideal: 90)

            TableColumn("Monthly", value: \.monthly) { item in
                Text("\(Money.fmt(item.monthly))/mo")
                    .font(Theme.mono(13, weight: .semibold))
                    .monospacedDigit()
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .width(min: 84, ideal: 110)
        }
        .alternatingRowBackgrounds()
        .contextMenu(forSelectionType: String.self) { ids in
            menu(for: ids)
        } primaryAction: { ids in
            // Double-click opens the bill behind a tracked row; a suggestion
            // has no bill yet, so it opens the editor that would create one.
            guard ids.count == 1, let id = ids.first,
                  let item = items.first(where: { $0.id == id }) else { return }
            if let bill = bill(for: item) { onEdit(bill) } else { onAddFrom(item) }
        }
        .overlay {
            if items.isEmpty {
                ContentUnavailableView(
                    store.loaded ? "No subscriptions" : "Loading…",
                    systemImage: "arrow.triangle.2.circlepath",
                    description: Text(store.loaded
                        ? "Accept a suggestion, or add one with ⌘N."
                        : "Fetching your subscriptions.")
                )
            }
        }
        // A screen of suggestions and subscriptions has no single verb: the
        // rows do not agree on one, and a key that accepted whatever happened
        // to be selected would be a foot-gun. So the menu bar is told about the
        // rows (⌘N) and nothing else, and Accept/Decline stay on the row menu
        // where each one names what it acts on.
        .modifier(TableKeyboard(actions: rowActions, selection: $selection,
                                addTitle: addTitle, add: onAdd, tables: tables))
    }

    private var rowActions: RowActions {
        RowActions(
            ids: items.map(\.id),
            noun: "Subscription",
            plural: "Subscriptions",
            menuTitle: "Subscription",
            verb: nil,
            remove: nil,
            archives: false
        )
    }

    private func bill(for item: SubscriptionsFinder.Item) -> Bill? {
        guard let id = item.billId else { return nil }
        return store.data.bills.first { $0.id == id }
    }

    /// When the next charge lands for a tracked subscription; for a suggestion
    /// only the last one is known, and saying so is better than implying a
    /// schedule nobody has agreed to yet.
    private func dueText(_ item: SubscriptionsFinder.Item) -> String {
        if let next = item.nextDue { return MacTableDate.short(next, tz: store.tz) }
        if let last = item.lastDate { return "last \(MacTableDate.short(last, tz: store.tz))" }
        return "—"
    }

    private func targets(_ ids: Set<String>) -> [SubscriptionsFinder.Item] {
        items.filter { ids.contains($0.id) }
    }

    @ViewBuilder
    private func menu(for ids: Set<String>) -> some View {
        let rows = targets(ids)
        let suggested = rows.filter { $0.source == "tx" }
        if rows.count == 1, let item = rows.first {
            if item.source == "tx" {
                Button { onAccept(item) } label: { Label("Accept suggestion", systemImage: "checkmark.circle") }
                Button { onAddFrom(item) } label: { Label("Add with details…", systemImage: "square.and.pencil") }
                Divider()
                Button(role: .destructive) { onDecline(item) } label: {
                    Label("Decline — never suggest again", systemImage: "xmark.circle")
                }
            } else {
                if let bill = bill(for: item) {
                    Button { onEdit(bill) } label: { Label("Edit bill", systemImage: "pencil") }
                }
                Button { onManageLink(item) } label: {
                    Label(item.manageUrl == nil ? "Add manage link…" : "Change manage link…",
                          systemImage: "link")
                }
            }
        } else if !rows.isEmpty {
            if !suggested.isEmpty {
                Button {
                    for item in suggested { onAccept(item) }
                } label: {
                    Label("Accept \(suggested.count) suggestion\(suggested.count == 1 ? "" : "s")",
                          systemImage: "checkmark.circle")
                }
                Button(role: .destructive) {
                    for item in suggested { onDecline(item) }
                } label: {
                    Label("Decline \(suggested.count)", systemImage: "xmark.circle")
                }
            } else {
                Button {} label: { Label("\(rows.count) tracked subscriptions", systemImage: "checkmark.circle") }
                    .disabled(true)
            }
        }
    }
}

/// The Net Worth screen as a real table.
///
/// A read-only rollup, and the clearest case for a table with no verbs at all:
/// nothing here is marked done and nothing is removed — an account is added and
/// edited on Balances, which owns the list. So the only keyboard the screen has
/// is the arrows, and the one thing a wide window buys is the accounts side by
/// side with their kinds and balances lined up.
struct MacNetWorthTable: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var tables: TableCommands
    let accounts: [Account]
    @Binding var selection: Set<String>
    @Binding var sortOrder: [KeyPathComparator<Account>]

    var body: some View {
        Table(accounts, selection: $selection, sortOrder: $sortOrder) {
            TableColumn("") { account in
                Text(account.kindIcon)
                    .font(.system(size: 13))
                    .frame(maxWidth: .infinity, alignment: .center)
                    .accessibilityLabel(account.kindLabel)
            }
            .width(min: 24, ideal: 26, max: 30)

            TableColumn("Account", value: \.name) { account in
                Text(account.name.isEmpty ? account.kindLabel : account.name)
                    .foregroundStyle(account.name.isEmpty ? Theme.muted : Theme.text)
                    .lineLimit(1)
            }
            .width(min: 160, ideal: 260)

            TableColumn("Kind", value: \.kindLabel) { account in
                Text(account.kindLabel).foregroundStyle(Theme.muted).lineLimit(1)
            }
            .width(min: 90, ideal: 130)

            TableColumn("Notes", value: \.notes) { account in
                Text(account.notes.isEmpty ? "—" : account.notes)
                    .foregroundStyle(account.notes.isEmpty ? Theme.muted.opacity(0.6) : Theme.muted)
                    .lineLimit(1)
            }
            .width(min: 100, ideal: 220)

            TableColumn("Balance", value: \.balance) { account in
                Text(Money.fmt(account.balance))
                    .font(Theme.mono(13, weight: .semibold))
                    .monospacedDigit()
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .width(min: 90, ideal: 120)
        }
        .alternatingRowBackgrounds()
        .overlay {
            if accounts.isEmpty {
                ContentUnavailableView(
                    store.loaded ? "No accounts yet" : "Loading…",
                    systemImage: "building.columns",
                    description: Text(store.loaded
                        ? "Add savings, checking, investments or property on the Balances screen."
                        : "Fetching your accounts.")
                )
            }
        }
        // No `contextMenu` and no verbs: the screen is a report. The keyboard
        // still walks it — that is what the modifier is for — and the menu bar
        // is told there is a table in front whose rows have nothing to do.
        .modifier(TableKeyboard(actions: rowActions, selection: $selection,
                                addTitle: nil, add: {}, tables: tables))
    }

    private var rowActions: RowActions {
        RowActions(
            ids: accounts.map(\.id),
            noun: "Account",
            plural: "Accounts",
            menuTitle: "Account",
            verb: nil,
            remove: nil,
            archives: false
        )
    }
}

/// The History screen's payment log as a real table.
///
/// The income-and-spending chart above it stays where it is — it is the only
/// place that history is drawn, and a chart is not a row. The payments below it
/// are: the phone groups them by month and stacks two lines per payment, which
/// a table turns into a Month column and a Date column, with the kind (bill,
/// card, or a month skipped) beside them. Editing opens the same sheet; a skip
/// has no amount to edit, and the destructive verb is its un-skip, exactly as
/// the phone's menu says.
struct MacHistoryTable: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var tables: TableCommands
    let payments: [Payment]
    @Binding var selection: Set<String>
    @Binding var sortOrder: [KeyPathComparator<Payment>]
    let onEdit: (Payment) -> Void

    /// 24 + 240 + 80 + 110 + 100 + 200 + 110 = 864 for every column, and 664
    /// without the Note — the widest single column in the app, and the only one
    /// here that is prose. Fifteen per cent of room, like the other three.
    var body: some View {
        GeometryReader { pane in
            table(MacTableWidth.fit(pane.size.width, wide: 995, medium: 765))
        }
    }

    private func table(_ width: MacTableWidth) -> some View {
        Table(payments, selection: $selection, sortOrder: $sortOrder) {
            TableColumn("") { payment in
                Image(systemName: payment.skipped ? "forward.end.circle.fill" : "checkmark.circle.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(payment.skipped ? Theme.muted : Theme.green)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .accessibilityLabel(payment.skipped ? "Skipped" : "Paid")
            }
            .width(min: 22, ideal: 24, max: 28)

            TableColumn("Payment", value: \.titleSortKey) { payment in
                Text(payment.titleSortKey)
                    .foregroundStyle(payment.skipped ? Theme.muted : Theme.text)
                    .lineLimit(1)
            }
            .width(min: 150, ideal: 240)

            if width != .narrow {
                TableColumn("Kind", value: \.kindSortKey) { payment in
                    Text(payment.kindSortKey).foregroundStyle(Theme.muted).lineLimit(1)
                }
                .width(min: 64, ideal: 80)
            }

            TableColumn("Month", value: \.monthSortKey) { payment in
                Text(payment.monthKey.isEmpty
                     ? "—"
                     : Period.labelForKey(payment.monthKey, config: store.periodConfig, tz: store.tz))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
            .width(min: 84, ideal: 110)

            // Date and Month go at the narrowest, for the reason Spending's do:
            // the smallest window a Mac user can drag to leaves under 400pt of
            // table, and what the row is and what it paid are the two facts
            // that survive that.
            if width != .narrow {
                TableColumn("Date", value: \.date) { payment in
                    Text(MacTableDate.short(payment.date, tz: store.tz))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
                .width(min: 74, ideal: 100)
            }

            if width == .wide {
                TableColumn("Note", value: \.note) { payment in
                    Text(payment.note.isEmpty ? "—" : payment.note)
                        .foregroundStyle(payment.note.isEmpty ? Theme.muted.opacity(0.6) : Theme.muted)
                        .lineLimit(1)
                }
                .width(min: 90, ideal: 200)
            }

            TableColumn("Amount", value: \.amountSortKey) { payment in
                Text(payment.skipped ? "Skipped" : Money.fmt(payment.amount))
                    .font(payment.skipped ? Theme.ui(12) : Theme.mono(13, weight: .semibold))
                    .foregroundStyle(payment.skipped ? Theme.muted : Theme.text)
                    .monospacedDigit()
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .width(min: 84, ideal: 110)
        }
        .alternatingRowBackgrounds()
        .contextMenu(forSelectionType: String.self) { ids in
            menu(for: ids)
        } primaryAction: { ids in
            guard ids.count == 1, let id = ids.first,
                  let payment = payments.first(where: { $0.id == id }),
                  !payment.skipped else { return }
            onEdit(payment)
        }
        .overlay {
            if payments.isEmpty {
                ContentUnavailableView(
                    store.loaded ? "No payments" : "Loading…",
                    systemImage: "clock.arrow.circlepath",
                    description: Text(store.loaded
                        ? "Payments land here as you record them."
                        : "Fetching your history.")
                )
            }
        }
        .modifier(TableKeyboard(actions: rowActions, selection: $selection,
                                addTitle: nil, add: {}, tables: tables))
    }

    /// The log has one verb and it is the destructive one: a payment is a
    /// record of something that already happened, so the only thing to do to
    /// one is take it back. A skip is taken back the same way — that is what
    /// "Remove skip" means — which is why the title is the same either way.
    private var rowActions: RowActions {
        RowActions(
            ids: payments.map(\.id),
            noun: "Payment",
            plural: "Payments",
            menuTitle: "Payment",
            verb: nil,
            remove: { id in
                guard let payment = payments.first(where: { $0.id == id }) else { return }
                store.deletePayment(payment)
            },
            archives: false
        )
    }

    private func targets(_ ids: Set<String>) -> [Payment] {
        payments.filter { ids.contains($0.id) }
    }

    @ViewBuilder
    private func menu(for ids: Set<String>) -> some View {
        let rows = targets(ids)
        if rows.count == 1, let payment = rows.first {
            // A skip has no amount, and the pay editor refuses $0 — offering to
            // edit one could only turn it into a payment by accident, which is
            // the same call the phone's menu makes.
            if !payment.skipped {
                Button { onEdit(payment) } label: { Label("Edit payment", systemImage: "pencil") }
            }
            Button(role: .destructive) { store.deletePayment(payment) } label: {
                Label(payment.skipped ? "Remove skip" : "Delete payment",
                      systemImage: payment.skipped ? "arrow.uturn.backward" : "trash")
            }
        } else if !rows.isEmpty {
            Button(role: .destructive) {
                for payment in rows { store.deletePayment(payment) }
            } label: {
                Label("Delete \(rows.count)", systemImage: "trash")
            }
        }
    }
}

/// The Rewards ranking as a real table.
///
/// This screen is not a list of things to act on — it is a ranking, and the
/// ranking is exactly what a table is for: one row per card, one column per
/// number, sorted by the rate that is the entire question. The phone stacks
/// each runner-up into a name with a rate under it; here the rates line up, so
/// the gap between the winner and the next card is visible at a glance rather
/// than inferred. Nothing on the screen acts on a row, so the table has no
/// verbs — the menu bar is told there is a table whose rows have nothing to do.
struct MacRewardsTable: View {
    @EnvironmentObject var tables: TableCommands
    let ranked: [Rewards.Ranked]
    let category: String
    @Binding var selection: Set<String>
    @Binding var sortOrder: [KeyPathComparator<Rewards.Ranked>]

    var body: some View {
        Table(ranked, selection: $selection, sortOrder: $sortOrder) {
            TableColumn("") { entry in
                IconMark(icon: IssuerIcons.iconInfo(for: entry.card), size: 14)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .accessibilityHidden(true)
            }
            .width(min: 24, ideal: 28, max: 32)

            TableColumn("Card", value: \.card.name) { entry in
                HStack(spacing: 6) {
                    Text(entry.card.name.isEmpty ? "Card" : entry.card.name).lineLimit(1)
                    if entry.card.rotatingPool?.contains(category) ?? false {
                        Text("rotating")
                            .font(Theme.ui(10, weight: .bold)).textCase(.uppercase)
                            .padding(.horizontal, 6).padding(.vertical, 1)
                            .background(Theme.accentBg)
                            .foregroundStyle(Theme.accent)
                            .clipShape(Capsule())
                    }
                }
            }
            .width(min: 150, ideal: 230)

            TableColumn("Rate", value: \.value) { entry in
                Text(Self.ratePct(entry.value))
                    .font(Theme.mono(13, weight: .semibold))
                    .foregroundStyle(Theme.accent)
                    .monospacedDigit()
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .width(min: 60, ideal: 74)

            TableColumn("Points") { entry in
                Text(Self.points(entry))
                    .foregroundStyle(entry.pointValue > 1 ? Theme.muted : Theme.muted.opacity(0.6))
                    .lineLimit(1)
            }
            .width(min: 90, ideal: 120)

            TableColumn("Why") { entry in
                Text(Rewards.explanation(entry.card, category: category))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
                    .help(Rewards.explanation(entry.card, category: category))
            }
            .width(min: 200, ideal: 320)
        }
        .alternatingRowBackgrounds()
        .modifier(TableKeyboard(actions: rowActions, selection: $selection,
                                addTitle: nil, add: {}, tables: tables))
    }

    private var rowActions: RowActions {
        RowActions(
            ids: ranked.map(\.id),
            noun: "Card",
            plural: "Cards",
            menuTitle: "Card",
            verb: nil,
            remove: nil,
            archives: false
        )
    }

    /// A points card earns a multiplier, not a percentage: saying which, next to
    /// the cash-equivalent the Rate column already shows, is what makes the two
    /// numbers comparable.
    private static func points(_ entry: Rewards.Ranked) -> String {
        guard entry.pointValue != 1 else { return "cash back" }
        return "\(ratePct(entry.rate).dropLast())× · \(entry.pointValue)¢/pt"
    }

    /// "5%", "1.5%" — no trailing zeroes, the way the phone prints a rate.
    private static func ratePct(_ r: Double) -> String {
        let rounded = (r * 100).rounded() / 100
        return (rounded == rounded.rounded() ? String(Int(rounded)) : String(rounded)) + "%"
    }
}

/// The Income screen's sources as a real table.
///
/// The phone's list is a card per paycheck with the amount and its
/// monthly-normalised figure stacked at the right — two lines, one of which
/// repeats the other at a different scale. A table has columns for both, and a
/// "per month" column is only worth having next to the raw amount because the
/// two answer different questions: what lands in an account, and what the
/// period is working with.
struct MacIncomeTable: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var tables: TableCommands
    let sources: [IncomeSource]
    @Binding var selection: Set<String>
    @Binding var sortOrder: [KeyPathComparator<IncomeSource>]
    let onEdit: (IncomeSource) -> Void
    let emptyCopy: String

    /// 220 + 130 + 120 + 130 = 600 wide, 350 without the monthly column.
    var body: some View {
        GeometryReader { pane in
            table(MacTableWidth.fit(pane.size.width, wide: 600, medium: 350))
        }
    }

    @ViewBuilder
    private func table(_ tier: MacTableWidth) -> some View {
        Table(sources, selection: $selection, sortOrder: $sortOrder) {
            TableColumn("Source", value: \.label) { src in
                Text(src.label.isEmpty ? "Income" : src.label)
                    .foregroundStyle(src.label.isEmpty ? Theme.muted : Theme.text)
                    .lineLimit(1)
            }
            .width(min: 140, ideal: 220)

            TableColumn("Every", value: \.frequency) { src in
                Text(src.frequencyLabel())
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
            .width(min: 90, ideal: 130)

            if tier != .narrow {
                TableColumn("Hours", value: \.hoursPerWeek) { src in
                    Text(src.hoursPerWeek > 0 ? "\(src.trimmedHours())/wk" : "—")
                        .font(Theme.mono(12))
                        .foregroundStyle(src.hoursPerWeek > 0 ? Theme.text : Theme.muted.opacity(0.6))
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
                .width(min: 60, ideal: 80)
            }

            TableColumn("Per month", value: \.amount) { src in
                Text(Money.fmt(Income.monthly(of: src)))
                    .font(Theme.mono(12))
                    .foregroundStyle(Theme.muted)
                    .monospacedDigit()
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .width(min: 90, ideal: 130)

            TableColumn("Amount", value: \.amount) { src in
                Text(Money.fmt(src.amount))
                    .font(Theme.mono(13, weight: .semibold))
                    .foregroundStyle(Theme.text)
                    .monospacedDigit()
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .width(min: 90, ideal: 120)
        }
        .alternatingRowBackgrounds()
        .overlay {
            if sources.isEmpty {
                ContentUnavailableView(
                    store.loaded ? "No income sources" : "Loading…",
                    systemImage: "banknote",
                    description: Text(store.loaded ? emptyCopy : "Fetching your income.")
                )
            }
        }
        .contextMenu(forSelectionType: String.self) { ids in
            if let src = sources.first(where: { ids.contains($0.id) }) {
                Button { onEdit(src) } label: { Label("Edit source", systemImage: "pencil") }
            }
        } primaryAction: { ids in
            if let src = sources.first(where: { ids.contains($0.id) }) { onEdit(src) }
        }
        .modifier(TableKeyboard(actions: rowActions, selection: $selection,
                                addTitle: "New Income Source", add: {}, tables: tables))
    }

    private var rowActions: RowActions {
        // Nothing is deleted from here: a source is removed in its editor, and
        // ⌫ on a row that opens a form to ask is a surprise.
        RowActions(ids: sources.map(\.id), noun: "Source", plural: "Sources",
                   menuTitle: "Income Source", verb: nil, remove: nil, archives: false)
    }
}

/// The Income screen's adjustments as a table.
///
/// Signed, so a reduction and a bonus sort and read the same way: the Amount
/// column carries the sign and the colour, and the phone's separate "Reduction"
/// and "Extra income" labels become a Kind column instead.
struct MacIncomeAdjustmentsTable: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var tables: TableCommands
    let adjustments: [IncomeAdjustment]
    @Binding var selection: Set<String>
    @Binding var sortOrder: [KeyPathComparator<IncomeAdjustment>]
    let onEdit: (IncomeAdjustment) -> Void
    let emptyCopy: String

    /// 240 + 120 + 170 + 130 = 660 wide, 490 without the kind.
    var body: some View {
        GeometryReader { pane in
            table(MacTableWidth.fit(pane.size.width, wide: 660, medium: 490))
        }
    }

    @ViewBuilder
    private func table(_ tier: MacTableWidth) -> some View {
        Table(adjustments, selection: $selection, sortOrder: $sortOrder) {
            TableColumn("Adjustment", value: \.label) { adj in
                Text(adj.label.isEmpty ? (adj.amount < 0 ? "Reduction" : "Extra income") : adj.label)
                    .foregroundStyle(adj.label.isEmpty ? Theme.muted : Theme.text)
                    .lineLimit(1)
            }
            .width(min: 150, ideal: 240)

            if tier != .narrow {
                TableColumn("Kind", value: \.kind) { adj in
                    Text(adj.kind == "recurring" ? "Recurring" : "One-time")
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
                .width(min: 80, ideal: 120)
            }

            TableColumn("Applies", value: \.monthKey) { adj in
                Text(when(adj))
                    .font(Theme.ui(12))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
            .width(min: 110, ideal: 170)

            TableColumn("Amount", value: \.amount) { adj in
                Text("\(adj.amount >= 0 ? "+" : "")\(Money.fmt(adj.amount))")
                    .font(Theme.mono(13, weight: .semibold))
                    .foregroundStyle(adj.amount < 0 ? Theme.red : Theme.green)
                    .monospacedDigit()
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .width(min: 90, ideal: 130)
        }
        .alternatingRowBackgrounds()
        .overlay {
            if adjustments.isEmpty {
                ContentUnavailableView(
                    store.loaded ? "No adjustments" : "Loading…",
                    systemImage: "plus.forwardslash.minus",
                    description: Text(store.loaded ? emptyCopy : "Fetching your income.")
                )
            }
        }
        .contextMenu(forSelectionType: String.self) { ids in
            if let adj = adjustments.first(where: { ids.contains($0.id) }) {
                Button { onEdit(adj) } label: { Label("Edit adjustment", systemImage: "pencil") }
            }
        } primaryAction: { ids in
            if let adj = adjustments.first(where: { ids.contains($0.id) }) { onEdit(adj) }
        }
        .modifier(TableKeyboard(actions: rowActions, selection: $selection,
                                addTitle: "New Adjustment", add: {}, tables: tables))
    }

    /// The month an adjustment lands in, or the range a recurring one runs
    /// across — the phone prints the same sentence under the label.
    private func when(_ adj: IncomeAdjustment) -> String {
        if adj.kind == "recurring" {
            let from = DateLogic.monthKeyLabel(adj.startMonth, tz: store.tz)
            guard !adj.endMonth.isEmpty else { return "Monthly from \(from)" }
            return "\(from) – \(DateLogic.monthKeyLabel(adj.endMonth, tz: store.tz))"
        }
        return DateLogic.monthKeyLabel(adj.monthKey, tz: store.tz)
    }

    private var rowActions: RowActions {
        RowActions(ids: adjustments.map(\.id), noun: "Adjustment", plural: "Adjustments",
                   menuTitle: "Adjustment", verb: nil, remove: nil, archives: false)
    }
}

/// The Account Balances screen as a real table.
///
/// The phone's list is a column of cards, and a card per account is a lot of
/// height for two facts — what the account is called and what it holds. A Mac
/// window shows the whole list at once, so the same facts become columns: the
/// account, its kind, the bank's own figure where one is following, and the
/// balance. The bank's figure is dated in the cell rather than hidden in a
/// second line, because a number that looks live and is not is worse than a
/// number that says when it was true.
///
/// Notes are the supporting column and go first when the window narrows. The
/// kind goes second: an account whose name is empty reads as its kind, so the
/// column is only the fallback — the name, the balance and the bank figure are
/// what the row *is*.
struct MacBalancesTable: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var tables: TableCommands
    let accounts: [Account]
    /// The bank's own last figure for an account, or nil for a manual one.
    /// A closure rather than the dictionary because the figures are keyed by
    /// the *Plaid* account id, not this account's — that mapping is the
    /// screen's business, and a table that indexed the map itself would report
    /// every linked account as Manual.
    let bankFigure: (Account) -> BalancesView.BankFigure?
    @Binding var selection: Set<String>
    @Binding var sortOrder: [KeyPathComparator<Account>]
    let onEdit: (Account) -> Void
    let onDelete: (Account) -> Void

    /// 26 + 260 + 130 + 190 + 120 = 726 wide; 560 without the notes.
    var body: some View {
        GeometryReader { pane in
            table(MacTableWidth.fit(pane.size.width, wide: 726, medium: 560))
        }
    }

    @ViewBuilder
    private func table(_ tier: MacTableWidth) -> some View {
        Table(accounts, selection: $selection, sortOrder: $sortOrder) {
            TableColumn("") { account in
                Text(NetWorthView.kindIcon(account.type))
                    .font(.system(size: 13))
                    .frame(maxWidth: .infinity, alignment: .center)
                    .accessibilityLabel(NetWorthView.kindLabel(account.type))
            }
            .width(min: 24, ideal: 26, max: 30)

            TableColumn("Account", value: \.name) { account in
                HStack(spacing: 5) {
                    Text(account.name.isEmpty ? NetWorthView.kindLabel(account.type) : account.name)
                        .foregroundStyle(account.name.isEmpty ? Theme.muted : Theme.text)
                        .lineLimit(1)
                    // The 🏦 marks a row a linked bank is following, matching how
                    // bank-sourced transactions are marked on Spending.
                    if isLinked(account) {
                        Text("🏦").font(.system(size: 9)).accessibilityLabel("Linked to a bank")
                    }
                }
            }
            .width(min: 150, ideal: 260)

            if tier != .narrow {
                TableColumn("Kind", value: \.type) { account in
                    Text(NetWorthView.kindLabel(account.type))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
                .width(min: 90, ideal: 130)
            }

            if tier == .wide {
                TableColumn("Notes", value: \.notes) { account in
                    Text(account.notes.isEmpty ? "—" : account.notes)
                        .foregroundStyle(account.notes.isEmpty ? Theme.muted.opacity(0.6) : Theme.muted)
                        .lineLimit(1)
                }
                .width(min: 100, ideal: 190)
            }

            TableColumn("Bank", value: \.id) { account in
                bankCell(account)
            }
            .width(min: 110, ideal: 190)

            TableColumn("Balance", value: \.balance) { account in
                Text(Money.fmt(account.balance))
                    .font(Theme.mono(13, weight: .semibold))
                    .monospacedDigit()
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .width(min: 90, ideal: 120)
        }
        .alternatingRowBackgrounds()
        .overlay {
            if accounts.isEmpty {
                ContentUnavailableView(
                    store.loaded ? "No accounts yet" : "Loading…",
                    systemImage: "building.columns",
                    description: Text(store.loaded
                        ? "Add checking, savings, investments or property with the + button."
                        : "Fetching your accounts.")
                )
            }
        }
        .contextMenu(forSelectionType: String.self) { ids in
            menu(for: ids)
        } primaryAction: { ids in
            // Double-click edits, the way a Finder row opens.
            if let account = accounts.first(where: { ids.contains($0.id) }) { onEdit(account) }
        }
        .modifier(TableKeyboard(actions: rowActions, selection: $selection,
                                addTitle: "New Account", add: {}, tables: tables))
    }

    /// What the bank last reported, dated, or the word that says there is no
    /// bank. Never a bare figure: a cached balance presented as live is the one
    /// number on this screen that can be quietly wrong.
    @ViewBuilder
    private func bankCell(_ account: Account) -> some View {
        if let figure = bankFigure(account) {
            if let balance = figure.balance {
                let line = "\(Money.fmt(balance)) · \(figure.label)"
                    + (figure.asOf.map { " · \(MacTableDate.short($0, tz: store.tz))" } ?? "")
                Text(line)
                    .font(Theme.ui(12))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
                    .help(line)
            } else {
                Text(figure.label)
                    .font(Theme.ui(12))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
        } else {
            Text("Manual")
                .font(Theme.ui(12))
                .foregroundStyle(Theme.muted.opacity(0.7))
                .lineLimit(1)
        }
    }

    private func isLinked(_ account: Account) -> Bool {
        guard let pid = account.plaidAccountId else { return false }
        return !pid.isEmpty && pid != Account.noPlaidLink
    }

    @ViewBuilder
    private func menu(for ids: Set<String>) -> some View {
        let rows = accounts.filter { ids.contains($0.id) }
        if rows.count == 1, let account = rows.first {
            Button { onEdit(account) } label: { Label("Edit account", systemImage: "pencil") }
            Divider()
            Button(role: .destructive) { onDelete(account) } label: { Label("Delete account", systemImage: "trash") }
        } else if rows.count > 1 {
            // Several at once. Deleting is the only thing that means the same
            // thing for all of them; editing does not, so it is not offered.
            Button(role: .destructive) {
                for account in rows { onDelete(account) }
            } label: {
                Label("Delete \(rows.count) accounts", systemImage: "trash")
            }
        }
    }

    private var rowActions: RowActions {
        RowActions(
            ids: accounts.map(\.id),
            noun: "Account",
            plural: "Accounts",
            menuTitle: "Account",
            verb: nil,
            // Nothing here marks an account done, and an account is not a
            // transaction you would rather keep than lose — so ⌫ deletes, and
            // the menu says so. Archiving is a bills-and-cards setting.
            remove: { id in
                if let account = accounts.first(where: { $0.id == id }) { onDelete(account) }
            },
            archives: false
        )
    }
}

/// The payoff plan's accounts as a table.
///
/// The phone stacks a name, a starting balance, a payoff month and an interest
/// figure into two lines per account, which is the right shape for a card and
/// the wrong one for a plan: the whole point of a payoff ladder is that the
/// order is the argument, and a ladder you have to read four at a time to see
/// is a paragraph. Each account is a row, the row order is the payoff order,
/// and the two figures that differ between strategies get columns of their own
/// so the comparison is a table read rather than a sentence.
///
/// The month column is the one that earns its keep: "Month 14" repeated down
/// the table is the ladder itself.
struct MacPayoffTable: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var tables: TableCommands
    let rows: [MacPayoffRow]
    /// The other strategy's name, for the comparison column's header — "vs
    /// Snowball" beside an avalanche plan. A column headed only "Other" asks
    /// the reader to work out which of the two it is, which is the one thing
    /// the comparison exists to settle.
    let comparedName: String
    @Binding var selection: Set<String>
    @Binding var sortOrder: [KeyPathComparator<MacPayoffRow>]

    /// 240 + 130 + 110 + 130 = 610; 760 with the comparison column.
    ///
    /// Named because `PayoffView` derives its own split width from the first of
    /// them: a screen that puts this table in a column should not split the pane
    /// narrower than the columns it is made of.
    static let wideWidth: CGFloat = 610
    static let wideWithCompareWidth: CGFloat = 760

    private var showsComparison: Bool { rows.contains { $0.comparedMonth != nil } }

    var body: some View {
        GeometryReader { pane in
            table(MacTableWidth.fit(pane.size.width,
                                    wide: showsComparison ? Self.wideWithCompareWidth : Self.wideWidth,
                                    medium: 500))
        }
    }

    @ViewBuilder
    private func table(_ tier: MacTableWidth) -> some View {
        Table(rows, selection: $selection, sortOrder: $sortOrder) {
            TableColumn("Account", value: \.card.name) { item in
                Text(item.card.name.isEmpty ? "Account" : item.card.name)
                    .lineLimit(1)
            }
            .width(min: 150, ideal: 240)

            if tier != .narrow {
                TableColumn("Started", value: \.card.origBalance) { item in
                    Text(Money.fmt(item.card.origBalance))
                        .font(Theme.mono(13))
                        .foregroundStyle(Theme.muted)
                        .monospacedDigit()
                }
                .width(min: 90, ideal: 130)
            }

            // Sortable, and on the month itself rather than beside it: the
            // ladder's whole argument is its order, so a reader has to be able
            // to ask "what clears first" and get an answer. See `MacPayoffRow`
            // for why the value is not the model field.
            TableColumn("Paid off", value: \.monthSortKey) { item in
                Text(offLabel(item.month))
                    .font(Theme.mono(13, weight: .semibold))
                    .lineLimit(1)
            }
            .width(min: 90, ideal: 110)

            TableColumn("Interest", value: \.card.interestPaid) { item in
                Text(Money.fmt(item.card.interestPaid))
                    .font(Theme.mono(13, weight: .semibold))
                    .monospacedDigit()
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .width(min: 90, ideal: 130)

            if showsComparison, tier == .wide {
                TableColumn("vs \(comparedName)", value: \.comparedSortKey) { item in
                    compareCell(item)
                }
                .width(min: 100, ideal: 150)
            }
        }
        .alternatingRowBackgrounds()
        .overlay {
            if rows.isEmpty {
                ContentUnavailableView(
                    store.loaded ? "Nothing to pay off" : "Loading…",
                    systemImage: "chart.line.downtrend.xyaxis",
                    description: Text(store.loaded
                        ? "Add a card or loan with a balance to build a plan."
                        : "Fetching your balances.")
                )
            }
        }
        .modifier(TableKeyboard(actions: rowActions, selection: $selection,
                                addTitle: nil, add: {}, tables: tables))
    }

    /// A month number, or the em dash the plan owes when it never clears.
    private func offLabel(_ month: Int?) -> String {
        guard let month else { return "—" }
        return "Month \(month)"
    }

    /// One account's month under the compared plan, dimmed where the two
    /// agree. The reader is looking for the rows that differ: a column where
    /// every cell matches the Paid off column is the whole table restated.
    private func compareCell(_ item: MacPayoffRow) -> some View {
        let same = item.comparedMonth != nil && item.comparedMonth == item.month
        return Text(offLabel(item.comparedMonth))
            .font(Theme.mono(12))
            .foregroundStyle(same ? Theme.muted.opacity(0.55) : Theme.accent)
            .monospacedDigit()
    }

    private var rowActions: RowActions {
        RowActions(
            ids: rows.map(\.id),
            noun: "Account",
            plural: "Accounts",
            menuTitle: "Account",
            // A plan is a projection, not a record: there is nothing here to
            // mark done and nothing to delete. The accounts themselves are
            // edited from Cards.
            verb: nil,
            remove: nil,
            archives: false
        )
    }
}

/// One row of the payoff ladder, with a value per column that can be ordered.
///
/// `PayoffCardResult.paidOffMonth` is an `Int?`, and an optional is not
/// `Comparable`, so the column that answers "when does this one clear" could
/// not be sorted at all — a header that does nothing when you click it, while
/// every column beside it sorts. The wrapper gives the month something to order
/// on, and sends the never-clears case to the **end**: that row is not an early
/// rung but the one the plan cannot retire, and sorting it first would head the
/// table with the single row a reader can do nothing about.
///
/// The values are carried rather than computed so `KeyPath` can reach them —
/// `TableColumn(value:)` needs a key path, which cannot be a function call.
struct MacPayoffRow: Identifiable {
    var card: PayoffCardResult
    /// This account's month under the plan on screen; nil never clears.
    var month: Int?
    /// The same under the compared plan, when one is shown.
    var comparedMonth: Int?
    /// The month as something orderable. Never-clears sorts last.
    var monthSortKey: Int { month ?? Int.max }
    /// The same for the comparison column. Absent comparison sorts last too.
    var comparedSortKey: Int { comparedMonth ?? Int.max }
    var id: String { card.id }

    init(_ card: PayoffCardResult, compared: [PayoffCardResult]) {
        self.card = card
        self.month = card.paidOffMonth
        self.comparedMonth = compared.first { $0.id == card.id }?.paidOffMonth
    }
}

/// The budget lens's rows as a table.
///
/// The phone's lens is a card of stacked rows, each with a label on the left
/// and a figure on the right and a percentage under the label. On a Mac the
/// percentages and the figures are separate columns, because the one question
/// the lens exists to answer is "which line is over", and answering it means
/// comparing a column down its length rather than reading a column of pairs.
///
/// The hint moves into the row's help: it is a sentence about the number, and
/// a sentence about every number is a paragraph at the bottom of the table.
struct MacBudgetLensTable: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var tables: TableCommands
    let rows: [MacBudgetRow]
    @Binding var selection: Set<String>
    @Binding var sortOrder: [KeyPathComparator<MacBudgetRow>]

    /// 240 + 120 + 120 + 80 = 560; 460 without the Share column.
    ///
    /// Named because `BudgetView` derives its own split width from the first of
    /// them — see `MacPaneColumns.sideSplit`.
    static let wideWidth: CGFloat = 560

    var body: some View {
        GeometryReader { pane in
            table(MacTableWidth.fit(pane.size.width, wide: Self.wideWidth, medium: 460))
        }
    }

    @ViewBuilder
    private func table(_ tier: MacTableWidth) -> some View {
        Table(rows, selection: $selection, sortOrder: $sortOrder) {
            TableColumn("Category", value: \.row.label) { item in
                Text(item.row.label)
                    .lineLimit(1)
                    .help(item.row.hint ?? item.row.label)
            }
            .width(min: 140, ideal: 240)

            if tier != .narrow {
                TableColumn("Target") { item in
                    Text(item.row.target.map { Money.fmt($0) } ?? "—")
                        .font(Theme.mono(13))
                        .foregroundStyle(Theme.muted)
                        .monospacedDigit()
                }
                .width(min: 80, ideal: 120)
            }

            TableColumn("Actual", value: \.row.actual) { item in
                SemanticAmount(
                    value: Money.fmt(item.row.actual),
                    tone: A11y.MoneyTone.fromBudgetRowStatus(item.row.status),
                    font: Theme.mono(13, weight: .semibold),
                    statusWords: A11y.budgetRowStatusWords(item.row.status)
                )
                .monospacedDigit()
                .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .width(min: 90, ideal: 120)

            if tier == .wide {
                TableColumn("Share") { item in
                    Text(item.row.pct.map { "\($0)%" } ?? "—")
                        .font(Theme.mono(12))
                        .foregroundStyle(Theme.muted)
                        .monospacedDigit()
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
                .width(min: 60, ideal: 80)
            }
        }
        .alternatingRowBackgrounds()
        .overlay {
            if rows.isEmpty {
                ContentUnavailableView(
                    store.loaded ? "No lines yet" : "Loading…",
                    systemImage: "chart.pie",
                    description: Text(store.loaded
                        ? "Add bills, cards and spending to see where the period goes."
                        : "Fetching your budget.")
                )
            }
        }
        .modifier(TableKeyboard(actions: rowActions, selection: $selection,
                                addTitle: nil, add: {}, tables: tables))
    }

    private var rowActions: RowActions {
        RowActions(
            ids: rows.map(\.id),
            noun: "Category",
            plural: "Categories",
            menuTitle: "Category",
            // The lens is derived from bills, cards and spending; the rows are
            // where you went to change one of those, never the row itself.
            verb: nil,
            remove: nil,
            archives: false
        )
    }
}

/// A lens row with an identity of its own.
///
/// `BudgetRules.Row` is a value the rules engine hands back with a `key` and
/// no `Identifiable`, and a `Table` needs one: selection, and the menu verbs
/// behind it, are both keyed by row id.
struct MacBudgetRow: Identifiable {
    var row: BudgetRules.Row
    var id: String { row.key }

    init(_ row: BudgetRules.Row) { self.row = row }
}

/// A savings goal with the figure its "Save / mo" column sorts on.
///
/// The suggested monthly amount is a function of the row, not a field of it —
/// it needs the goal's target date and the reader's timezone. `KeyPath` can
/// reach a *computed property* but not a call, so the column had nothing to
/// sort on and was pointed at `\.target` instead: clicking "Save / mo" ordered
/// the table by the size of each goal, which is a different question. The
/// wrapper carries the figure so the key path can reach it.
///
/// A goal with no target date has nothing to suggest, so it sorts **last** —
/// where the em dash is.
struct MacGoalRow: Identifiable {
    var goal: SavingsGoal
    /// The suggested monthly amount, or `.greatestFiniteMagnitude` for none.
    /// `Comparable`, so the column sorts; the cell reads `suggestedMonthly`
    /// itself, so the sentinel is never printed as a figure.
    var savePerMonthSortKey: Double
    /// What the cell shows: the suggestion, or nil for a goal with no date.
    var suggestedMonthly: Double?
    var id: String { goal.id }

    init(_ goal: SavingsGoal, tz: TimeZone) {
        let suggested = BudgetView.suggestedMonthly(goal, tz: tz)
        self.goal = goal
        self.savePerMonthSortKey = suggested ?? .greatestFiniteMagnitude
        self.suggestedMonthly = suggested
    }
}

/// What a Mac table is given to sit in.
///
/// Two cases, because there are exactly two things a table is ever placed in,
/// and getting them the wrong way round is a layout bug that is hard to read out
/// of the code: a table that **is** the pane fills it and scrolls itself, while a
/// table sharing a `ScrollView` with other content has to be measured or it
/// claims the whole scroll view and pushes everything below it off the bottom.
/// Both used to be spelled as a bare `frame` at each call site —
/// `maxHeight: .infinity` in one place, `macTableHeight(rows:)` in another —
/// which reads as ordinary layout code and is a decision worth naming.
enum MacTablePlacement {
    /// The table is the pane, or a whole column of it. Fills and scrolls.
    case fills
    /// The table shares a scroll view: give it the height its rows need.
    case rows(Int)
}

extension View {
    /// Places a Mac table as `MacTablePlacement` describes it.
    ///
    /// `.fills` floors at one row's height, so a table with nothing in it is
    /// still tall enough for its own empty state rather than collapsing to a
    /// header with the `ContentUnavailableView` clipped out of it.
    @ViewBuilder
    func macTablePlacement(_ placement: MacTablePlacement) -> some View {
        switch placement {
        case .fills:
            frame(minHeight: macTableHeight(rows: 1), maxHeight: .infinity)
        case .rows(let count):
            frame(height: macTableHeight(rows: count))
        }
    }
}

/// Savings goals as a table.
///
/// The phone's goal is a card with a progress bar under the name and the
/// saved/target pair under that, plus a suggested monthly figure. A table can
/// put the progress in its own column and, more usefully, put every goal's
/// progress on the same line — which is the only way to see at a glance which
/// of four goals is actually moving.
///
/// The column order follows that: name, how far along, how much saved. Target
/// and the suggested monthly figure come last and only when the column is wide
/// enough for them, because in the side column Budget gives this table a
/// target is a figure the reader can get by adding, and the two that answer
/// "is this one moving, and can it finish" are the two kept.
struct MacGoalsTable: View {
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var tables: TableCommands
    let rows: [MacGoalRow]
    @Binding var selection: Set<String>
    @Binding var sortOrder: [KeyPathComparator<MacGoalRow>]
    let onEdit: (SavingsGoal) -> Void

    /// 220 + 120 + 110 + 110 + 110 = 670.
    static let wideWidth: CGFloat = 670

    var body: some View {
        GeometryReader { pane in
            table(MacTableWidth.fit(pane.size.width, wide: Self.wideWidth, medium: 520))
        }
    }

    @ViewBuilder
    private func table(_ tier: MacTableWidth) -> some View {
        Table(rows, selection: $selection, sortOrder: $sortOrder) {
            TableColumn("Goal", value: \.goal.name) { item in
                Text(item.goal.name.isEmpty ? "Goal" : item.goal.name)
                    .foregroundStyle(item.goal.name.isEmpty ? Theme.muted : Theme.text)
                    .lineLimit(1)
            }
            .width(min: 130, ideal: 220)

            // On the ratio itself, not on the target it happens to be measured
            // against: sorting a progress column by "biggest goal" is a
            // different order wearing the same header.
            TableColumn("Progress", value: \.goal.progress) { item in
                goalProgress(item.goal)
            }
            .width(min: 80, ideal: 120)

            TableColumn("Saved", value: \.goal.saved) { item in
                Text(Money.fmt(item.goal.saved))
                    .font(Theme.mono(13, weight: .semibold))
                    .monospacedDigit()
            }
            .width(min: 80, ideal: 110)

            if tier != .narrow {
                TableColumn("Target", value: \.goal.target) { item in
                    Text(Money.fmt(item.goal.target))
                        .font(Theme.mono(13))
                        .foregroundStyle(Theme.muted)
                        .monospacedDigit()
                }
                .width(min: 80, ideal: 110)
            }

            if tier == .wide {
                TableColumn("Save / mo", value: \.savePerMonthSortKey) { item in
                    Text(item.suggestedMonthly.map { Money.fmt($0) } ?? "—")
                        .font(Theme.mono(12))
                        .foregroundStyle(Theme.green)
                        .monospacedDigit()
                }
                .width(min: 80, ideal: 110)
            }
        }
        .alternatingRowBackgrounds()
        .overlay {
            if rows.isEmpty {
                ContentUnavailableView(
                    store.loaded ? "No savings goals" : "Loading…",
                    systemImage: "target",
                    description: Text(store.loaded
                        ? "Add an emergency fund, a trip, or a big purchase with the + button."
                        : "Fetching your goals.")
                )
            }
        }
        .contextMenu(forSelectionType: String.self) { ids in
            if let item = rows.first(where: { ids.contains($0.id) }) {
                Button { onEdit(item.goal) } label: { Label("Edit goal", systemImage: "pencil") }
            }
        } primaryAction: { ids in
            if let item = rows.first(where: { ids.contains($0.id) }) { onEdit(item.goal) }
        }
        .modifier(TableKeyboard(actions: rowActions, selection: $selection,
                                addTitle: "New Goal", add: {}, tables: tables))
    }

    /// The bar, at a width a table column can spare. `ProgressView` in a column
    /// is the one widget that needs no label to be read.
    private func goalProgress(_ goal: SavingsGoal) -> some View {
        HStack(spacing: 6) {
            ProgressView(value: goal.progress).tint(Theme.green)
            Text("\(Int(goal.progress * 100))%")
                .font(Theme.mono(11))
                .foregroundStyle(Theme.muted)
                .monospacedDigit()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(goal.name.isEmpty ? "Goal" : goal.name) progress")
        .accessibilityValue("\(Int(goal.progress * 100)) percent saved")
    }

    private var rowActions: RowActions {
        RowActions(
            ids: rows.map(\.id),
            noun: "Goal",
            plural: "Goals",
            menuTitle: "Goal",
            verb: nil,
            remove: nil,
            archives: false
        )
    }
}
#endif
