import SwiftUI
import UIKit
import FiHavenCore

/// Draws one layer of a bundled issuer brand mark (`IssuerLogos`) as a vector.
///
/// SwiftUI can't read SVG, so `SVGPath` in the core turns the mark's path
/// data into move/line/curve segments and this maps them onto a `Path`,
/// scaled from the authoring grid (`width` x 24) into whatever frame it's
/// given. Layers use the non-zero fill rule, like the web's `<svg><path/></svg>`.
struct IssuerLogoShape: Shape {
    let segments: [SVGPathSegment]
    /// viewBox width of the mark this layer belongs to; the height is 24.
    var viewBoxWidth: Double = 24

    func path(in rect: CGRect) -> Path {
        var path = Path()
        guard !segments.isEmpty else { return path }

        // Uniform scale, centered — never stretch a logo. Every layer of a
        // mark shares the viewBox, so they stay registered to each other.
        let boxWidth = CGFloat(viewBoxWidth)
        let scale = min(rect.width / boxWidth, rect.height / 24)
        let offsetX = rect.minX + (rect.width - boxWidth * scale) / 2
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
    /// One entry per layer, in paint order, paired with its fill.
    private static let layers: [String: [(color: UInt32, segments: [SVGPathSegment])]] =
        IssuerLogos.all.mapValues { logo in
            logo.layers.map { (color: $0.color, segments: SVGPath.parse($0.path)) }
        }

    /// Layers for a logo key, or nil if it isn't bundled. A layer that failed
    /// to parse is dropped; if every layer failed, the caller gets nil and
    /// falls back to the emoji stand-in.
    static func lookup(_ key: String) -> [(color: UInt32, segments: [SVGPathSegment])]? {
        guard let parsed = layers[key] else { return nil }
        let drawable = parsed.filter { !$0.segments.isEmpty }
        return drawable.isEmpty ? nil : drawable
    }
}

/// Issuer initials on a brand-colored chip, for issuers with no bundled
/// logo (Citi, Capital One, Bilt, …). Sized to match `IssuerLogoView` so a
/// list keeps its rhythm whichever mark a row gets.
struct IssuerMonogramView: View {
    let text: String
    let color: UInt32
    var size: CGFloat = 22

    var body: some View {
        Text(text)
            .font(Theme.ui(size * 0.5, weight: .heavy))
            .foregroundStyle(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .frame(width: size, height: size)
            .background(
                RoundedRectangle(cornerRadius: max(3, size * 0.22), style: .continuous)
                    .fill(Theme.chip(color))
            )
    }
}

/// An issuer mark `size` tall, falling back to the emoji stand-in when the
/// key isn't bundled.
///
/// A monochrome mark is a square tinted to stay legible on the current
/// theme. A full-color mark keeps its own colors on a light plate — it was
/// drawn for a white page, and Bilt's black wordmark would otherwise vanish
/// on the dark theme — and keeps its own aspect ratio, capped in width so a
/// 4:1 wordmark can't push the row's text around. Past the cap the height
/// comes down with it and the plate shrinks to match, the way the web's
/// does; a full-height plate left a wordmark floating in white bands.
struct IssuerLogoView: View {
    let key: String
    var size: CGFloat = 22
    var fallbackEmoji: String = "💳"

    /// Widest a mark may render, as a multiple of its height. Matches the
    /// 42px cap the web's 48x32 card chip allows a 24px-tall mark.
    static let maxAspect: CGFloat = 1.75

    var body: some View {
        if let layers = IssuerLogoCache.lookup(key), let logo = IssuerLogos.logo(key) {
            if logo.isFullColor {
                let aspect = CGFloat(logo.aspect)
                let width = min(size * aspect, size * Self.maxAspect)
                let height = aspect > Self.maxAspect ? size * Self.maxAspect / aspect : size
                ZStack {
                    ForEach(Array(layers.enumerated()), id: \.offset) { _, layer in
                        IssuerLogoShape(segments: layer.segments, viewBoxWidth: logo.width)
                            .fill(Theme.exact(layer.color), style: FillStyle(eoFill: false))
                    }
                }
                .frame(width: width, height: height)
                .padding(1)
                .background(
                    // A short, wide plate needs a smaller radius than a square
                    // one, or the corners eat the mark.
                    RoundedRectangle(cornerRadius: max(2, min(size * 0.18, height * 0.25)), style: .continuous)
                        .fill(Theme.logoPlate)
                )
            } else {
                IssuerLogoShape(segments: layers[0].segments, viewBoxWidth: logo.width)
                    .fill(Theme.brand(logo.color), style: FillStyle(eoFill: false))
                    .frame(width: size, height: size)
            }
        } else {
            Text(fallbackEmoji)
                .font(.system(size: size))
                .lineLimit(1)
                .minimumScaleFactor(0.5)
        }
    }
}
