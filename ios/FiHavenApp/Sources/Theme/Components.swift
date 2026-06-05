import SwiftUI

/// A surface "card": padded, rounded, hairline border — the web's `.card`.
struct CardBackground: ViewModifier {
    var padding: CGFloat = 16
    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radiusCard, style: .continuous)
                    .stroke(Theme.border, lineWidth: 1)
            )
    }
}

extension View {
    func ctCard(padding: CGFloat = 16) -> some View {
        modifier(CardBackground(padding: padding))
    }
}

/// The FiHaven wordmark.
struct Wordmark: View {
    var size: CGFloat = 30
    var body: some View {
        HStack(spacing: 0) {
            Text("Clear").foregroundStyle(Theme.text)
            Text("Tab").foregroundStyle(Theme.accent)
        }
        .font(Theme.title(size))
    }
}

/// Accent-filled primary button label.
struct PrimaryButtonStyle: ButtonStyle {
    var enabled: Bool = true
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Theme.ui(16, weight: .semibold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(enabled ? Theme.accent : Theme.muted.opacity(0.4))
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusPill, style: .continuous))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

/// The web's footer credit: "Made with ♥ by Daniel Hipskind".
struct MadeWithLove: View {
    var body: some View {
        HStack(spacing: 0) {
            Text("Made with ")
            Text("♥").foregroundStyle(Theme.red)
            Text(" by ")
            Link("Daniel Hipskind", destination: URL(string: "https://danielhipskind.com")!)
                .foregroundStyle(Theme.accent)
        }
        .font(Theme.ui(13))
        .foregroundStyle(Theme.muted)
        .multilineTextAlignment(.center)
    }
}

/// A small uppercase mono label, like the web's `data-label`.
struct FieldLabel: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(Theme.mono(10, weight: .medium))
            .tracking(0.8)
            .foregroundStyle(Theme.muted)
    }
}
