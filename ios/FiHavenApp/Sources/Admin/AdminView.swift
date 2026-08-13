import SwiftUI
import FiHavenCore

/// The admin console, the native counterpart of the web overlay: users,
/// the rewards catalog, and promo codes.
///
/// Reached from a Settings row that only appears for `user.isAdmin`. That
/// row is a convenience, not a lock — the server mounts every `/api/admin/*`
/// route behind `requireAdmin`, so a non-admin who got here anyway would see
/// nothing but "You don't have access".
struct AdminView: View {
    @EnvironmentObject var env: AppEnvironment

    enum Tab: String, CaseIterable, Identifiable {
        case users = "Users", rewards = "Rewards", promos = "Promos"
        var id: String { rawValue }
    }
    @State private var tab: Tab = .users

    var body: some View {
        VStack(spacing: 0) {
            Picker("Section", selection: $tab) {
                ForEach(Tab.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            switch tab {
            case .users:   AdminUsersList()
            case .rewards: AdminPresetsList()
            case .promos:  AdminPromosList()
            }
        }
        .background(Theme.bg.ignoresSafeArea())
        .brandedNavigationBar("Admin")
    }
}

// MARK: - Shared bits

/// Renders the server's error codes with the same words the web console uses.
func adminErrorText(_ error: Error) -> String {
    if let api = error as? APIError {
        switch api.serverCode {
        case "forbidden": return "You don't have access to the admin console."
        case "cannot-demote-self": return "You can't remove your own admin role."
        case "cannot-suspend-self": return "You can't suspend your own account."
        case "cannot-delete-self": return "You can't delete your own account here."
        case "confirm-email-mismatch": return "That email doesn't match the account."
        case "bad-plan": return "That plan isn't one this server offers."
        case "bad-days": return "Enter a number of days greater than zero."
        case "id-taken": return "A preset with that id already exists."
        case "not-found": return "That record no longer exists."
        default: return api.userMessage
        }
    }
    return error.localizedDescription
}

/// "7d ago" for recent stamps, an absolute date once that stops being useful.
/// Mirrors the web console's fmtRelative.
func adminRelative(_ ms: Double?, fallback: String) -> String {
    guard let ms, ms > 0 else { return fallback }
    let date = Date(timeIntervalSince1970: ms / 1000)
    let diff = Date().timeIntervalSince(date)
    if diff < 0 { return date.formatted(date: .abbreviated, time: .omitted) }
    let mins = Int(diff / 60)
    if mins < 1 { return "Just now" }
    if mins < 60 { return "\(mins)m ago" }
    let hrs = mins / 60
    if hrs < 24 { return "\(hrs)h ago" }
    let days = hrs / 24
    if days == 1 { return "Yesterday" }
    if days < 14 { return "\(days)d ago" }
    return date.formatted(date: .abbreviated, time: .omitted)
}

func adminDate(_ ms: Double?) -> String {
    guard let ms, ms > 0 else { return "Unknown" }
    return Date(timeIntervalSince1970: ms / 1000).formatted(date: .abbreviated, time: .omitted)
}

/// A small status pill, matching the web console's chips.
struct AdminPill: View {
    let text: String
    var tint: Color = Theme.muted

    var body: some View {
        Text(text)
            .font(Theme.ui(11, weight: .semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(tint.opacity(0.14), in: Capsule())
            .foregroundStyle(tint)
    }
}

/// Empty / loading / error states, so every tab behaves the same way.
struct AdminStateView: View {
    let loading: Bool
    let error: String?
    let emptyText: String?
    let retry: () -> Void

    var body: some View {
        if loading {
            ProgressView().padding(.vertical, 28)
        } else if let error {
            VStack(spacing: 10) {
                Text(error).font(Theme.ui(14)).foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                Button("Try again", action: retry)
                    .font(Theme.ui(14, weight: .semibold))
                    .foregroundStyle(Theme.accent)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 28)
        } else if let emptyText {
            Text(emptyText)
                .font(Theme.ui(14)).foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 28)
        }
    }
}

// MARK: - Users

struct AdminUsersList: View {
    @EnvironmentObject var env: AppEnvironment

    @State private var query = ""
    @State private var page = 1
    @State private var result: AdminUsersPage?
    @State private var loading = false
    @State private var error: String?
    @State private var selected: AdminUser?
    /// Debounces the search field so a fast typist doesn't fire a request per key.
    @State private var searchTask: Task<Void, Never>?

    var body: some View {
        List {
            Section {
                TextField("Search by email or name", text: $query)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onChange(of: query) { _, _ in scheduleSearch() }
            }

            if let result, !result.users.isEmpty {
                Section {
                    ForEach(result.users) { user in
                        Button { selected = user } label: { AdminUserRow(user: user) }
                            .buttonStyle(.plain)
                    }
                } header: {
                    Text("\(result.total) account\(result.total == 1 ? "" : "s")")
                } footer: {
                    if result.pages > 1 { pager(result) }
                }
            } else {
                Section {
                    AdminStateView(
                        loading: loading,
                        error: error,
                        emptyText: loading || error != nil ? nil : "No accounts match that search.",
                        retry: { Task { await load() } }
                    )
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.bg.ignoresSafeArea())
        .task { if result == nil { await load() } }
        .refreshable { await load() }
        .sheet(item: $selected) { user in
            AdminUserSheet(user: user, plans: result?.plans ?? [])
                .environmentObject(env)
                // Any action in there can change the row, so re-read the page.
                .onDisappear { Task { await load() } }
        }
    }

    private func pager(_ result: AdminUsersPage) -> some View {
        HStack {
            Button("Previous") { page = max(1, page - 1); Task { await load() } }
                .disabled(result.page <= 1)
            Spacer()
            Text("Page \(result.page) of \(result.pages)").font(Theme.ui(12))
            Spacer()
            Button("Next") { page = min(result.pages, page + 1); Task { await load() } }
                .disabled(result.page >= result.pages)
        }
        .font(Theme.ui(13, weight: .semibold))
    }

    private func scheduleSearch() {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            page = 1
            await load()
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            result = try await env.api.adminUsers(query: query.trimmingCharacters(in: .whitespaces), page: page)
            error = nil
        } catch {
            self.error = adminErrorText(error)
        }
    }
}

/// One account, with the same three activity stamps the web console shows.
struct AdminUserRow: View {
    let user: AdminUser

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(user.name?.isEmpty == false ? user.name! : user.email)
                .font(Theme.ui(15, weight: .semibold))
                .foregroundStyle(Theme.text)
            if user.name?.isEmpty == false {
                Text(user.email).font(Theme.ui(12)).foregroundStyle(Theme.muted)
            }

            HStack(spacing: 6) {
                if user.isAdmin { AdminPill(text: "Admin", tint: Theme.accent) }
                if user.suspended { AdminPill(text: "Suspended", tint: Theme.red) }
                if user.pro {
                    AdminPill(text: (user.proPlan ?? "Pro").capitalized, tint: Theme.green)
                } else {
                    AdminPill(text: "Free")
                }
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("Created · \(adminDate(user.createdAt))")
                Text("Last sign-in · \(signIn)")
                Text("Last active · \(adminRelative(user.lastSeenAt, fallback: user.lastLoginAt == nil ? "Never" : "Unknown"))")
                Text("Last data change · \(adminRelative(user.lastUsedAt, fallback: "No changes yet"))")
            }
            .font(Theme.ui(11))
            .foregroundStyle(Theme.muted)
        }
        .padding(.vertical, 4)
    }

    private var signIn: String {
        guard user.lastLoginAt != nil else {
            return (user.lastSeenAt != nil || user.lastUsedAt != nil) ? "Unknown (pre-tracking)" : "Never signed in"
        }
        let when = adminRelative(user.lastLoginAt, fallback: "Never signed in")
        guard let how = user.lastLoginMethod, !how.isEmpty else { return when }
        let label: String
        switch how {
        case "oauth-google": label = "Google"
        case "oauth-apple": label = "Apple"
        default: label = how
        }
        return "\(when) · \(label)"
    }
}

/// Everything you can do to one account. Destructive actions confirm first.
struct AdminUserSheet: View {
    @EnvironmentObject var env: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    let user: AdminUser
    let plans: [String]

    @State private var plan = "monthly"
    @State private var days = ""
    @State private var suspendReason = ""
    @State private var confirmEmail = ""
    @State private var note: String?
    @State private var errorText: String?
    @State private var busy = false
    @State private var confirmingDelete = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    LabeledContent("Email", value: user.email)
                    LabeledContent("Status", value: user.pro ? (user.proPlan ?? "Pro").capitalized : "Free")
                    if let source = user.proSource {
                        LabeledContent("Source", value: source)
                    }
                    if let expires = user.proExpiresAt {
                        LabeledContent("Expires", value: adminDate(expires))
                    }
                }

                Section {
                    Picker("Plan", selection: $plan) {
                        ForEach(plans.isEmpty ? ["trial", "monthly", "yearly", "family", "lifetime"] : plans, id: \.self) {
                            Text($0.capitalized).tag($0)
                        }
                    }
                    // Blank means "the plan's default length"; lifetime ignores it.
                    TextField("Days (optional)", text: $days)
                        .keyboardType(.numberPad)
                    Button("Grant Pro") { run { try await env.api.adminGrantPro(userId: user.id, plan: plan, days: Int(days)) ; note = "Granted \(plan)." } }
                    if user.revocable {
                        Button("Revoke what this console granted", role: .destructive) {
                            run { _ = try await env.api.adminRevokePro(userId: user.id); note = "Comp grant revoked." }
                        }
                    }
                } header: {
                    Text("Pro")
                } footer: {
                    Text("Revoking pulls back comp grants and promos only. Store subscriptions are cancelled at the App Store, Play, or Paddle.")
                }

                Section {
                    if user.suspended {
                        Button("Unsuspend") { run { try await env.api.adminSuspend(userId: user.id, suspend: false); note = "Account restored." } }
                        if let reason = user.suspendedReason, !reason.isEmpty {
                            LabeledContent("Reason", value: reason)
                        }
                    } else {
                        TextField("Reason (optional)", text: $suspendReason)
                        Button("Suspend", role: .destructive) {
                            run {
                                try await env.api.adminSuspend(userId: user.id, suspend: true,
                                                               reason: suspendReason.isEmpty ? nil : suspendReason)
                                note = "Account suspended."
                            }
                        }
                    }
                    Button("Send password-reset email") {
                        run { try await env.api.adminSendPasswordReset(userId: user.id); note = "Reset email sent." }
                    }
                    Button("Force sign-out everywhere") {
                        run {
                            let n = try await env.api.adminForceLogout(userId: user.id)
                            note = "Cleared \(n) session\(n == 1 ? "" : "s")."
                        }
                    }
                    Button(user.isAdmin ? "Remove admin role" : "Make admin") {
                        run {
                            try await env.api.adminSetRole(userId: user.id, admin: !user.isAdmin)
                            note = user.isAdmin ? "Admin role removed." : "Now an admin."
                        }
                    }
                } header: {
                    Text("Access")
                } footer: {
                    Text("Suspending leaves sessions alive so an open app shows the locked screen. Force sign-out drops them.")
                }

                Section("Danger zone") {
                    // The typed-email echo is the safety catch, same as the web
                    // console — the server rejects a mismatch outright.
                    TextField("Type \(user.email) to confirm", text: $confirmEmail)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button("Delete account permanently", role: .destructive) { confirmingDelete = true }
                        .disabled(confirmEmail.lowercased() != user.email.lowercased())
                }

                if let note {
                    Section { Text(note).font(Theme.ui(13)).foregroundStyle(Theme.green) }
                }
                if let errorText {
                    Section { FormErrorBanner(message: errorText) }
                }
            }
            .navigationTitle(user.email)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .disabled(busy)
            .confirmationDialog("Delete \(user.email)?", isPresented: $confirmingDelete, titleVisibility: .visible) {
                Button("Delete permanently", role: .destructive) {
                    run {
                        try await env.api.adminDeleteUser(userId: user.id, confirmEmail: confirmEmail)
                        dismiss()
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Their bills, cards, history, and linked banks are erased. This cannot be undone.")
            }
        }
    }

    /// Runs an admin call with the shared busy/error/notice handling.
    private func run(_ work: @escaping () async throws -> Void) {
        Task {
            busy = true
            errorText = nil
            defer { busy = false }
            do { try await work() } catch { errorText = adminErrorText(error) }
        }
    }
}

// MARK: - Promo codes

struct AdminPromosList: View {
    @EnvironmentObject var env: AppEnvironment

    @State private var promos: [AdminPromo] = []
    @State private var loading = false
    @State private var error: String?
    @State private var creating = false

    var body: some View {
        List {
            Section {
                Button {
                    creating = true
                } label: {
                    Label("New promo code", systemImage: "plus.circle.fill")
                }
            }

            if promos.isEmpty {
                Section {
                    AdminStateView(loading: loading, error: error,
                                   emptyText: loading || error != nil ? nil : "No promo codes yet.",
                                   retry: { Task { await load() } })
                }
            } else {
                Section("Codes") {
                    ForEach(promos) { promo in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(promo.code)
                                    .font(Theme.mono(15, weight: .semibold))
                                    .foregroundStyle(Theme.text)
                                Spacer()
                                if promo.redeemable {
                                    AdminPill(text: "Live", tint: Theme.green)
                                } else if !promo.active {
                                    AdminPill(text: "Off")
                                } else if promo.expired {
                                    AdminPill(text: "Expired", tint: Theme.red)
                                } else if promo.exhausted {
                                    AdminPill(text: "Used up", tint: Theme.red)
                                }
                            }
                            Text(detail(promo)).font(Theme.ui(12)).foregroundStyle(Theme.muted)
                            if let note = promo.note, !note.isEmpty {
                                Text(note).font(Theme.ui(11)).foregroundStyle(Theme.muted)
                            }
                            if promo.active {
                                Button("Deactivate", role: .destructive) {
                                    Task {
                                        do {
                                            try await env.api.adminDeactivatePromo(code: promo.code)
                                            await load()
                                        } catch { self.error = adminErrorText(error) }
                                    }
                                }
                                .font(Theme.ui(13, weight: .semibold))
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.bg.ignoresSafeArea())
        .task { if promos.isEmpty { await load() } }
        .refreshable { await load() }
        .sheet(isPresented: $creating, onDismiss: { Task { await load() } }) {
            AdminPromoCreateSheet().environmentObject(env)
        }
    }

    private func detail(_ p: AdminPromo) -> String {
        var bits: [String] = []
        bits.append((p.plan ?? "pro").capitalized)
        if let days = p.grantDays { bits.append("\(days) days") }
        if let max = p.maxRedemptions {
            bits.append("\(p.redeemedCount)/\(max) used")
        } else {
            bits.append("\(p.redeemedCount) used")
        }
        if let expires = p.expiresAt { bits.append("expires \(adminDate(expires))") }
        return bits.joined(separator: " · ")
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do { promos = try await env.api.adminPromos(); error = nil }
        catch { self.error = adminErrorText(error) }
    }
}

struct AdminPromoCreateSheet: View {
    @EnvironmentObject var env: AppEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var code = ""
    @State private var plan = "monthly"
    @State private var days = "30"
    @State private var maxRedemptions = ""
    @State private var note = ""
    @State private var errorText: String?
    @State private var busy = false

    var body: some View {
        SheetForm(title: "New promo code", busy: busy, error: errorText, saveTitle: "Create", onSave: save) {
            TextField("Code (blank to generate)", text: $code)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
            Picker("Plan", selection: $plan) {
                ForEach(["trial", "monthly", "three_month", "yearly", "family", "lifetime"], id: \.self) {
                    Text($0.replacingOccurrences(of: "_", with: " ").capitalized).tag($0)
                }
            }
            TextField("Days granted", text: $days).keyboardType(.numberPad)
            TextField("Max redemptions (blank = unlimited)", text: $maxRedemptions)
                .keyboardType(.numberPad)
            TextField("Note", text: $note)
        }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        guard let grantDays = Int(days), grantDays > 0 else {
            errorText = "Enter a number of days greater than zero."
            return
        }
        do {
            _ = try await env.api.adminCreatePromo(
                code: code.trimmingCharacters(in: .whitespaces),
                plan: plan,
                grantDays: grantDays,
                note: note.isEmpty ? nil : note,
                maxRedemptions: Int(maxRedemptions)
            )
            dismiss()
        } catch { errorText = adminErrorText(error) }
    }
}

// MARK: - Rewards catalog

struct AdminPresetsList: View {
    @EnvironmentObject var env: AppEnvironment

    @State private var query = ""
    @State private var page = 1
    @State private var result: AdminPresetsPage?
    @State private var loading = false
    @State private var error: String?
    @State private var editing: AdminCardPreset?
    @State private var creating = false
    @State private var searchTask: Task<Void, Never>?

    var body: some View {
        List {
            Section {
                TextField("Search issuer or card", text: $query)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onChange(of: query) { _, _ in scheduleSearch() }
                Button {
                    creating = true
                } label: {
                    Label("New card preset", systemImage: "plus.circle.fill")
                }
            }

            if let result, !result.presets.isEmpty {
                Section {
                    ForEach(result.presets) { preset in
                        Button { editing = preset } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(preset.label).font(Theme.ui(15, weight: .semibold))
                                    .foregroundStyle(Theme.text)
                                Text(summary(preset)).font(Theme.ui(12)).foregroundStyle(Theme.muted)
                            }
                            .padding(.vertical, 2)
                        }
                        .buttonStyle(.plain)
                    }
                } header: {
                    Text("\(result.total) preset\(result.total == 1 ? "" : "s")")
                } footer: {
                    if result.pages > 1 {
                        HStack {
                            Button("Previous") { page = max(1, page - 1); Task { await load() } }
                                .disabled(result.page <= 1)
                            Spacer()
                            Text("Page \(result.page) of \(result.pages)").font(Theme.ui(12))
                            Spacer()
                            Button("Next") { page = min(result.pages, page + 1); Task { await load() } }
                                .disabled(result.page >= result.pages)
                        }
                        .font(Theme.ui(13, weight: .semibold))
                    }
                }
            } else {
                Section {
                    AdminStateView(loading: loading, error: error,
                                   emptyText: loading || error != nil ? nil : "No presets match that search.",
                                   retry: { Task { await load() } })
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.bg.ignoresSafeArea())
        .task { if result == nil { await load() } }
        .refreshable { await load() }
        .sheet(item: $editing, onDismiss: { Task { await load() } }) { preset in
            AdminPresetSheet(preset: preset, isNew: false).environmentObject(env)
        }
        .sheet(isPresented: $creating, onDismiss: { Task { await load() } }) {
            AdminPresetSheet(preset: AdminCardPreset(), isNew: true).environmentObject(env)
        }
    }

    private func summary(_ p: AdminCardPreset) -> String {
        var bits = ["\(fmtRate(p.rewardBase))x base"]
        if !p.network.isEmpty { bits.append(p.network) }
        if !p.rewardCategories.isEmpty { bits.append("\(p.rewardCategories.count) categories") }
        if let pv = p.pointValue { bits.append("\(pv)¢/pt") }
        return bits.joined(separator: " · ")
    }

    private func scheduleSearch() {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            page = 1
            await load()
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            result = try await env.api.adminCardPresets(query: query.trimmingCharacters(in: .whitespaces), page: page)
            error = nil
        } catch { self.error = adminErrorText(error) }
    }
}

func fmtRate(_ value: Double) -> String {
    value == value.rounded() ? String(Int(value)) : String(format: "%.2f", value)
}

/// Create/edit one catalog row, including its per-category rate map.
struct AdminPresetSheet: View {
    @EnvironmentObject var env: AppEnvironment
    @Environment(\.dismiss) private var dismiss

    @State var preset: AdminCardPreset
    let isNew: Bool

    /// The category map as an ordered, editable list — a dictionary can't be
    /// bound to rows directly without the keys jumping around as you type.
    @State private var categories: [CategoryRate] = []
    @State private var errorText: String?
    @State private var busy = false
    @State private var confirmingDelete = false

    struct CategoryRate: Identifiable, Equatable {
        let id = UUID()
        var name: String
        var rate: String
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Issuer", text: $preset.issuer)
                    TextField("Name", text: $preset.name)
                    TextField("Network", text: $preset.network)
                    if !isNew {
                        LabeledContent("Id", value: preset.id)
                    }
                } header: {
                    Text("Card")
                } footer: {
                    if isNew { Text("The id is generated from issuer and name.") }
                }

                Section("Earning") {
                    LabeledContent("Base rate") {
                        TextField("1", value: $preset.rewardBase, format: .number)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                    }
                    LabeledContent("Point value (¢)") {
                        TextField("1", value: $preset.pointValue, format: .number)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                    }
                    LabeledContent("Rotating rate") {
                        TextField("—", value: $preset.rotatingRate, format: .number)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                    }
                }

                Section("Category rates") {
                    ForEach($categories) { $row in
                        HStack {
                            TextField("Category", text: $row.name)
                                .textInputAutocapitalization(.never)
                            TextField("Rate", text: $row.rate)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                                .frame(width: 70)
                        }
                    }
                    .onDelete { categories.remove(atOffsets: $0) }
                    Button {
                        categories.append(CategoryRate(name: "", rate: ""))
                    } label: {
                        Label("Add category", systemImage: "plus")
                    }
                }

                if !isNew {
                    Section {
                        Button("Delete preset", role: .destructive) { confirmingDelete = true }
                    }
                }

                if let errorText {
                    Section { FormErrorBanner(message: errorText) }
                }
            }
            .navigationTitle(isNew ? "New preset" : preset.label)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }.disabled(busy)
                }
            }
            .onAppear {
                categories = preset.rewardCategories
                    .sorted { $0.key < $1.key }
                    .map { CategoryRate(name: $0.key, rate: fmtRate($0.value)) }
            }
            .confirmationDialog("Delete \(preset.label)?", isPresented: $confirmingDelete, titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    Task {
                        do { try await env.api.adminDeleteCardPreset(id: preset.id); dismiss() }
                        catch { errorText = adminErrorText(error) }
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Cards already using this preset keep their saved rates.")
            }
        }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        var body = preset
        // Drop blank rows rather than sending empty keys the server would store.
        body.rewardCategories = categories.reduce(into: [String: Double]()) { map, row in
            let name = row.name.trimmingCharacters(in: .whitespaces)
            guard !name.isEmpty, let rate = Double(row.rate) else { return }
            map[name] = rate
        }
        do {
            if isNew {
                _ = try await env.api.adminCreateCardPreset(body)
            } else {
                _ = try await env.api.adminUpdateCardPreset(body)
            }
            dismiss()
        } catch { errorText = adminErrorText(error) }
    }
}
