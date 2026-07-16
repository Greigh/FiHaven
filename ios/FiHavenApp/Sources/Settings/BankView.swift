import SwiftUI
import UIKit
import FiHavenCore
import LinkKit

/// Pro-gated bank linking via Plaid's native Link SDK. Status, balances,
/// and disconnect run through the existing /api/plaid endpoints; "Connect"
/// opens Plaid Link with a server-issued link token and exchanges the
/// resulting public token back to the server.
/// Status line under the bank list. Failures read red so a real problem never
/// looks like ordinary progress text.
private struct BankMessage {
    let text: String
    let isError: Bool

    static func info(_ text: String) -> BankMessage { BankMessage(text: text, isError: false) }
    static func error(_ text: String) -> BankMessage { BankMessage(text: text, isError: true) }
    static func result(ok: Bool, _ good: String, _ bad: String) -> BankMessage {
        ok ? .info(good) : .error(bad)
    }
}

struct BankView: View {
    @EnvironmentObject var env: AppEnvironment
    @State private var status: PlaidStatus?
    @State private var message: BankMessage?
    @State private var busy = false
    @State private var handler: Handler?
    @State private var showImportPrompt = false
    @State private var promptAcceptAll = false
    @State private var pendingPromptCount = 0

    var body: some View {
        List {
            Section {
                Text("Optionally link a bank with Plaid to auto-fetch balances. FiHaven works fully by hand, so a dropped connection never breaks your dashboard.")
                    .font(Theme.ui(13)).foregroundStyle(Theme.muted)
            }
            if let status {
                content(status)
            } else {
                Section { HStack { Text("Loading…").foregroundStyle(Theme.muted); Spacer(); ProgressView() } }
            }
            if let message {
                Section {
                    Text(message.text)
                        .font(Theme.ui(13))
                        .foregroundStyle(message.isError ? Theme.red : Theme.muted)
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.bg.ignoresSafeArea())
        .navigationTitle("Bank connections")
        .task { await load() }
        .alert("Accept Current Balance suggestions?", isPresented: $promptAcceptAll) {
            Button("Accept all") {
                guard let store = env.store else { return }
                for p in store.pendingBalanceProposals() { store.acceptBalanceProposal(p) }
                message = .info("Accepted Current Balance suggestions.")
            }
            Button("Not now", role: .cancel) {}
        } message: {
            Text("Bank suggested Current Balance updates for \(pendingPromptCount) card\(pendingPromptCount == 1 ? "" : "s"). Statement Balance stays manual. Decline individual items from the Cards tab.")
        }
        .confirmationDialog(
            "Bank linked — what should FiHaven do with it?",
            isPresented: $showImportPrompt,
            titleVisibility: .visible
        ) {
            Button("Import my purchases") {
                applyImportChoice(purchases: true, balances: false)
            }
            Button("Import purchases + suggest card balances") {
                applyImportChoice(purchases: true, balances: true)
            }
            Button("Not now", role: .cancel) {}
        } message: {
            Text("Imported purchases are added to Spending tagged 🏦, and never overwrite anything you typed. You can change this any time on this screen.")
        }
    }

    @ViewBuilder
    private func content(_ s: PlaidStatus) -> some View {
        if !s.configured {
            Section {
                Text("Bank linking isn’t enabled on the server this app is connected to.")
                    .font(Theme.ui(14)).foregroundStyle(Theme.muted)
                Text("This build is talking to \(AppEnvironment.webBaseURL.host ?? "the server"). Bank linking needs Plaid credentials configured there; manual entry works regardless.")
                    .font(Theme.ui(12)).foregroundStyle(Theme.muted)
            }
        } else if !s.pro {
            Section { Text("Linking your bank is a Pro feature. Upgrade from the Get Pro tab to connect an account.").font(Theme.ui(14)) }
        } else {
            Section {
                if s.items.isEmpty {
                    Text("No banks linked yet.").font(Theme.ui(14)).foregroundStyle(Theme.muted)
                } else {
                    ForEach(s.items) { item in itemView(item) }
                }
            }
            if let store = env.store {
                Section {
                    Toggle("Let bank suggest card balances", isOn: Binding(
                        get: { store.data.settings.plaidUpdateBalances },
                        set: { on in
                            store.setPlaidUpdateBalances(on)
                            guard on else { return }
                            message = .info("New balance suggestions will appear for you to Accept or Decline.")
                            Task {
                                try? await Task.sleep(nanoseconds: 2_500_000_000)
                                await env.store?.load()
                            }
                        }
                    )).tint(Theme.accent)
                } footer: {
                    Text("Off by default — FiHaven never changes the balances you typed. When on, synced figures become Current Balance suggestions (Statement Balance stays manual).")
                        .font(Theme.ui(12)).foregroundStyle(Theme.muted)
                }
                if store.data.settings.plaidUpdateBalances {
                    Section {
                        Picker("Balance suggestions", selection: Binding(
                            get: { store.data.settings.plaidBalanceMode },
                            set: { store.setPlaidBalanceMode($0) }
                        )) {
                            Text("Review queue").tag("review")
                            Text("Ask after each sync").tag("prompt")
                        }
                    } footer: {
                        Text("Review queue shows Accept/Decline on Cards. Ask after sync shows a dialog after Sync now.")
                            .font(Theme.ui(12)).foregroundStyle(Theme.muted)
                    }
                }
                Section {
                    Toggle("Let bank import my purchases", isOn: Binding(
                        get: { store.data.settings.plaidUpdatePurchases },
                        set: { on in
                            store.setPlaidUpdatePurchases(on)
                            guard on else { return }
                            message = .info("Importing your purchases — check Spending in a moment.")
                            Task {
                                try? await Task.sleep(nanoseconds: 2_500_000_000)
                                await env.store?.load()
                            }
                        }
                    )).tint(Theme.accent)
                } footer: {
                    Text("Off by default — your spending stays manual-entry. When on, outflows from your linked banks are added to Spending (tagged as bank purchases, and never overwrite anything you typed).")
                        .font(Theme.ui(12)).foregroundStyle(Theme.muted)
                }
                Section {
                    Picker("Subscriptions from spending", selection: Binding(
                        get: { store.data.settings.subscriptionDetectMode },
                        set: { store.setSubscriptionDetectMode($0) }
                    )) {
                        Text("Suggested inbox").tag("inbox")
                        Text("Inline with actions").tag("inline")
                    }
                } footer: {
                    Text("Recurring merchants stay as suggestions until you Accept, Decline, or add them as a Subscription.")
                        .font(Theme.ui(12)).foregroundStyle(Theme.muted)
                }
            }
            Section {
                Button { connect() } label: { Text(busy ? "Opening…" : "Connect a bank") }
                    .disabled(busy)
                if !s.items.isEmpty {
                    Button("Sync now") { refresh() }
                }
            } footer: {
                Text("By connecting, you agree to Plaid's End User Privacy Policy. You authenticate with your bank inside Plaid; we never see your bank login.")
                    .font(Theme.ui(12)).foregroundStyle(Theme.muted)
            }
        }
    }

    private func itemView(_ item: PlaidItem) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(item.institutionName).font(Theme.ui(15, weight: .medium))
                if item.status == "new_accounts" {
                    Text("New accounts available")
                        .font(Theme.ui(11, weight: .medium)).foregroundStyle(Theme.muted)
                } else if item.status != "active" {
                    HStack(spacing: 4) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.caption2)
                            .foregroundStyle(Theme.orange)
                        Text(item.status == "login_required" ? "Reconnect needed" : item.status)
                            .font(Theme.ui(11, weight: .medium))
                            .foregroundStyle(Theme.text)
                    }
                }
                Spacer()
                Button("Disconnect", role: .destructive) { disconnect(item.id) }
                    .font(Theme.ui(13))
            }
            if item.status == "new_accounts" {
                Button("Add accounts") { reconnect(item.id, accountSelection: true) }
                    .font(Theme.ui(13, weight: .medium)).foregroundStyle(Theme.accent)
            } else if item.status != "active" {
                Button("Reconnect") { reconnect(item.id) }
                    .font(Theme.ui(13, weight: .medium)).foregroundStyle(Theme.accent)
            }
            ForEach(item.accounts) { a in
                HStack {
                    Text((a.name ?? a.subtype ?? "Account") + (a.mask.map { " ••\($0)" } ?? ""))
                        .font(Theme.ui(13)).foregroundStyle(Theme.muted)
                    Spacer()
                    Text(a.currentBalance.map { Money.fmt($0) } ?? "—").font(Theme.ui(13, weight: .medium))
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(
                    "\(a.name ?? a.subtype ?? "Account"), balance \(a.currentBalance.map { Money.fmt($0) } ?? "unknown")"
                )
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(item.institutionName) bank connection")
    }

    private func load() async {
        status = try? await env.api.plaidStatus()
    }

    private func connect() {
        busy = true
        message = nil
        Task {
            do {
                let token = try await env.api.plaidLinkToken()
                await MainActor.run { present(token: token) }
            } catch {
                await MainActor.run { busy = false; message = .error("Could not start linking. Please try again.") }
            }
        }
    }

    @MainActor
    private func present(token: String) {
        busy = false
        var config = LinkTokenConfiguration(token: token, onSuccess: { success in
            let token = success.publicToken
            Task { @MainActor in self.exchange(token) }
        })
        config.onExit = { exit in
            let result = Self.exitMessage(exit, cancelled: "Linking cancelled.")
            Task { @MainActor in self.message = result }
        }
        switch Plaid.create(config) {
        case .success(let h):
            handler = h
            if let vc = Self.topViewController() {
                h.open(presentUsing: .viewController(vc))
            } else {
                message = .error("Could not present Plaid Link.")
            }
        case .failure:
            message = .error("Could not start linking. Please try again.")
        }
    }

    /// Plaid sets `exit.error` only when Link itself failed; a plain user close
    /// leaves it nil. Reporting both as a cancellation hides real failures.
    private static func exitMessage(_ exit: LinkExit, cancelled: String) -> BankMessage {
        guard let error = exit.error else { return .info(cancelled) }
        if let display = error.displayMessage, !display.isEmpty { return .error(display) }
        if !error.errorMessage.isEmpty { return .error(error.errorMessage) }
        return .error("Bank linking failed (\(error.errorCode.description)).")
    }

    // Update mode: re-auth an item flagged login_required, or (when
    // `accountSelection` is true) add newly-available accounts after a
    // NEW_ACCOUNTS_AVAILABLE webhook.
    private func reconnect(_ id: Int, accountSelection: Bool = false) {
        busy = true
        message = nil
        Task {
            do {
                let token = try await env.api.plaidLinkToken(itemId: id, accountSelection: accountSelection)
                await MainActor.run { presentUpdate(token: token, itemId: id) }
            } catch {
                await MainActor.run { busy = false; message = .error("Could not start reconnect. Please try again.") }
            }
        }
    }

    @MainActor
    private func presentUpdate(token: String, itemId: Int) {
        busy = false
        var config = LinkTokenConfiguration(token: token, onSuccess: { _ in
            Task { @MainActor in self.repaired(itemId) }
        })
        config.onExit = { exit in
            let result = Self.exitMessage(exit, cancelled: "Reconnect cancelled.")
            Task { @MainActor in self.message = result }
        }
        switch Plaid.create(config) {
        case .success(let h):
            handler = h
            if let vc = Self.topViewController() {
                h.open(presentUsing: .viewController(vc))
            } else {
                message = .error("Could not present Plaid Link.")
            }
        case .failure:
            message = .error("Could not start reconnect. Please try again.")
        }
    }

    private func repaired(_ id: Int) {
        message = .info("Reconnecting…")
        Task {
            let ok = (try? await env.api.plaidRepaired(itemId: id)) != nil
            await MainActor.run {
                message = .result(ok: ok, "Bank reconnected.", "Could not finish reconnecting.")
            }
            await load()
        }
    }

    private func exchange(_ publicToken: String) {
        message = .info("Linking…")
        Task {
            let ok = (try? await env.api.plaidExchange(publicToken: publicToken)) != nil
            await MainActor.run {
                message = .result(ok: ok, "Bank linked.", "Could not finish linking. Please try again.")
                // Linking on its own does nothing — both import gates are off by
                // default. Ask now rather than leaving the user with a connected
                // bank and an empty Spending tab.
                if ok { showImportPrompt = true }
            }
            await load()
        }
    }

    /// Turn on what the user picked. Saving the settings makes the server
    /// backfill — the sync cursor is still unset while the gate is off, so it
    /// pulls the full history rather than only future activity.
    private func applyImportChoice(purchases: Bool, balances: Bool) {
        guard let store = env.store else { return }
        store.setPlaidUpdatePurchases(purchases)
        store.setPlaidUpdateBalances(balances)
        guard purchases || balances else { return }
        message = .info(purchases
            ? "Importing your history — check Spending in a moment."
            : "Updating matching card balances…")
        Task {
            // Give the server's backfill a moment, then adopt the merged copy.
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            await env.store?.load()
        }
    }

    private func disconnect(_ id: Int) {
        Task {
            try? await env.api.plaidRemove(itemId: id)
            await load()
        }
    }

    // An explicit sync, so `force` skips the throttle that keeps the automatic
    // app-open sync cheap. It pulls purchases too, not just balances.
    private func refresh() {
        message = .info("Syncing…")
        Task {
            let ok = (try? await env.api.plaidRefresh(force: true)) != nil
            await MainActor.run {
                message = .result(ok: ok, "Synced.", "Could not sync. Please try again.")
            }
            await load()
            await env.store?.load()   // pick up purchases + balance proposals
            await MainActor.run {
                guard let store = env.store,
                      store.data.settings.plaidBalanceMode == "prompt" else { return }
                let pending = store.pendingBalanceProposals()
                guard !pending.isEmpty else { return }
                pendingPromptCount = pending.count
                promptAcceptAll = true
            }
        }
    }

    /// Topmost view controller to present Link from (SwiftUI has no direct
    /// presenter).
    private static func topViewController() -> UIViewController? {
        let scene = (UIApplication.shared.connectedScenes.first { $0.activationState == .foregroundActive }
            ?? UIApplication.shared.connectedScenes.first) as? UIWindowScene
        var top = scene?.windows.first(where: { $0.isKeyWindow })?.rootViewController
            ?? scene?.windows.first?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}
