import SwiftUI
import UIKit
import FiHavenCore

/// Draws a bundled issuer brand mark (`IssuerLogos`) as a vector.
///
/// SwiftUI can't read SVG, so `SVGPath` in the core turns the mark's path
/// data into move/line/curve segments and this maps them onto a `Path`,
/// scaled from the 24x24 authoring grid into whatever frame it's given.
/// Marks are single-path and use the non-zero fill rule, like the web's
/// `<svg><path/></svg>`.
struct IssuerLogoShape: Shape {
    let segments: [SVGPathSegment]

    func path(in rect: CGRect) -> Path {
        var path = Path()
        guard !segments.isEmpty else { return path }

        // Uniform scale, centered — never stretch a logo.
        let scale = min(rect.width, rect.height) / 24
        let offsetX = rect.minX + (rect.width - 24 * scale) / 2
        let offsetY = rect.minY + (rect.height - 24 * scale) / 2
        func point(_ p: SVGPoint) -> CGPoint {
            CGPoint(x: offsetX + p.x * scale, y: offsetY + p.y * scale)
        }

        for segment in segments {
            switch segment {
            case .move(let to):
                path.move(to: point(to))
            case .line(let to):
                path.addLine(to: point(to))
            case .curve(let c1, let c2, let to):
                path.addCurve(to: point(to), control1: point(c1), control2: point(c2))
            case .close:
                path.closeSubpath()
            }
        }
        return path
    }
}

/// Parsed marks, kept for the process lifetime — the same handful of logos
/// is re-rendered on every scroll, and parsing is pure work we can skip.
enum IssuerLogoCache {
    private static let segments: [String: [SVGPathSegment]] = IssuerLogos.all.mapValues {
        SVGPath.parse($0.path)
    }

    /// Segments for a logo key, or nil if it isn't bundled / failed to parse.
    static func lookup(_ key: String) -> [SVGPathSegment]? {
        guard let parsed = segments[key], !parsed.isEmpty else { return nil }
        return parsed
    }
}

/// An issuer mark at `size`, falling back to the emoji stand-in when the
/// key isn't bundled.
struct IssuerLogoView: View {
    let key: String
    var size: CGFloat = 22
    var fallbackEmoji: String = "💳"

    var body: some View {
        if let segments = IssuerLogoCache.lookup(key), let logo = IssuerLogos.logo(key) {
            IssuerLogoShape(segments: segments)
                .fill(Theme.brand(logo.color), style: FillStyle(eoFill: false))
                .frame(width: size, height: size)
        } else {
            Text(fallbackEmoji)
                .font(.system(size: size))
                .lineLimit(1)
                .minimumScaleFactor(0.5)
        }
    }
}
