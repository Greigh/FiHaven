import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// Curated IANA timezones for the Settings picker (mirrors tz.js).
enum CommonTimeZones {
    static let groups: [(String, [String])] = [
        ("Auto", ["auto"]),
        ("United States", [
            "America/New_York", "America/Detroit", "America/Chicago",
            "America/Denver", "America/Phoenix", "America/Los_Angeles",
            "America/Anchorage", "Pacific/Honolulu",
        ]),
        ("Americas", ["America/Toronto", "America/Vancouver", "America/Mexico_City", "America/Sao_Paulo"]),
        ("Europe", ["Europe/London", "Europe/Dublin", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam", "Europe/Stockholm", "Europe/Athens", "Europe/Istanbul"]),
        ("Asia", ["Asia/Dubai", "Asia/Kolkata", "Asia/Bangkok", "Asia/Singapore", "Asia/Hong_Kong", "Asia/Shanghai", "Asia/Tokyo", "Asia/Seoul"]),
        ("Pacific", ["Australia/Sydney", "Australia/Perth", "Pacific/Auckland"]),
        ("Other", ["UTC"]),
    ]

    static func label(_ id: String) -> String {
        id == "auto" ? "Auto (device)" : id.replacingOccurrences(of: "_", with: " ")
    }
}

/// Wraps UIActivityViewController for share/export.
#if os(iOS)
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
#endif

struct ShareItem: Identifiable {
    let id = UUID()
    let url: URL
}
