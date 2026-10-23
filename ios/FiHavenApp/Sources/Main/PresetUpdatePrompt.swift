import SwiftUI
import FiHavenCore

/// "The shared card catalog has newer rates for this card" — an offer to take
/// the catalog numbers or keep the ones already typed.
///
/// This used to be an `.alert` on `MainTabView`, which quietly made it part of
/// that shell rather than part of the app: a shell that isn't `MainTabView`
/// (the macOS `MacShellView`) lost the prompt entirely, and a Mac user would
/// never learn the catalog had moved. It hangs off whichever shell is on
/// screen instead.
struct PresetUpdatePrompt: ViewModifier {
    @EnvironmentObject var store: AppStore

    func body(content: Content) -> some View {
        content.alert(
            store.presetUpdatePrompt.map { prompt in
                let label = [prompt.card.issuer, prompt.card.name].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
                return "Update rates for \"\(label.isEmpty ? "Card" : label)\"?"
            } ?? "Update rates?",
            // Driven by the store, not by a local flag: the prompt appears when
            // a sync brings newer catalog rates and is answered by clearing it.
            isPresented: Binding(
                get: { store.presetUpdatePrompt != nil },
                set: { _ in }
            )
        ) {
            Button("Update rates") { store.acceptPresetUpdate() }
            Button("Keep mine", role: .cancel) { store.declinePresetUpdate() }
        } message: {
            if let prompt = store.presetUpdatePrompt {
                let catalog = "\(prompt.preset.issuer) \(prompt.preset.name)"
                let diff = Rewards.formatRateDiff(card: prompt.card, preset: prompt.preset)
                Text("The FiHaven catalog for \(catalog) has newer rates.\n\n\(diff.isEmpty ? "Rates changed in the shared catalog." : diff)\n\nUpdate applies catalog rates to this card. Keep mine leaves your numbers alone.")
            }
        }
    }
}

extension View {
    func presetUpdatePrompt() -> some View { modifier(PresetUpdatePrompt()) }
}
