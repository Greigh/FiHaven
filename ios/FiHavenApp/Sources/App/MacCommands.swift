#if os(macOS)
import SwiftUI

/// What the table in front can do from the keyboard.
///
/// The menu bar is global — one set of items no matter which screen is up — and
/// the tables are per-screen. So the front screen publishes its verbs here and
/// `TransactionCommands` reads them back. That is also what keeps one key
/// binding for one verb: without it, every screen with a table would want its
/// own ⌘⌫.
///
/// Each title carries its own noun ("New Bill", "New Card", "Delete 3 Bills"),
/// because the menu is shared but a table of loans is not a table of cards.
///
/// Every verb but `add` is optional, and nil means the table in front does not
/// have it: a table of accounts is not a table of bills, and its menu should
/// not offer to mark one paid. Nil is what removes the item — a permanently
/// greyed line teaches nothing about the screen it is on.
struct RowCommands {
    /// The menu's own name for the rows in front: "Bill", "Account",
    /// "Payment". The menu bar is one bar for every screen.
    var menuTitle: String
    /// "New Bill", "New Card", "New Loan".
    var addTitle: String?
    var add: () -> Void
    /// "Mark 3 Bills Paid" / "Unmark Bill" — the inverse of what the selection
    /// already is.
    var markTitle: String?
    var canMark: Bool
    var mark: () -> Void
    /// "Delete 3 Bills", "Archive Loan".
    var deleteTitle: String?
    var canDelete: Bool
    var delete: () -> Void
}

/// Where the front table posts its verbs.
///
/// One object owned by the app rather than a focused value — deliberately. A
/// focused value is only published once something in the window has focus,
/// and the case this whole feature is about is the one where nothing has yet:
/// the screen has just arrived and the user has gone straight to the keyboard.
/// The tables write here as their rows and selection change; the menu bar
/// reads it. (The window's own first responder is the window until a click, so
/// a scene-focused value is nil for the first frame and stays nil until a
/// text field or a row is clicked.)
@MainActor
final class TableCommands: ObservableObject {
    /// The verbs of whichever table is on screen, or nil when none is.
    @Published private(set) var rows: RowCommands?

    /// Who published them, so a screen leaving cannot take the menu away from
    /// the screen that replaced it: `onDisappear` and `onAppear` are not
    /// ordered against each other, and the outgoing table's retraction must
    /// not land after the incoming one's verbs.
    private var owner: UUID?

    #if DEBUG
    /// DEBUG: the front table's own key handler, so a scripted run can press
    /// keys it cannot press; see `FH_KEYS` in `FiHavenApp`. Space and the
    /// arrows cannot be posted into the app from outside without Accessibility
    /// permission, so this is how the bindings are exercised.
    ///
    /// Owned like the verbs above, because a table is briefly replaced by its
    /// successor when a screen's shape changes and the outgoing view must not
    /// take the hook with it.
    private(set) var debugHandle: (@MainActor (NSEvent) -> Bool)?
    private var debugOwner: UUID?

    func setDebugHandle(_ handle: (@MainActor (NSEvent) -> Bool)?, for owner: UUID) {
        if let handle {
            debugOwner = owner
            debugHandle = handle
        } else if debugOwner == owner {
            debugOwner = nil
            debugHandle = nil
        }
    }
    #endif

    func publish(_ rows: RowCommands, for owner: UUID) {
        self.owner = owner
        self.rows = rows
    }

    /// Retires the verbs, but only if they are still this table's.
    func retract(_ owner: UUID) {
        guard self.owner == owner else { return }
        self.owner = nil
        rows = nil
    }
}

/// The menu-bar half of the table keyboard.
///
/// These are real menu items on purpose. A key equivalent carried by a menu is
/// matched by AppKit before the responder chain ever sees the event, so ⌘N and
/// ⌘⌫ work whichever view holds focus — including while the user is typing in
/// the search field. The bare keys (space, ⌫, the arrow keys) cannot be menu
/// items for exactly that reason: a plain space bound to a menu item would be
/// stolen from every text field in the app, so those live with the table itself
/// (`TableKeyboard`).
struct TransactionCommands: Commands {
    @ObservedObject var tables: TableCommands

    /// Read through a name of its own so the body below reads as prose.
    private var rows: RowCommands? { tables.rows }

    var body: some Commands {
        // `replacing: .newItem` rather than adding to it: the Mac window is
        // singular (see `FiHavenApp`), so there is no second window for a
        // "New Window" item to open, and New here means a new row. The item
        // stays put on a screen with no table — the dashboard, say — rather
        // than the group going empty: an empty `CommandGroup(replacing:)` takes
        // the whole File menu with it, Close included. Disabled says the same
        // thing without costing the menu.
        CommandGroup(replacing: .newItem) {
            Button(rows?.addTitle ?? "New", action: { rows?.add() })
                .keyboardShortcut("n", modifiers: .command)
                // A screen with nothing to add — accounts are added on Balances,
                // and history records payments already made — says so by being
                // disabled rather than by offering a new bill.
                .disabled(rows?.addTitle == nil)
        }

        // The verbs a table row has and a column cannot say. A Mac app puts
        // these under the noun they act on — Mail has Message ▸ Mark as Read —
        // so the menu takes its name from the table in front: Bill, Card,
        // Account, Payment. A table without one of the verbs has no item for
        // it, and a table with neither keeps a line to read rather than an
        // empty menu.
        CommandMenu(rows?.menuTitle ?? "Transaction") {
            if let mark = rows?.markTitle {
                Button(mark, action: { rows?.mark() })
                    .disabled(!(rows?.canMark ?? false))
            }
            if let remove = rows?.deleteTitle {
                Button(remove, action: { rows?.delete() })
                    .keyboardShortcut(.delete, modifiers: .command)
                    .disabled(!(rows?.canDelete ?? false))
            }
            if rows == nil || (rows?.markTitle == nil && rows?.deleteTitle == nil) {
                Button(rows == nil ? "No table in front" : "This screen has no row actions") {}
                    .disabled(true)
            }
        }
    }
}

/// The Help menu's list of what the keyboard does.
///
/// It sits beside the commands that implement the bindings, so a binding added
/// in one place is a visible omission in the other. A disabled button is how a
/// menu carries a line that is meant to be read rather than chosen, and it
/// keeps the keys down the left where the other items put their shortcuts.
struct KeyboardShortcutsMenu: View {
    private struct Shortcut: Identifiable {
        var id: String { keys }
        let keys: String
        let what: String
    }

    /// Keys first, then what they do, ordered by how often the tables are
    /// worked with the keyboard rather than by menu convention.
    private static let bindings: [Shortcut] = [
        Shortcut(keys: "↑ ↓", what: "Move between rows — ⇧ extends, ⌘A selects all"),
        // The verbs follow the screen — a table of accounts has neither of the
        // two below — so the help describes what space does rather than naming
        // one screen's verb for it.
        Shortcut(keys: "Space", what: "Run the selected rows' verb: mark paid, unmark, …"),
        Shortcut(keys: "⌫  or  ⌘⌫", what: "Remove the selected rows, where the screen offers it"),
        Shortcut(keys: "⌘N", what: "Add a bill, card or loan"),
        Shortcut(keys: "⌘R", what: "Refresh data"),
        Shortcut(keys: "⌘⇧]   ⌘⇧[", what: "Next / previous screen"),
        Shortcut(keys: "⌘,", what: "Settings"),
    ]

    var body: some View {
        Menu("Keyboard Shortcuts") {
            ForEach(Self.bindings) { binding in
                Button("\(binding.keys) — \(binding.what)") {}
                    .disabled(true)
            }
        }
    }
}
#endif
