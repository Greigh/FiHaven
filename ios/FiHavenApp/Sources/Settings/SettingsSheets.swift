import SwiftUI
import FiHavenCore

// MARK: - Profile

struct ChangeNameSheet: View {
    @EnvironmentObject var env: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    let current: User
    @State private var name = ""
    @State private var errorText: String?
    @State private var busy = false

    var body: some View {
        SheetForm(title: "Name", busy: busy, error: errorText, onSave: save) {
            TextField("Your name", text: $name)
        } onAppear: { name = current.name ?? "" }
    }

    private func save() async {
        busy = true; defer { busy = false }
        do {
            let newName = try await env.api.changeName(name.trimmingCharacters(in: .whitespaces))
            env.applyUser(User(email: current.email, name: newName))
            dismiss()
        } catch let e as APIError { errorText = e.userMessage }
        catch { errorText = error.localizedDescription }
    }
}

struct ChangeEmailSheet: View {
    @EnvironmentObject var env: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    let current: User
    @State private var newEmail = ""
    @State private var password = ""
    @State private var errorText: String?
    @State private var busy = false

    var body: some View {
        SheetForm(title: "Change email", busy: busy, error: errorText, onSave: save) {
            TextField("New email", text: $newEmail)
                .keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
            RevealableSecureField(placeholder: "Current password", text: $password, contentType: .password)
        }
    }

    private func save() async {
        busy = true; defer { busy = false }
        do {
            let email = try await env.api.changeEmail(password: password, newEmail: newEmail) ?? newEmail
            env.applyUser(User(email: email, name: current.name))
            dismiss()
        } catch let e as APIError { errorText = e.userMessage }
        catch { errorText = error.localizedDescription }
    }
}

struct ChangePasswordSheet: View {
    @EnvironmentObject var env: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    @State private var current = ""
    @State private var newPassword = ""
    @State private var errorText: String?
    @State private var busy = false

    var body: some View {
        SheetForm(title: "Change password", busy: busy, error: errorText, onSave: save) {
            RevealableSecureField(placeholder: "Current password", text: $current, contentType: .password)
            RevealableSecureField(placeholder: "New password (10+ chars)", text: $newPassword, contentType: .newPassword)
        }
    }

    private func save() async {
        busy = true; defer { busy = false }
        do {
            try await env.api.changePassword(currentPassword: current, newPassword: newPassword)
            dismiss()
        } catch let e as APIError { errorText = e.userMessage }
        catch { errorText = error.localizedDescription }
    }
}

/// The GitHub-style phrase a user must type to confirm account deletion.
private let deleteConfirmPhrase = "DELETE ACCOUNT DATA"

struct DeleteAccountSheet: View {
    @EnvironmentObject var env: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var code = ""
    @State private var confirmText = ""
    @State private var errorText: String?
    @State private var busy = false

    private var canDelete: Bool {
        !busy && !password.isEmpty && confirmText.trimmingCharacters(in: .whitespaces) == deleteConfirmPhrase
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("This permanently deletes your account and all data. This can't be undone.")
                        .font(Theme.ui(13)).foregroundStyle(Theme.muted)
                    RevealableSecureField(placeholder: "Password", text: $password, contentType: .password)
                }
                Section {
                    TextField("Authenticator code (if 2FA is on)", text: $code)
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                } footer: {
                    Text("Required only if you have two-factor authentication enabled.")
                }
                Section {
                    TextField(deleteConfirmPhrase, text: $confirmText)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                } header: {
                    Text("Type \(deleteConfirmPhrase) to confirm")
                }
                if let errorText {
                    Section { FormErrorBanner(message: errorText) }
                }
            }
            .navigationTitle("Delete account").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .destructiveAction) {
                    Button("Delete") { Task { await delete() } }
                        .disabled(!canDelete)
                }
            }
        }
    }

    private func delete() async {
        busy = true; defer { busy = false }
        do {
            try await env.api.deleteAccount(password: password, code: code.trimmingCharacters(in: .whitespaces))
            dismiss()
            env.didDeleteAccount()
        } catch let e as APIError { errorText = e.userMessage }
        catch { errorText = error.localizedDescription }
    }
}

/// Erase chosen groups of data while keeping the account + settings. Same
/// gate as deletion: password plus a TOTP code when 2FA is enrolled.
struct ClearDataSheet: View {
    @EnvironmentObject var env: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var code = ""
    @State private var groups: Set<String> = []
    @State private var errorText: String?
    @State private var busy = false

    private let options: [(id: String, label: String)] = [
        ("bills", "Bills (and their payment history)"),
        ("cards", "Cards & loans (and their payment history)"),
        ("payments", "All payment history"),
        ("bank", "Connected bank data"),
    ]

    private var canClear: Bool { !busy && !password.isEmpty && !groups.isEmpty }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Erase chosen data while keeping your account and settings. This can't be undone.")
                        .font(Theme.ui(13)).foregroundStyle(Theme.muted)
                } header: { Text("What to clear") }
                Section {
                    ForEach(options, id: \.id) { opt in
                        Toggle(opt.label, isOn: Binding(
                            get: { groups.contains(opt.id) },
                            set: { on in if on { groups.insert(opt.id) } else { groups.remove(opt.id) } }
                        ))
                    }
                }
                Section {
                    RevealableSecureField(placeholder: "Password", text: $password, contentType: .password)
                    TextField("Authenticator code (if 2FA is on)", text: $code)
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                }
                if let errorText {
                    Section { FormErrorBanner(message: errorText) }
                }
            }
            .navigationTitle("Clear data").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .destructiveAction) {
                    Button("Clear") { Task { await clear() } }
                        .disabled(!canClear)
                }
            }
        }
    }

    private func clear() async {
        busy = true; defer { busy = false }
        do {
            try await env.api.clearData(
                password: password,
                code: code.trimmingCharacters(in: .whitespaces),
                groups: Array(groups)
            )
            await env.store?.load()
            dismiss()
        } catch let e as APIError { errorText = e.userMessage }
        catch { errorText = error.localizedDescription }
    }
}

// MARK: - TOTP

struct TotpSetupSheet: View {
    @EnvironmentObject var env: AppEnvironment
    @Environment(\.dismiss) private var dismiss

    private enum Step { case password, scan, done }
    @State private var step: Step = .password
    @State private var password = ""
    @State private var code = ""
    @State private var setup: TotpSetup?
    @State private var backupCodes: [String] = []
    @State private var errorText: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                switch step {
                case .password:
                    Section("Confirm your password") {
                        RevealableSecureField(placeholder: "Password", text: $password, contentType: .password)
                    }
                case .scan:
                    Section("Scan in your authenticator app") {
                        if let setup, let img = imageFromDataURL(setup.qrDataUrl) {
                            Image(uiImage: img).resizable().interpolation(.none)
                                .frame(width: 200, height: 200).frame(maxWidth: .infinity)
                                .accessibilityLabel("Authenticator QR code")
                                .accessibilityHint("Scan with your authenticator app")
                        }
                        if let setup {
                            LabeledContent("Secret", value: setup.secret)
                                .font(Theme.mono(13))
                        }
                        TextField("6-digit code", text: $code).keyboardType(.numberPad)
                    }
                case .done:
                    Section("Save these backup codes") {
                        Text("Each works once if you lose your authenticator.")
                            .font(Theme.ui(12)).foregroundStyle(Theme.muted)
                        ForEach(backupCodes, id: \.self) { c in
                            Text(c).font(Theme.mono(15))
                                .accessibilityLabel("Backup code \(c)")
                        }
                    }
                }
                if let errorText { Section { FormErrorBanner(message: errorText) } }
            }
            .navigationTitle("Authenticator app").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(step == .done ? "Done" : "Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    switch step {
                    case .password: Button("Continue") { Task { await beginSetup() } }.disabled(busy || password.isEmpty)
                    case .scan: Button("Verify") { Task { await confirm() } }.disabled(busy || code.count < 6)
                    case .done: EmptyView()
                    }
                }
            }
        }
    }

    private func beginSetup() async {
        busy = true; defer { busy = false }
        do { setup = try await env.api.totpSetup(password: password); step = .scan; errorText = nil }
        catch let e as APIError { errorText = e.userMessage }
        catch { errorText = error.localizedDescription }
    }

    private func confirm() async {
        busy = true; defer { busy = false }
        do { backupCodes = try await env.api.totpConfirm(code: code); step = .done; errorText = nil }
        catch let e as APIError { errorText = e.userMessage }
        catch { errorText = error.localizedDescription }
    }
}

struct TotpDisableSheet: View {
    @EnvironmentObject var env: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var code = ""
    @State private var errorText: String?
    @State private var busy = false

    var body: some View {
        SheetForm(title: "Turn off authenticator", busy: busy, error: errorText, saveTitle: "Turn off", destructive: true, onSave: disable) {
            RevealableSecureField(placeholder: "Password", text: $password, contentType: .password)
            TextField("Current 6-digit code", text: $code).keyboardType(.numberPad)
        }
    }

    private func disable() async {
        busy = true; defer { busy = false }
        do { try await env.api.totpDisable(password: password, code: code); dismiss() }
        catch let e as APIError { errorText = e.userMessage }
        catch { errorText = error.localizedDescription }
    }
}

struct BackupCodesSheet: View {
    @EnvironmentObject var env: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var code = ""
    @State private var codes: [String] = []
    @State private var errorText: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                if codes.isEmpty {
                    Section("Confirm to regenerate") {
                        RevealableSecureField(placeholder: "Password", text: $password, contentType: .password)
                        TextField("Current 6-digit code", text: $code).keyboardType(.numberPad)
                    }
                } else {
                    Section("New backup codes") {
                        ForEach(codes, id: \.self) { c in
                            Text(c).font(Theme.mono(15))
                                .accessibilityLabel("Backup code \(c)")
                        }
                    }
                }
                if let errorText { Section { FormErrorBanner(message: errorText) } }
            }
            .navigationTitle("Backup codes").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(codes.isEmpty ? "Cancel" : "Done") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if codes.isEmpty {
                        Button("Regenerate") { Task { await regen() } }.disabled(busy || code.count < 6)
                    }
                }
            }
        }
    }

    private func regen() async {
        busy = true; defer { busy = false }
        do { codes = try await env.api.regenerateBackupCodes(password: password, code: code); errorText = nil }
        catch let e as APIError { errorText = e.userMessage }
        catch { errorText = error.localizedDescription }
    }
}

// MARK: - Email MFA

struct EmailEnableSheet: View {
    @EnvironmentObject var env: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    let email: String

    private enum Step { case password, code }
    @State private var step: Step = .password
    @State private var password = ""
    @State private var code = ""
    @State private var challengeId = ""
    @State private var errorText: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                switch step {
                case .password:
                    Section("Confirm your password") { RevealableSecureField(placeholder: "Password", text: $password, contentType: .password) }
                case .code:
                    Section("Enter the code we emailed to \(email)") {
                        TextField("6-digit code", text: $code).keyboardType(.numberPad)
                    }
                }
                if let errorText { Section { FormErrorBanner(message: errorText) } }
            }
            .navigationTitle("Email codes").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    switch step {
                    case .password: Button("Send code") { Task { await sendCode() } }.disabled(busy || password.isEmpty)
                    case .code: Button("Verify") { Task { await confirm() } }.disabled(busy || code.count < 6)
                    }
                }
            }
        }
    }

    private func sendCode() async {
        busy = true; defer { busy = false }
        do { challengeId = try await env.api.emailMfaEnable(password: password); step = .code; errorText = nil }
        catch let e as APIError { errorText = e.userMessage }
        catch { errorText = error.localizedDescription }
    }

    private func confirm() async {
        busy = true; defer { busy = false }
        do { try await env.api.emailMfaConfirm(challengeId: challengeId, code: code); dismiss() }
        catch let e as APIError { errorText = e.userMessage }
        catch { errorText = error.localizedDescription }
    }
}

struct EmailDisableSheet: View {
    @EnvironmentObject var env: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var errorText: String?
    @State private var busy = false

    var body: some View {
        SheetForm(title: "Turn off email codes", busy: busy, error: errorText, saveTitle: "Turn off", destructive: true, onSave: disable) {
            RevealableSecureField(placeholder: "Password", text: $password, contentType: .password)
        }
    }

    private func disable() async {
        busy = true; defer { busy = false }
        do { try await env.api.emailMfaDisable(password: password); dismiss() }
        catch let e as APIError { errorText = e.userMessage }
        catch { errorText = error.localizedDescription }
    }
}

// MARK: - Timezone

struct TimezoneSheet: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss

    private var currentID: String { store.data.settings.timezone ?? "auto" }

    var body: some View {
        NavigationStack {
            List {
                ForEach(CommonTimeZones.groups, id: \.0) { group in
                    Section(group.0) {
                        ForEach(group.1, id: \.self) { id in
                            Button {
                                store.setTimezone(id == "auto" ? nil : id)
                                dismiss()
                            } label: {
                                HStack {
                                    Text(CommonTimeZones.label(id)).foregroundStyle(Theme.text)
                                    Spacer()
                                    if id == currentID {
                                        HStack(spacing: 4) {
                                            Image(systemName: "checkmark")
                                            Text("Selected")
                                                .font(Theme.ui(12, weight: .medium))
                                        }
                                        .foregroundStyle(Theme.accent)
                                        .accessibilityHidden(true)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Time zone").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
        }
    }
}

// MARK: - Shared form scaffold

/// A simple confirm/save sheet: fields + optional error + Save button.
struct SheetForm<Content: View>: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    var busy: Bool = false
    var error: String?
    var saveTitle: String = "Save"
    var destructive: Bool = false
    let onSave: () async -> Void
    @ViewBuilder var content: () -> Content
    var onAppear: () -> Void = {}

    var body: some View {
        NavigationStack {
            Form {
                Section { content() }
                if let error { Section { FormErrorBanner(message: error) } }
            }
            .navigationTitle(title).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: destructive ? .destructiveAction : .confirmationAction) {
                    Button(saveTitle) { Task { await onSave() } }.disabled(busy)
                }
            }
            .onAppear(perform: onAppear)
        }
    }
}
