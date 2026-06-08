import SwiftUI
import FiHavenCore

enum SettingsSheet: String, Identifiable {
    case changeName, changeEmail, changePassword, deleteAccount
    case totpSetup, totpDisable, emailEnable, emailDisable, backupCodes, timezone
    var id: String { rawValue }
}

/// Full account settings: profile, security/MFA, preferences, data.
struct SettingsView: View {
    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var store: AppStore
    @EnvironmentObject var theme: ThemeStore
    @EnvironmentObject var biometric: BiometricStore
    let user: User

    @State private var sheet: SettingsSheet?
    @State private var mfa: MfaStatus?
    @State private var shareItem: ShareItem?
    @State private var busy = false

    private var current: User { env.currentUser ?? user }

    var body: some View {
        List {
            accountSection
            securitySection
            preferencesSection
            notificationsSection
            dataSection
            signOutSection
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.bg.ignoresSafeArea())
        .navigationTitle("Settings")
        .task { await loadMfa() }
        .sheet(item: $sheet, onDismiss: { Task { await loadMfa() } }) { which in
            sheetView(which)
        }
        .sheet(item: $shareItem) { item in ShareSheet(items: [item.url]) }
    }

    // ── Account ──────────────────────────────────────────────────────
    private var accountSection: some View {
        Section("Account") {
            LabeledContent("Email", value: current.email)
            Button { sheet = .changeName } label: {
                LabeledContent("Name", value: current.name?.isEmpty == false ? current.name! : "Add")
            }
            Button("Change email") { sheet = .changeEmail }
            Button("Change password") { sheet = .changePassword }
        }
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
                        Text(mfa.totp.enabled ? "On" : "Set up")
                            .foregroundStyle(mfa.totp.enabled ? Theme.green : Theme.accent)
                    }
                }
                Button {
                    sheet = mfa.emailMfa.enabled ? .emailDisable : .emailEnable
                } label: {
                    HStack {
                        Text("Email codes")
                        Spacer()
                        Text(mfa.emailMfa.enabled ? "On" : "Off")
                            .foregroundStyle(mfa.emailMfa.enabled ? Theme.green : Theme.muted)
                    }
                }
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
                Toggle("Require \(biometric.label)", isOn: Binding(
                    get: { biometric.enabled },
                    set: { on in Task { await biometric.setEnabled(on) } }
                ))
                .tint(Theme.accent)
            }
            Button {
                sheet = .timezone
            } label: {
                LabeledContent("Time zone",
                               value: CommonTimeZones.label(store.data.settings.timezone ?? "auto"))
            }
            Picker("Mark fully paid at", selection: Binding(
                get: { store.paidGoalPolicy },
                set: { store.setPaidGoal($0) }
            )) {
                Text("Minimum payment").tag(PaidGoalPolicy.minimum)
                Text("Recommended amount").tag(PaidGoalPolicy.recommended)
                Text("Full balance / amount").tag(PaidGoalPolicy.full)
            }
            .pickerStyle(.menu)
            Text("How much you must pay before a bill or card counts as fully paid. Anything less shows as a partial payment.")
                .font(Theme.ui(12)).foregroundStyle(Theme.muted)

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
        }
    }

    // ── Notifications ────────────────────────────────────────────────
    private var notificationsSection: some View {
        Section("Notifications") {
            Toggle("Bill reminders", isOn: Binding(
                get: { store.data.settings.billReminders },
                set: { store.setBillReminders($0) }
            )).tint(Theme.accent)
            Toggle("Monthly summary", isOn: Binding(
                get: { store.data.settings.monthlySummary },
                set: { store.setMonthlySummary($0) }
            )).tint(Theme.accent)
            Text("Optional emails to your verified address, sent in your time zone. Reminders go out 3 days before a bill is due; the summary on the 1st.")
                .font(Theme.ui(12)).foregroundStyle(Theme.muted)
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
    private var dataSection: some View {
        Section("Data") {
            Button { Task { await exportData() } } label: {
                HStack { Text("Export data"); Spacer(); if busy { ProgressView() } }
            }
            Button("Delete account", role: .destructive) { sheet = .deleteAccount }
        }
    }

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
