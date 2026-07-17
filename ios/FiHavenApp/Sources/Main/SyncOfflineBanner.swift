import SwiftUI

/// Compact chrome banner when cloud sync failed — local edits remain on-device.
struct SyncOfflineBanner: View {
    @EnvironmentObject var store: AppStore
    @State private var dismissed = false

    var body: some View {
        Group {
            if store.syncState == .offline, !dismissed {
                HStack(alignment: .center, spacing: 10) {
                    Image(systemName: "icloud.slash")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.orange)
                    Text("You're offline — changes save on this device, not the cloud.")
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
                    .accessibilityLabel("Dismiss offline notice")
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
                .accessibilityLabel("Offline. Changes save on this device, not the cloud.")
            }
        }
        .animation(.easeInOut(duration: 0.2), value: store.syncState == .offline)
        .onChange(of: store.syncState) { _, new in
            if new != .offline { dismissed = false }
        }
    }
}
