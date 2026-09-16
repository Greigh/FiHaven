import SwiftUI

/// Compact chrome banner when cloud sync failed — local edits remain on-device.
struct SyncOfflineBanner: View {
    @EnvironmentObject var store: AppStore
    @State private var dismissed = false

    var body: some View {
        Group {
            if (store.syncState == .offline || store.syncState == .rejected), !dismissed {
                HStack(alignment: .center, spacing: 10) {
                    Image(systemName: store.syncState == .rejected ? "exclamationmark.triangle" : "icloud.slash")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(store.syncState == .rejected ? Theme.red : Theme.orange)
                    Text(store.syncState == .rejected
                        ? "Sync rejected — data exceeds server limit. Edits remain on this device."
                        : "Offline — your changes are saved on this device and will sync when you’re back online.")
                        .font(Theme.ui(13, weight: .medium))
                        .foregroundStyle(Theme.text)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                    Button {
                        dismissed = true
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(Theme.muted)
                            .padding(6)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Dismiss sync notice")
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
                .transition(.move(edge: .top).combined(with: .opacity))
                .accessibilityElement(children: .combine)
                .accessibilityLabel(store.syncState == .rejected
                    ? "Sync rejected. Data exceeds server limit. Edits remain on this device."
                    : "Offline. Your changes are saved on this device and will sync when you are back online.")
            }
        }
        .animation(.easeInOut(duration: 0.2), value: store.syncState)
        .onChange(of: store.syncState) { _, new in
            if new != .offline && new != .rejected { dismissed = false }
        }
    }
}
