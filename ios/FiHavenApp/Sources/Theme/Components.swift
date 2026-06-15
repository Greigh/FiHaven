import SwiftUI

/// A surface "card": padded, rounded, hairline border — the web's `.card`.
struct CardBackground: ViewModifier {
    var padding: CGFloat = 16
    var branded: Bool = false
    func body(content: Content) -> some View {
        VStack(spacing: 0) {
            if branded {
                Theme.accent.frame(height: 3)
            }
            content
                .padding(padding)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radiusCard, style: .continuous)
                .stroke(Theme.border, lineWidth: 1)
        )
    }
}

extension View {
    func ctCard(padding: CGFloat = 16, branded: Bool = false) -> some View {
        modifier(CardBackground(padding: padding, branded: branded))
    }
}

/// The FiHaven wordmark with optional brand mark.
struct Wordmark: View {
    var size: CGFloat = 30
    var showMark: Bool = true
    var body: some View {
        HStack(spacing: 10) {
            if showMark { BrandMark(size: size * 0.85) }
            HStack(spacing: 0) {
                Text("Fi").foregroundStyle(Theme.text)
                Text("Haven").foregroundStyle(Theme.accent)
            }
            .font(Theme.title(size))
        }
    }
}

/// Fi monogram on a rounded accent tile — matches `client/public/icon.svg`.
struct BrandMark: View {
    var size: CGFloat = 26
    var body: some View {
        Canvas { ctx, canvasSize in
            let s = canvasSize.width / 64
            let tile = Path(roundedRect: CGRect(origin: .zero, size: canvasSize),
                            cornerSize: CGSize(width: 15 * s, height: 15 * s))
            ctx.fill(tile, with: .color(Theme.accent))

            func bar(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) {
                let path = Path(roundedRect: CGRect(x: x * s, y: y * s, width: w * s, height: h * s),
                                cornerSize: CGSize(width: 2 * s, height: 2 * s))
                ctx.fill(path, with: .color(.white))
            }
            // "F"
            bar(16, 17, 7, 30)
            bar(16, 17, 22, 7)
            bar(16, 29, 17, 6)
            // "i"
            bar(41, 27, 7, 20)
            let dotR: CGFloat = 4 * s
            ctx.fill(
                Path(ellipseIn: CGRect(x: (44.5 - 4) * s, y: (20 - 4) * s, width: dotR * 2, height: dotR * 2)),
                with: .color(.white)
            )
        }
        .frame(width: size, height: size)
    }
}

/// Toolbar title row: Fi monogram + screen name (matches the web appbar).
struct BrandedNavTitle: View {
    let title: String
    var markSize: CGFloat = 22

    var body: some View {
        HStack(spacing: 8) {
            BrandMark(size: markSize)
            Text(title).font(Theme.title(17)).foregroundStyle(Theme.text)
        }
    }
}

extension View {
    /// Inline navigation bar with the FiHaven mark beside the screen title.
    func brandedNavigationBar(_ title: String) -> some View {
        navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    BrandedNavTitle(title: title)
                }
            }
    }
}

/// A password field with a show/hide (eye) toggle. Swaps between a
/// `SecureField` and a plain `TextField`, keeping focus across the toggle.
struct RevealableSecureField: View {
    let placeholder: String
    @Binding var text: String
    var contentType: UITextContentType? = nil
    @State private var reveal = false
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 8) {
            Group {
                if reveal {
                    TextField(placeholder, text: $text)
                } else {
                    SecureField(placeholder, text: $text)
                }
            }
            .textContentType(contentType)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .focused($focused)

            Button {
                reveal.toggle()
                DispatchQueue.main.async { focused = true }   // keep the keyboard up
            } label: {
                Image(systemName: reveal ? "eye.slash.fill" : "eye.fill")
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 24, height: 24)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(reveal ? "Hide password" : "Show password")
        }
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
        HStack(spacing: 4) {
            Text("Made with")
            Text("♥").foregroundStyle(Theme.red)
            Text("by")
            Link("Daniel Hipskind", destination: URL(string: "https://danielhipskind.com")!)
                .foregroundStyle(Theme.accent)
        }
        .font(Theme.ui(13))
        .foregroundStyle(Theme.muted)
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
