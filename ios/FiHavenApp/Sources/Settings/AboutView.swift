import SwiftUI

/// About + open-source licensing.
///
/// FiHaven is AGPL-3.0, free software with an optional Pro subscription. The
/// iOS build's only third-party runtime dependency is Plaid's LinkKit (Plaid
/// SDK License); it otherwise runs on Apple's SDKs (SwiftUI, Foundation), the
/// first-party FiHavenCore package, and bundled fonts (SIL OFL 1.1). We surface
/// the app's own license + source, which the AGPL expects of a network service.
struct AboutView: View {
    @Environment(\.openURL) private var openURL

    private static let repoURL = URL(string: "https://github.com/Greigh/FiHaven")!
    private static let licenseURL = URL(string: "https://github.com/Greigh/FiHaven/blob/main/LICENSE")!
    private static let privacyURL = URL(string: "https://fihaven.app/privacy")!
    private static let termsURL = URL(string: "https://fihaven.app/terms")!

    private var version: String {
        let v = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—"
        let b = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""
        return b.isEmpty ? v : "\(v) (\(b))"
    }

    var body: some View {
        List {
            Section("FiHaven") {
                LabeledContent("Version", value: version)
                Button { openURL(Self.licenseURL) } label: {
                    LabeledContent("License", value: "AGPL-3.0")
                }
                Button("View source") { openURL(Self.repoURL) }
            }

            Section("Legal") {
                Button { openURL(Self.privacyURL) } label: {
                    LabeledContent("Privacy Policy") { Image(systemName: "arrow.up.right.square") }
                }
                .accessibilityHint("Opens in browser")
                Button { openURL(Self.termsURL) } label: {
                    LabeledContent("Terms of Use") { Image(systemName: "arrow.up.right.square") }
                }
                .accessibilityHint("Opens in browser")
            }

            Section("Open-source licenses") {
                VStack(alignment: .leading, spacing: 8) {
                    Text("FiHaven is free software with an optional subscription purchase.")
                        .font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.text)
                    Text("It bundles the following open-source resources:")
                        .font(Theme.ui(13)).foregroundStyle(Theme.muted)
                    Text("• Plaid LinkKit: Plaid SDK License\n• Manrope Font: SIL Open Font License 1.1\n• IBM Plex Mono Font: SIL Open Font License 1.1")
                        .font(Theme.ui(13)).foregroundStyle(Theme.muted)
                }
            }

            Section {
                Text("FiHaven is free software. If you run a modified version as a network service, the AGPL requires you to offer its source to your users.")
                    .font(Theme.ui(12)).foregroundStyle(Theme.muted)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.bg.ignoresSafeArea())
        .navigationTitle("About")
    }
}
