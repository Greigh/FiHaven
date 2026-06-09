import SwiftUI

/// About + open-source licensing.
///
/// FiHaven is AGPL-3.0. The iOS build bundles **no third-party runtime
/// dependencies** — it's built on Apple's SDKs (SwiftUI, Foundation) and
/// the first-party FiHavenCore package — so there are no upstream notices
/// to reproduce. We still surface the app's own license and a link to the
/// source, which the AGPL expects of a network-deployed service.
struct AboutView: View {
    @Environment(\.openURL) private var openURL

    private static let repoURL = URL(string: "https://github.com/Greigh/FiHaven")!
    private static let licenseURL = URL(string: "https://github.com/Greigh/FiHaven/blob/main/LICENSE")!

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

            Section("Open-source licenses") {
                Text("FiHaven for iOS uses Plaid's LinkKit for optional in-app bank connections, under the Plaid SDK License. Otherwise it's built on Apple's frameworks (SwiftUI, Foundation) and the first-party FiHavenCore package.")
                    .font(Theme.ui(13)).foregroundStyle(Theme.muted)
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
