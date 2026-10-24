import SwiftUI

/// About + licensing.
///
/// FiHaven is owned by Greigh Studios LLC and source available under the
/// Greigh Studios Source Available License (see LICENSE on GitHub), with an
/// optional Pro subscription on the hosted service. The iOS build's third-party runtime
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
        #if canImport(UIKit)
        listBody
        #else
        macBody
        #endif
    }

    #if !canImport(UIKit)
    /// The Mac's About pane: a centred branded column rather than the
    /// edge-to-edge settings list. A table of links is right on a phone and
    /// reads as an empty spreadsheet at 960pt — the hero carries the product
    /// identity the screen exists to state, and the same link groups keep
    /// their order inside cards.
    private var macBody: some View {
        ScrollView {
            VStack(spacing: 22) {
                hero

                group("Source") {
                    macLink("License", value: "Source available", url: Self.licenseURL)
                    hairline
                    macLink("View source", url: Self.repoURL)
                }

                group("Help & feedback") {
                    macLink("Website", url: MoreLink.website)
                    hairline
                    macLink("Report a bug", url: MoreLink.bugReport)
                    hairline
                    macLink("Suggest a feature", url: MoreLink.suggestion)
                }

                group("Legal") {
                    macLink("Privacy Policy", url: Self.privacyURL)
                    hairline
                    macLink("Terms of Use", url: Self.termsURL)
                }

                group("Third-party licenses") {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("FiHaven is free to use on the hosted service, with an optional Pro subscription.")
                            .font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.text)
                        Text("This app bundles the following third-party resources:")
                            .font(Theme.ui(13)).foregroundStyle(Theme.muted)
                        Text("• Plaid LinkKit: Plaid SDK License\n• Manrope Font: SIL Open Font License 1.1\n• IBM Plex Mono Font: SIL Open Font License 1.1")
                            .font(Theme.ui(13)).foregroundStyle(Theme.muted)
                    }
                    .padding(14)
                }

                VStack(spacing: 6) {
                    Text("Source is published on GitHub for transparency. You may not operate a public hosted copy or redistribute modified builds without permission.")
                    Text("© 2026 Greigh Studios LLC. All rights reserved.")
                }
                .font(Theme.ui(12)).foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .padding(.top, 4)
            }
            .padding(32)
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
        }
        .background(Theme.bg.ignoresSafeArea())
        .navigationTitle("About")
    }

    /// The centred hero: brand mark on the intro's gradient disc, the
    /// wordmark, and the version where the eye lands first — as a pill,
    /// the same treatment the sidebar gives the Pro badge.
    private var hero: some View {
        VStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(LinearGradient(
                        colors: [Theme.accent.opacity(0.18), Theme.accent.opacity(0.06)],
                        startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 120, height: 120)
                BrandMark(size: 64)
            }
            .accessibilityHidden(true)
            Wordmark(size: 24, showMark: false)
                .accessibilityHidden(true)
            Text(version)
                .font(Theme.ui(12, weight: .semibold))
                .foregroundStyle(Theme.accent)
                .padding(.horizontal, 10).padding(.vertical, 4)
                .background(Theme.accentBg, in: Capsule())
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("FiHaven version \(version)")
    }

    /// A section label above a card of rows — the grouping the iOS list
    /// gets from its section headers.
    private func group<C: View>(_ title: String, @ViewBuilder content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(Theme.ui(12, weight: .medium))
                .foregroundStyle(Theme.muted)
                .padding(.leading, 4)
            VStack(spacing: 0) { content() }
                .ctCard(padding: 0)
        }
    }

    private var hairline: some View {
        Rectangle().fill(Theme.border.opacity(0.7)).frame(height: 1)
            .padding(.leading, 14)
    }

    /// One card row that opens a link. `MacLinkRow` carries its own hover
    /// state so the pointer gets the same surface2 highlight a table row
    /// does elsewhere on the Mac.
    private func macLink(_ title: String, value: String? = nil, url: URL) -> some View {
        MacLinkRow(title: title, value: value) { openURL(url) }
    }
    #endif

    /// The shared list — what every platform except the Mac still gets.
    private var listBody: some View {
        List {
            Section("FiHaven") {
                LabeledContent("Version", value: version)
                Button { openURL(Self.licenseURL) } label: {
                    LabeledContent("License", value: "Source available")
                }
                Button("View source") { openURL(Self.repoURL) }
            }

            Section("Help & feedback") {
                Button { openURL(MoreLink.website) } label: {
                    LabeledContent("Website") { Image(systemName: "arrow.up.right.square") }
                }
                .accessibilityHint("Opens in browser")
                Button { openURL(MoreLink.bugReport) } label: {
                    LabeledContent("Report a bug") { Image(systemName: "arrow.up.right.square") }
                }
                .accessibilityHint("Opens in browser")
                Button { openURL(MoreLink.suggestion) } label: {
                    LabeledContent("Suggest a feature") { Image(systemName: "arrow.up.right.square") }
                }
                .accessibilityHint("Opens in browser")
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
                VStack(alignment: .leading, spacing: 6) {
                    Text("Source is published on GitHub for transparency. You may not operate a public hosted copy or redistribute modified builds without permission.")
                    Text("© 2026 Greigh Studios LLC. All rights reserved.")
                }
                .font(Theme.ui(12)).foregroundStyle(Theme.muted)
            }
        }
        .ctGroupedList()
        .scrollContentBackground(.hidden)
        .ctReadableList()
        .background(Theme.bg.ignoresSafeArea())
        .navigationTitle("About")
    }
}

#if !canImport(UIKit)
/// A card row that opens a URL: label, optional trailing value, and the
/// outward-link glyph. `.plain` on the button so the label is drawn as-is
/// (`ctPlainButton`'s reasoning); the row's own surface2 highlight on hover
/// is the affordance a Mac pointer expects instead of a bezel.
private struct MacLinkRow: View {
    let title: String
    var value: String? = nil
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Text(title)
                    .font(Theme.ui(13))
                    .foregroundStyle(Theme.text)
                Spacer(minLength: 0)
                if let value {
                    Text(value)
                        .font(Theme.ui(13))
                        .foregroundStyle(Theme.muted)
                }
                Image(systemName: "arrow.up.right.square")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.muted)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(hovering ? Theme.surface2 : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .accessibilityHint("Opens in browser")
    }
}
#endif
