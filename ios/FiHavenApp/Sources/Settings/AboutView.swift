import SwiftUI

/// About + licensing.
///
/// FiHaven is source available (see LICENSE on GitHub), with an optional Pro
/// subscription on the hosted service. The iOS build's third-party runtime
/// dependency is Plaid's LinkKit (Plaid SDK License); it otherwise runs on
/// Apple's SDKs, FiHavenCore, and bundled fonts (SIL OFL 1.1).
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
                    LabeledContent("License", value: "Source available")
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

            Section("Third-party licenses") {
                VStack(alignment: .leading, spacing: 8) {
                    Text("FiHaven is free to use on the hosted service, with an optional Pro subscription.")
                        .font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.text)
                    Text("This app bundles the following third-party resources:")
                        .font(Theme.ui(13)).foregroundStyle(Theme.muted)
                    Text("• Plaid LinkKit: Plaid SDK License\n• Manrope Font: SIL Open Font License 1.1\n• IBM Plex Mono Font: SIL Open Font License 1.1")
                        .font(Theme.ui(13)).foregroundStyle(Theme.muted)
                }
            }

            Section {
                Text("Source is published on GitHub for transparency. You may not operate a public hosted copy or redistribute modified builds without permission.")
                    .font(Theme.ui(12)).foregroundStyle(Theme.muted)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.bg.ignoresSafeArea())
        .navigationTitle("About")
    }
}
