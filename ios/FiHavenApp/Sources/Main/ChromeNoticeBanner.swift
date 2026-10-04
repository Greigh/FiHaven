import SwiftUI

/// The chrome a content notice wears: an icon, a line of plain words, an
/// optional second line, and a dismiss button.
///
/// The sync notice and the session-saved notice are the same shape with
/// different sentences — both sit above the content, both are about something
/// the app is still doing correctly while the user should know about it — so
/// the shape is written once here rather than twice in two files.
struct ChromeNoticeBanner: View {
    let icon: String
    let tint: Color
    let message: String
    /// The second line, when the sentence is too long for a banner. Optional
    /// rather than a `VStack` of one, so the common case stays a single row.
    var detail: String? = nil
    /// What VoiceOver reads. Defaults to the words on screen, which is right
    /// unless the icon carries part of the meaning.
    var accessibilityLabel: String? = nil
    var dismissLabel: String = "Dismiss notice"
    let onDismiss: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(tint)
                .accessibilityHidden(true)
            // Greedy for the remaining width rather than a `Spacer` beside it.
            // A `Spacer` in an `HStack` inside a column SwiftUI is still
            // measuring takes the whole slack, so the text is offered its
            // *ideal* width — one unwrapped line — and the column's ideal
            // height follows the window's ideal width instead of the pane's.
            // Measured: with the spacer, the window proposed 1440x2870 and
            // then 1440x2984 (the table re-measuring against it), and the
            // screen captured empty. The same text with `.layoutPriority(1)`
            // and no spacer proposes 1440x900.
            text
                .frame(maxWidth: .infinity, alignment: .leading)
                .layoutPriority(1)
            Button {
                onDismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.muted)
                    .padding(6)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(dismissLabel)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Theme.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Theme.border, lineWidth: 1)
                )
        )
        .padding(.horizontal, 12)
        .padding(.top, 8)
        // The notice appears and disappears inside a column the window sizes
        // from, so the height change animates rather than snapping the content
        // under the titlebar. It was not the cause of the sizing fight measured
        // in `MacShellView` (a plain `Text` sibling reproduced it identically)
        // — with the column's ideal clamped there is nothing left to fight.
        .transition(.move(edge: .top).combined(with: .opacity))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel ?? [message, detail].compactMap { $0 }.joined(separator: ". "))
    }

    @ViewBuilder
    private var text: some View {
        if let detail {
            VStack(alignment: .leading, spacing: 2) {
                line(message)
                line(detail)
                    .font(Theme.ui(12, weight: .regular))
                    .foregroundStyle(Theme.muted)
            }
        } else {
            line(message)
        }
    }

    private func line(_ text: String) -> some View {
        Text(text)
            .font(Theme.ui(13, weight: .medium))
            .foregroundStyle(Theme.text)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// The keychain would not keep this session, said while the user is still here
/// to do something about it.
///
/// The refusal is otherwise silent: the session works, the app looks healthy,
/// and the cost lands on the *next* launch as a password prompt for a session
/// that is already signed in. This is the earlier half of that — see
/// `KeychainTokenStore.takeWriteRefusal` for the half that explains the
/// sign-out afterwards.
struct SessionNotSavedBanner: View {
    @EnvironmentObject var env: AppEnvironment
    @State private var dismissed = false

    var body: some View {
        Group {
            if let notice = env.sessionSaveNotice, !dismissed {
                ChromeNoticeBanner(
                    icon: "key.slash",
                    tint: Theme.orange,
                    message: "This session won't be remembered",
                    detail: notice,
                    dismissLabel: "Dismiss session notice"
                ) {
                    dismissed = true
                }
                // A new refusal in this same launch gets a new banner, rather
                // than a dismissed one that stays dismissed.
                .onChange(of: env.sessionSaveNotice) { _, new in
                    if new == nil { dismissed = false }
                }
            }
        }
        .animation(.easeInOut(duration: 0.2), value: env.sessionSaveNotice)
    }
}
