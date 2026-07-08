import SwiftUI
import FiHavenCore

enum SettingsSheet: String, Identifiable {
    case changeName, changeEmail, changePassword, clearData, deleteAccount
    case totpSetup, totpDisable, emailEnable, emailDisable, backupCodes, timezone
    var id: String { rawValue }
}

/// Full account settings: profile, security/MFA, preferences, data.
struct SettingsView: View {
    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var theme: ThemeStore
    @EnvironmentObject var biometric: BiometricStore
    @EnvironmentObject var billing: StoreManager
    let user: User

    @State private var sheet: SettingsSheet?
    @State private var mfa: MfaStatus?
    @State private var shareItem: ShareItem?
    @State private var busy = false

    private var current: User { env.currentUser ?? user }

    var body: some View {
        // Grouped landing: each row drills into a focused detail screen so the
        // settings aren't one long scroll.
        List {
            Section {
                groupRow("Account", "person.crop.circle.fill", "Profile, email, password") {
                    detail("Account") { accountSection }
                }
                groupRow("Security", "lock.shield.fill", "Two-factor, recovery") {
                    detail("Security") { securitySection }
                }
                groupRow("Preferences", "slider.horizontal.3", "Currency, period, display") {
                    detail("Preferences") { preferencesSection }
                }
                groupRow("Notifications", "bell.badge.fill", "Reminders, digest, summary") {
                    detail("Notifications") { notificationsSection }
                }
                groupRow("Family", "person.2.fill", "Share with your household", proLocked: !billing.isPro) {
                    HouseholdSettingsView(api: env.api, myEmail: current.email)
                }
                groupRow("Automation", "wand.and.stars", "Autopay auto-mark") {
                    detail("Automation") { autopaySection }
                }
                groupRow("Bank", "building.columns.fill", "Linked accounts") {
                    detail("Bank") { bankSection }
                }
                groupRow("Data", "externaldrive.fill", "Export, clear, delete") {
                    detail("Data") { dataSection }
                }
                #if DEBUG
                groupRow("Developer", "hammer.fill", "Simulate subscription states") {
                    detail("Developer") { developerSection }
                }
                #endif
            }
            signOutSection
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.bg.ignoresSafeArea())
        .brandedNavigationBar("Settings")
        .task { await loadMfa() }
        .sheet(item: $sheet, onDismiss: { Task { await loadMfa() } }) { which in
            sheetView(which)
        }
        .sheet(item: $shareItem) { item in ShareSheet(items: [item.url]) }
    }

    /// A landing row that drills into a settings detail screen.
    private func groupRow<Destination: View>(
        _ title: String, _ icon: String, _ subtitle: String,
        proLocked: Bool = false,
        @ViewBuilder destination: @escaping () -> Destination
    ) -> some View {
        NavigationLink {
            destination()
        } label: {
            Label {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(title).font(Theme.ui(16)).foregroundStyle(Theme.text)
                        Text(subtitle).font(Theme.ui(12)).foregroundStyle(Theme.muted)
                    }
                    if proLocked { Spacer(); ProBadge() }
                }
            } icon: {
                Image(systemName: icon).foregroundStyle(Theme.accent)
            }
        }
    }

    /// Wraps a settings section in its own styled detail List.
    @ViewBuilder
    private func detail<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
        List { content() }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Theme.bg.ignoresSafeArea())
            .brandedNavigationBar(title)
    }

    // ── Account ──────────────────────────────────────────────────────
    private var accountSection: some View {
        Section {
            LabeledContent("Email", value: current.email)
            Button { sheet = .changeName } label: {
                LabeledContent("Name", value: current.name?.isEmpty == false ? current.name! : "Add")
            }
            Button("Change email") { sheet = .changeEmail }
                .disabled(!current.emailVerified)
            Button("Change password") { sheet = .changePassword }
            HStack(spacing: 8) {
                let offline = store.syncState == .offline
                let saving = store.syncState == .saving
                Image(systemName: A11y.syncStatusIcon(offline: offline, saving: saving))
                    .foregroundStyle(offline ? Theme.muted : Theme.green)
                VStack(alignment: .leading, spacing: 2) {
                    Text(A11y.syncStatusWords(offline: offline, saving: saving))
                        .font(Theme.ui(11, weight: .semibold))
                        .foregroundStyle(Theme.text)
                    Text(syncLine).font(Theme.ui(13)).foregroundStyle(Theme.muted)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(
                "\(A11y.syncStatusWords(offline: store.syncState == .offline, saving: store.syncState == .saving)). \(syncLine)"
            )
        } header: {
            Text("Account")
        } footer: {
            if let line = membershipLine { Text(line) }
        }
    }

    /// Live sync reassurance for the account section.
    private var syncLine: String {
        switch store.syncState {
        case .saving: return "Saving to your account…"
        case .offline: return "Offline — saved on this device, will sync when back online."
        default: return "Synced to your account — changes save automatically across devices."
        }
    }

    /// "Member since June 2026 · Pro for 3 months" — a small coolness factor.
    private var membershipLine: String? {
        var parts: [String] = []
        if let since = current.createdAt {
            parts.append("Member since \(Self.monthYear(ms: since))")
        }
        if billing.isPro {
            if let proSince = billing.entitlement.proSince {
                parts.append("Pro for \(Self.duration(ms: Double(proSince)))")
            } else {
                parts.append("FiHaven Pro")
            }
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private static func monthYear(ms: Double) -> String {
        let f = DateFormatter()
        f.dateFormat = "MMMM yyyy"
        return f.string(from: Date(timeIntervalSince1970: ms / 1000))
    }

    /// The longest non-zero unit since `ms`: "3 years" / "5 months" / "12 days".
    private static func duration(ms: Double) -> String {
        let days = Int((Date().timeIntervalSince1970 - ms / 1000) / 86400)
        if days < 1 { return "today" }
        if days >= 365 { let y = days / 365; return "\(y) year\(y == 1 ? "" : "s")" }
        if days >= 30 { let m = days / 30; return "\(m) month\(m == 1 ? "" : "s")" }
        return "\(days) day\(days == 1 ? "" : "s")"
    }

    // ── Security ─────────────────────────────────────────────────────
    private var securitySection: some View {
        Section("Security") {
            if let mfa {
                Button {
                    sheet = mfa.totp.enabled ? .totpDisable : .totpSetup
                } label: {
                    HStack {
                        Text("Authenticator app")
                        Spacer()
                        HStack(spacing: 4) {
                            Image(systemName: A11y.enabledStatusIcon(mfa.totp.enabled))
                                .font(.caption)
                            Text(mfa.totp.enabled ? "On" : "Set up")
                                .foregroundStyle(mfa.totp.enabled ? Theme.green : Theme.accent)
                        }
                    }
                }
                .accessibilityLabel("Authenticator app, \(mfa.totp.enabled ? "on" : "not set up")")
                Button {
                    sheet = mfa.emailMfa.enabled ? .emailDisable : .emailEnable
                } label: {
                    HStack {
                        Text("Email codes")
                        Spacer()
                        HStack(spacing: 4) {
                            Image(systemName: A11y.enabledStatusIcon(mfa.emailMfa.enabled))
                                .font(.caption)
                            Text(A11y.enabledStatusWords(mfa.emailMfa.enabled))
                                .foregroundStyle(mfa.emailMfa.enabled ? Theme.green : Theme.muted)
                        }
                    }
                }
                .accessibilityLabel("Email codes, \(A11y.enabledStatusWords(mfa.emailMfa.enabled).lowercased())")
                if mfa.totp.enabled {
                    Button {
                        sheet = .backupCodes
                    } label: {
                        HStack {
                            Text("Backup codes")
                            Spacer()
                            Text("\(mfa.backupCodes.unused) left").foregroundStyle(Theme.muted)
                        }
                    }
                }
                if !mfa.passkeys.isEmpty {
                    ForEach(mfa.passkeys) { pk in
                        LabeledContent(pk.name ?? "Passkey", value: "Passkey")
                    }
                    Text("Add or remove passkeys on the web app.")
                        .font(Theme.ui(12)).foregroundStyle(Theme.muted)
                }
            } else {
                HStack { Text("Two-factor"); Spacer(); ProgressView() }
            }
        }
    }

    // ── Preferences ──────────────────────────────────────────────────
    private var preferencesSection: some View {
        Section("Preferences") {
            Picker("Appearance", selection: $theme.preference) {
                ForEach(ThemePreference.allCases) { pref in
                    Text(pref.label).tag(pref)
                }
            }
            .pickerStyle(.menu)
            if biometric.isAvailable {
                Picker("Require \(biometric.label) / Passcode after", selection: Binding(
                    get: { biometric.lockAfterMinutes },
                    set: { minutes in Task { await biometric.setLockAfterMinutes(minutes) } }
                )) {
                    Text("Never").tag(BioLockDelay.never)
                    Text("Immediately").tag(BioLockDelay.immediately)
                    Text("1 minute").tag(1)
                    Text("5 minutes").tag(5)
                    Text("15 minutes").tag(15)
                    Text("30 minutes").tag(30)
                }
                .pickerStyle(.menu)
                Text("Choose when FiHaven asks for \(biometric.label) or your device passcode after you leave the app.")
                    .font(Theme.ui(12)).foregroundStyle(Theme.muted)
            }
            Button {
                sheet = .timezone
            } label: {
                LabeledContent("Time zone",
                               value: CommonTimeZones.label(store.data.settings.timezone ?? "auto"))
            }
            VStack(alignment: .leading, spacing: 8) {
                Text("Mark fully paid at")
                    .font(Theme.ui(15))
                    .foregroundStyle(Theme.text)
                Picker("", selection: Binding(
                    get: { store.paidGoalPolicy },
                    set: { store.setPaidGoal($0) }
                )) {
                    Text("Minimum").tag(PaidGoalPolicy.minimum)
                    Text("Recommended").tag(PaidGoalPolicy.recommended)
                    Text("Full amount").tag(PaidGoalPolicy.full)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
            }
            Text("How much you must pay before a bill or card counts as fully paid. Anything less shows as a partial payment.")
                .font(Theme.ui(12)).foregroundStyle(Theme.muted)

            VStack(alignment: .leading, spacing: 8) {
                Text("New month bill amounts")
                    .font(Theme.ui(15))
                    .foregroundStyle(Theme.text)
                Picker("", selection: Binding(
                    get: { store.data.settings.rolloverPrefill },
                    set: { store.setRolloverPrefill($0) }
                )) {
                    Text("Average").tag("average")
                    Text("Same").tag("carry")
                    Text("Blank").tag("blank")
                }
                .pickerStyle(.segmented)
                .labelsHidden()
            }
            Text("When a new month starts, how each bill's amount is pre-filled in the review. Average uses your recent payments.")
                .font(Theme.ui(12)).foregroundStyle(Theme.muted)

            Picker("Budget period", selection: Binding(
                get: { store.data.settings.periodMode ?? "calendar" },
                set: { store.setPeriodMode($0) }
            )) {
                Text("Calendar month").tag("calendar")
                Text("Custom start day").tag("startDay")
                Text("Rolling window").tag("rolling")
            }
            .pickerStyle(.menu)
            NavigationLink {
                BudgetRuleSettingsView()
            } label: {
                LabeledContent("Budget lens",
                               value: BudgetRules.mode(from: store.data.settings) == "off"
                                   ? "Off" : BudgetRules.title(BudgetRules.mode(from: store.data.settings)))
            }
            if (store.data.settings.periodMode ?? "calendar") == "startDay" {
                Stepper("Starts on day \(store.data.settings.periodStartDay ?? 1)",
                        value: Binding(get: { store.data.settings.periodStartDay ?? 1 },
                                       set: { store.setPeriodStartDay($0) }),
                        in: 1...28)
            } else if (store.data.settings.periodMode ?? "calendar") == "rolling" {
                Stepper("Window: \(store.data.settings.periodLength ?? 35) days",
                        value: Binding(get: { store.data.settings.periodLength ?? 35 },
                                       set: { store.setPeriodLength($0) }),
                        in: 7...90)
                Toggle("Set a start date", isOn: Binding(
                    get: { store.data.settings.periodAnchor != nil },
                    set: { on in store.setPeriodAnchor(on
                        ? (store.data.settings.periodAnchor ?? Self.anchorISO(Date())) : nil) }
                ))
                if store.data.settings.periodAnchor != nil {
                    DatePicker("Starts on", selection: Binding(
                        get: { Self.anchorDate(store.data.settings.periodAnchor) ?? Date() },
                        set: { store.setPeriodAnchor(Self.anchorISO($0)) }
                    ), displayedComponents: .date)
                }
            }
            Text("How a period is defined for paid/owed tracking. A custom start day groups early-next-month bills into the period you'd plan for. A rolling window repeats every N days from an optional start date.")
                .font(Theme.ui(12)).foregroundStyle(Theme.muted)

            Toggle("Hide fully paid on dashboard", isOn: Binding(
                get: { store.data.settings.hidePaidOnDashboard },
                set: { store.setHidePaidOnDashboard($0) }
            ))
            .tint(Theme.accent)
            Text("When on, bills and cards you've fully paid this period won't appear in Upcoming on the dashboard.")
                .font(Theme.ui(12)).foregroundStyle(Theme.muted)

            Toggle("Archive instead of delete", isOn: Binding(
                get: { store.data.settings.archiveInsteadOfDelete },
                set: { store.setArchiveInsteadOfDelete($0) }
            ))
            .tint(Theme.accent)
            Text("When on, deleting a bill, card, or loan archives it instead — hidden from your lists but restorable. Manage archived items from the bottom of each list.")
                .font(Theme.ui(12)).foregroundStyle(Theme.muted)

            NavigationLink {
                DashboardLayoutView()
            } label: {
                LabeledContent("Dashboard layout",
                               value: store.data.settings.dashboardLayout == "widgets" ? "Widgets" : "Classic")
            }

            Picker("Currency", selection: Binding(
                get: { store.data.settings.currency ?? "USD" },
                set: { store.setCurrency($0) }
            )) {
                ForEach(Self.currencies, id: \.0) { Text("\($0.0) — \($0.1)").tag($0.0) }
            }
            .pickerStyle(.menu)

            Picker("Default view", selection: Binding(
                get: {
                    let v = store.data.settings.landingView ?? "dashboard"
                    return Self.views.contains { $0.0 == v } ? v : "dashboard"
                },
                set: { store.setLandingView($0) }
            )) {
                ForEach(Self.views, id: \.0) { Text($0.1).tag($0.0) }
            }
            .pickerStyle(.menu)

            NavigationLink { TabsEditorView() } label: { Text("Customize tabs") }
        }
    }

    // ── Notifications ────────────────────────────────────────────────
    private static let leadDayChoices = [0, 1, 2, 3, 5, 7, 10, 14]

    private var notificationsSection: some View {
        Group {
            // On-device reminders (local notifications + server push).
            Section("On this device") {
                Toggle("Remind me on this device", isOn: Binding(
                    get: { store.data.settings.localNotifications },
                    set: { store.setLocalNotifications($0) }
                )).tint(Theme.accent)

                Toggle("Push notifications", isOn: Binding(
                    get: { store.data.settings.pushNotifications },
                    set: { store.setPushNotifications($0) }
                )).tint(Theme.accent)

                Text("On-device reminders work offline. Push needs the app installed — the web can't register a device token.")
                    .font(Theme.ui(12)).foregroundStyle(Theme.muted)
            }

            // Email reminders (server scheduler).
            Section("Email") {
                Toggle("Email me bill reminders", isOn: Binding(
                    get: { store.data.settings.billReminders },
                    set: { store.setBillReminders($0) }
                )).tint(Theme.accent)
                Toggle("Weekly digest email", isOn: Binding(
                    get: { store.data.settings.weeklyDigest },
                    set: { store.setWeeklyDigest($0) }
                )).tint(Theme.accent)
                Toggle("Monthly summary email", isOn: Binding(
                    get: { store.data.settings.monthlySummary },
                    set: { store.setMonthlySummary($0) }
                )).tint(Theme.accent)

                Text("Emails go to your verified address. The weekly digest sends Mondays; the monthly summary on the 1st.")
                    .font(Theme.ui(12)).foregroundStyle(Theme.muted)
            }

            // Shared timing — applies to both on-device and email reminders.
            Section("Reminder timing") {
                Picker("Remind me", selection: Binding(
                    get: { store.data.settings.reminderLeadDays },
                    set: { store.setReminderLeadDays($0) }
                )) {
                    ForEach(Self.leadDayChoices, id: \.self) { d in
                        Text(d == 0 ? "On the due day" : (d == 1 ? "1 day before" : "\(d) days before")).tag(d)
                    }
                }
                .pickerStyle(.menu)
                Toggle("Also remind on the due day", isOn: Binding(
                    get: { store.data.settings.remindOnDueDay },
                    set: { store.setRemindOnDueDay($0) }
                )).tint(Theme.accent)
                Picker("Send at", selection: Binding(
                    get: { store.data.settings.notifyHour },
                    set: { store.setNotifyHour($0) }
                )) {
                    ForEach(0..<24, id: \.self) { h in
                        Text(Self.hourLabel(h)).tag(h)
                    }
                }
                .pickerStyle(.menu)
                Toggle("Card offer reminders", isOn: Binding(
                    get: { store.data.settings.offerReminders },
                    set: { store.setOfferReminders($0) }
                )).tint(Theme.accent)

                Text("These apply to both on-device and email reminders, and fire in your time zone.")
                    .font(Theme.ui(12)).foregroundStyle(Theme.muted)
            }
        }
    }

    static let currencies: [(String, String)] = [
        ("USD", "US Dollar ($)"), ("CAD", "Canadian Dollar ($)"), ("AUD", "Australian Dollar ($)"),
        ("GBP", "British Pound (£)"), ("EUR", "Euro (€)"), ("JPY", "Japanese Yen (¥)"),
        ("INR", "Indian Rupee (₹)"), ("CHF", "Swiss Franc"), ("MXN", "Mexican Peso ($)"),
        ("BRL", "Brazilian Real (R$)"),
    ]
    static let views: [(String, String)] = [
        ("dashboard", "Dashboard"), ("bills", "Bills"), ("cards", "Cards"), ("payoff", "Payoff"),
    ]

    // ── Data ─────────────────────────────────────────────────────────
    private var autopaySection: some View {
        Section("Automation") {
            Toggle("Auto-mark autopay items paid", isOn: Binding(
                get: { store.data.settings.autopayMark },
                set: { store.setAutopayMark($0) }
            )).tint(Theme.accent)
            if store.data.settings.autopayMark {
                Picker("Server marks at", selection: Binding(
                    get: { store.data.settings.autopayMarkHour },
                    set: { store.setAutopayMarkHour($0) }
                )) {
                    ForEach(0..<24, id: \.self) { h in
                        Text(Self.hourLabel(h)).tag(h)
                    }
                }
                .pickerStyle(.menu)
            }
            Text("Bills and cards flagged Autopay are recorded paid on their due date — on this device and on the server at the chosen hour (your time zone). If a real autopay fails, delete the auto-marked payment.")
                .font(Theme.ui(12)).foregroundStyle(Theme.muted)
        }
    }

    private static func hourLabel(_ h: Int) -> String {
        let ampm = h < 12 ? "AM" : "PM"
        let h12 = h % 12 == 0 ? 12 : h % 12
        return "\(h12):00 \(ampm)"
    }

    /// "YYYY-MM-DD" ↔ Date for the rolling-window start anchor.
    private static let anchorFmt: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = .current
        return f
    }()
    private static func anchorISO(_ d: Date) -> String { anchorFmt.string(from: d) }
    private static func anchorDate(_ s: String?) -> Date? { s.flatMap { anchorFmt.date(from: $0) } }

    private var dataSection: some View {
        Section("Data") {
            Button { Task { await exportData() } } label: {
                HStack { Text("Export data"); Spacer(); if busy { ProgressView() } }
            }
            Button("Clear data", role: .destructive) { sheet = .clearData }
            Button("Delete account", role: .destructive) { sheet = .deleteAccount }
        }
    }

    private var bankSection: some View {
        Section {
            NavigationLink { BankView() } label: { Text("Bank connections") }
        }
    }

    #if DEBUG
    /// Dev-only: simulate each Pro entitlement state without a purchase.
    private var developerSection: some View {
        Section {
            Picker("Subscription", selection: Binding(
                get: { billing.devEntitlementOverride },
                set: { billing.devEntitlementOverride = $0 }
            )) {
                Text("Off — use real").tag("off")
                Text("Free").tag("free")
                Text("Pro — active").tag("active")
                Text("Pro — expired").tag("expired")
                Text("Pro — grace period").tag("grace")
                Text("Canceled — active until expiry").tag("canceled")
            }
            .pickerStyle(.inline)
        } header: {
            Text("Subscription override")
        } footer: {
            Text("Simulates a Pro state for testing the UI. Local to this device — it never changes your real subscription or anything on the server. Debug builds only.")
        }
    }
    #endif

    private var signOutSection: some View {
        Section {
            Button("Sign out", role: .destructive) { Task { await env.logout() } }
        }
    }

    // ── sheet routing ────────────────────────────────────────────────
    @ViewBuilder
    private func sheetView(_ which: SettingsSheet) -> some View {
        switch which {
        case .changeName: ChangeNameSheet(current: current)
        case .changeEmail: ChangeEmailSheet(current: current)
        case .changePassword: ChangePasswordSheet()
        case .clearData: ClearDataSheet()
        case .deleteAccount: DeleteAccountSheet()
        case .totpSetup: TotpSetupSheet()
        case .totpDisable: TotpDisableSheet()
        case .emailEnable: EmailEnableSheet(email: current.email)
        case .emailDisable: EmailDisableSheet()
        case .backupCodes: BackupCodesSheet()
        case .timezone: TimezoneSheet()
        }
    }

    private func loadMfa() async {
        mfa = try? await env.api.mfaStatus()
    }

    private func exportData() async {
        busy = true
        defer { busy = false }
        do {
            let data = try await env.api.exportData()
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("fihaven-account-data.json")
            try data.write(to: url)
            shareItem = ShareItem(url: url)
        } catch {
            // best-effort; surfaced as no share sheet
        }
    }
}
