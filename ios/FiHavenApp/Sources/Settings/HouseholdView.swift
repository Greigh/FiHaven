import SwiftUI
import FiHavenCore

/// Family / household management (Phases 1–3): create or join, invite + manage
/// members, and see shared finances update live over the SSE stream.
@MainActor
final class HouseholdModel: ObservableObject {
    @Published var info: HouseholdInfo?
    @Published var entities: [SharedEntity] = []
    @Published var error: String?
    @Published var loaded = false
    @Published var busy = false

    let myEmail: String
    private let api: APIClient
    private var streamTask: Task<Void, Never>?

    init(api: APIClient, myEmail: String) {
        self.api = api
        self.myEmail = myEmail
    }

    var view: HouseholdView? { info?.household }

    func load() async {
        do {
            info = try await api.getHousehold()
            if info?.household != nil {
                await loadShared()
            } else {
                entities = []
                stopStream()
            }
        } catch {
            self.error = describe(error)
        }
        loaded = true
    }

    func loadShared() async {
        do {
            let data = try await api.getHouseholdSharedData()
            entities = data.entities
            startStream(since: data.seq ?? 0)
        } catch { /* snapshot best-effort */ }
    }

    private func startStream(since: Int64) {
        stopStream()
        streamTask = Task { [weak self] in
            guard let self else { return }
            do {
                for try await ent in self.api.householdStream(since: since) {
                    self.apply(ent)
                }
            } catch { /* dropped; reload on next appear */ }
        }
    }

    func stopStream() { streamTask?.cancel(); streamTask = nil }

    private func apply(_ e: SharedEntity) {
        if let i = entities.firstIndex(where: { $0.kind == e.kind && $0.id == e.id }) {
            if e.deleted == true { entities.remove(at: i) } else { entities[i] = e }
        } else if e.deleted != true {
            entities.append(e)
        }
    }

    func memberLabel(_ userId: Int) -> String {
        guard let m = view?.members.first(where: { $0.userId == userId }) else { return "Household" }
        return m.email.lowercased() == myEmail.lowercased() ? "You" : (m.name ?? m.email)
    }

    // ── Actions ──────────────────────────────────────────────────────
    func create(name: String) async { await act { _ = try await self.api.createHousehold(name: name) } }
    func invite(email: String) async { await act { _ = try await self.api.inviteToHousehold(email: email) } }
    func accept(token: String) async { await act { _ = try await self.api.acceptHouseholdInvite(token: token) } }
    func remove(userId: Int) async { await act { _ = try await self.api.removeHouseholdMember(userId: userId) } }
    func leave() async { await act { try await self.api.leaveHousehold() } }

    private func act(_ op: @escaping () async throws -> Void) async {
        busy = true; error = nil
        do { try await op(); await load() }
        catch { self.error = describe(error) }
        busy = false
    }

    private func describe(_ e: Error) -> String {
        if let api = e as? APIError, case .http(_, let code) = api, let code { return Self.message(for: code) }
        if let api = e as? APIError, case .unauthenticated = api { return "Please sign in again." }
        return "Something went wrong. Please try again."
    }

    static func message(for code: String) -> String {
        switch code {
        case "pro-required": return "Household sharing is a Pro feature."
        case "already-in-household": return "You’re already in a household."
        case "not-owner": return "Only the household owner can do that."
        case "invalid-email": return "Enter a valid email address."
        case "already-member": return "That person is already in your household."
        case "household-full": return "Your household is full."
        case "invite-email-mismatch": return "That invite was sent to a different email."
        case "invite-expired": return "That invite has expired."
        case "invite-used": return "That invite was already used."
        case "invalid-invite": return "That invite code is invalid."
        default: return "Something went wrong. Please try again."
        }
    }
}

struct HouseholdSettingsView: View {
    @StateObject private var model: HouseholdModel
    @State private var name = ""
    @State private var inviteEmail = ""
    @State private var joinCode = ""
    @State private var showPaywall = false

    init(api: APIClient, myEmail: String) {
        _model = StateObject(wrappedValue: HouseholdModel(api: api, myEmail: myEmail))
    }

    var body: some View {
        List {
            if let error = model.error {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .foregroundStyle(Theme.red)
                    Text(error).font(Theme.ui(13)).foregroundStyle(Theme.text)
                }
                .accessibilityElement(children: .combine)
            }
            if !model.loaded {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else if let view = model.view {
                householdSections(view)
            } else {
                joinOrCreateSections()
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.bg.ignoresSafeArea())
        .brandedNavigationBar("Family")
        .task { await model.load() }
        .onDisappear { model.stopStream() }
        .sheet(isPresented: $showPaywall) { PaywallView() }
    }

    // ── No household yet ─────────────────────────────────────────────
    @ViewBuilder
    private func joinOrCreateSections() -> some View {
        if model.info?.canCreate == true {
            Section("Start a household") {
                TextField("Household name", text: $name)
                Button("Create household") {
                    Task { await model.create(name: name.isEmpty ? "My Household" : name) }
                }.disabled(model.busy)
            }
        } else {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        ProBadge()
                        Text("Family sharing").font(Theme.ui(15, weight: .semibold)).foregroundStyle(Theme.text)
                    }
                    Text("Start a household and invite up to three people with FiHaven Pro. Already invited? You can join below for free.")
                        .font(Theme.ui(14)).foregroundStyle(Theme.muted)
                    Button("Unlock FiHaven Pro") { showPaywall = true }
                        .buttonStyle(PrimaryButtonStyle())
                }
                .padding(.vertical, 2)
            }
        }
        Section("Have an invite code?") {
            TextField("Paste your invite code", text: $joinCode)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            Button("Join household") {
                Task { await model.accept(token: joinCode.trimmingCharacters(in: .whitespaces)); joinCode = "" }
            }.disabled(model.busy || joinCode.isEmpty)
        }
    }

    // ── In a household ───────────────────────────────────────────────
    @ViewBuilder
    private func householdSections(_ view: HouseholdView) -> some View {
        let isOwner = view.role == "owner"

        Section("Household") {
            HStack {
                Text(view.household.name).font(Theme.ui(16, weight: .semibold))
                Spacer()
                Text("\(view.memberCount)/\(view.memberMax)").foregroundStyle(Theme.muted)
            }
        }

        Section("Members") {
            ForEach(view.members, id: \.userId) { m in
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(m.name?.isEmpty == false ? m.name! : m.email).font(Theme.ui(15))
                        if m.name?.isEmpty == false { Text(m.email).font(Theme.ui(12)).foregroundStyle(Theme.muted) }
                    }
                    Spacer()
                    Text(m.role == "owner" ? "Owner" : "Member")
                        .font(Theme.ui(12)).foregroundStyle(m.role == "owner" ? Theme.accent : Theme.muted)
                    if isOwner && m.role != "owner" {
                        Button(role: .destructive) { Task { await model.remove(userId: m.userId) } } label: {
                            Image(systemName: "minus.circle")
                        }
                        .buttonStyle(.borderless)
                        .accessibilityIconButton("Remove \(m.name?.isEmpty == false ? m.name! : m.email)")
                    }
                }
            }
        }

        if isOwner {
            Section("Invite someone") {
                TextField("name@email.com", text: $inviteEmail)
                    .keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                Button("Send invite") {
                    Task { await model.invite(email: inviteEmail.trimmingCharacters(in: .whitespaces)); inviteEmail = "" }
                }.disabled(model.busy || inviteEmail.isEmpty)
            }
        }

        Section("Shared finances") {
            if model.entities.isEmpty {
                Text("Nothing shared yet. Share bills, cards, or goals from the web app.")
                    .font(Theme.ui(13)).foregroundStyle(Theme.muted)
            } else {
                ForEach(model.entities, id: \.uid) { e in
                    HStack {
                        Text(Self.title(e)).font(Theme.ui(15))
                        Spacer()
                        Text(model.memberLabel(e.ownerUserId)).font(Theme.ui(12)).foregroundStyle(Theme.muted)
                    }
                }
            }
        }

        Section {
            Button(role: .destructive) { Task { await model.leave() } } label: {
                Text(isOwner ? "Leave (transfers or dissolves)" : "Leave household")
            }
        }
    }

    private static func title(_ e: SharedEntity) -> String {
        if case .object(let o) = e.data {
            if case .string(let name)? = o["name"] { return name }
            if case .string(let merchant)? = o["merchant"] { return merchant }
        }
        return e.kind.capitalized
    }
}
