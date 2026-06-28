import SwiftUI
import UIKit
import FiHavenCore
import LinkKit

/// Pro-gated bank linking via Plaid's native Link SDK. Status, balances,
/// and disconnect run through the existing /api/plaid endpoints; "Connect"
/// opens Plaid Link with a server-issued link token and exchanges the
/// resulting public token back to the server.
struct BankView: View {
    @EnvironmentObject var env: AppEnvironment
    @State private var status: PlaidStatus?
    @State private var message: String?
    @State private var busy = false
    @State private var handler: Handler?

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
                Section { Text(message).font(Theme.ui(13)).foregroundStyle(Theme.muted) }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.bg.ignoresSafeArea())
        .navigationTitle("Bank connections")
        .task { await load() }
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
                    Toggle("Let bank balances update my cards", isOn: Binding(
                        get: { store.data.settings.plaidUpdateBalances },
                        set: { store.setPlaidUpdateBalances($0) }
                    )).tint(Theme.accent)
                } footer: {
                    Text("Off by default — FiHaven never changes the balances you typed. When on, a synced bank balance updates a card only when it clearly matches by its last 4 digits (include them in the card name).")
                        .font(Theme.ui(12)).foregroundStyle(Theme.muted)
                }
            }
            Section {
                Button { connect() } label: { Text(busy ? "Opening…" : "Connect a bank") }
                    .disabled(busy)
                if !s.items.isEmpty {
                    Button("Refresh balances") { refresh() }
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
                await MainActor.run { busy = false; message = "Could not start linking. Please try again." }
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
        config.onExit = { _ in
            Task { @MainActor in self.message = "Linking cancelled." }
        }
        switch Plaid.create(config) {
        case .success(let h):
            handler = h
            if let vc = Self.topViewController() {
                h.open(presentUsing: .viewController(vc))
            } else {
                message = "Could not present Plaid Link."
            }
        case .failure:
            message = "Could not start linking. Please try again."
        }
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
                await MainActor.run { busy = false; message = "Could not start reconnect. Please try again." }
            }
        }
    }

    @MainActor
    private func presentUpdate(token: String, itemId: Int) {
        busy = false
        var config = LinkTokenConfiguration(token: token, onSuccess: { _ in
            Task { @MainActor in self.repaired(itemId) }
        })
        config.onExit = { _ in Task { @MainActor in self.message = "Reconnect cancelled." } }
        switch Plaid.create(config) {
        case .success(let h):
            handler = h
            if let vc = Self.topViewController() {
                h.open(presentUsing: .viewController(vc))
            } else {
                message = "Could not present Plaid Link."
            }
        case .failure:
            message = "Could not start reconnect. Please try again."
        }
    }

    private func repaired(_ id: Int) {
        message = "Reconnecting…"
        Task {
            let ok = (try? await env.api.plaidRepaired(itemId: id)) != nil
            await MainActor.run { message = ok ? "Bank reconnected." : "Could not finish reconnecting." }
            await load()
        }
    }

    private func exchange(_ publicToken: String) {
        message = "Linking…"
        Task {
            let ok = (try? await env.api.plaidExchange(publicToken: publicToken)) != nil
            await MainActor.run { message = ok ? "Bank linked." : "Could not finish linking. Please try again." }
            await load()
        }
    }

    private func disconnect(_ id: Int) {
        Task {
            try? await env.api.plaidRemove(itemId: id)
            await load()
        }
    }

    private func refresh() {
        message = "Refreshing balances…"
        Task {
            let ok = (try? await env.api.plaidRefresh()) != nil
            await MainActor.run { message = ok ? "Balances updated." : "Could not refresh. Please try again." }
            await load()
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
