import SwiftUI

/// External links surfaced from About → "Help & feedback" and the Mac
/// sidebar's links section.
enum MoreLink {
    static let website = URL(string: "https://fihaven.app/")!
    static let github = URL(string: "https://github.com/Greigh/FiHaven")!
    static let bugReport = URL(string: "https://github.com/Greigh/FiHaven/issues/new?template=bug_report.md")!
    static let suggestion = URL(string: "https://github.com/Greigh/FiHaven/issues/new?template=feature_request.md")!
}
