import SwiftUI
import FiHavenCore

/// Pick every day a bill reminder should fire — a week out AND the morning
/// of, if that's what you want. Writes the synced `reminderOffsets` setting,
/// which drives on-device notifications, server push, and the reminder email
/// alike. Saves on every tap; there's nothing to confirm.
struct ReminderDaysView: View {
    @EnvironmentObject var store: AppStore

    static let choices = [0, 1, 2, 3, 5, 7, 10, 14]

    private var picked: [Int] { store.data.settings.reminderOffsets }
    private var atCap: Bool { picked.count >= Settings.maxReminderOffsets }

    var body: some View {
        List {
            Section {
                ForEach(Self.choices, id: \.self) { day in
                    row(day)
                }
            } footer: {
                Text(footer)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.bg.ignoresSafeArea())
        .navigationTitle("Remind me")
    }

    private func row(_ day: Int) -> some View {
        let on = picked.contains(day)
        // Only the unpicked rows lock at the cap — deselecting is always open.
        let locked = atCap && !on
        return Button {
            toggle(day)
        } label: {
            HStack {
                Text(Self.label(day))
                    .foregroundStyle(locked ? Theme.muted : Theme.text)
                Spacer()
                if on {
                    Image(systemName: "checkmark")
                        .foregroundStyle(Theme.accent)
                        .fontWeight(.semibold)
                }
            }
        }
        .disabled(locked)
    }

    private var footer: String {
        if picked.isEmpty {
            return "No reminder days picked — bill, trial, and offer reminders won't fire."
        }
        return "Pick up to \(Settings.maxReminderOffsets) days. These apply to on-device reminders, push, and email."
    }

    private func toggle(_ day: Int) {
        var next = picked
        if let i = next.firstIndex(of: day) { next.remove(at: i) } else { next.append(day) }
        store.setReminderOffsets(next)
    }

    static func label(_ d: Int) -> String {
        d == 0 ? "On the due day" : (d == 1 ? "1 day before" : "\(d) days before")
    }

    /// "3 days before" / "7 days before + 2 more" — the value shown on the
    /// Settings row that links here.
    static func summary(_ days: [Int]) -> String {
        guard let first = days.first else { return "None" }
        if days.count == 1 { return label(first) }
        return "\(label(first)) + \(days.count - 1) more"
    }
}
