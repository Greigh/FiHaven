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
        // This is the web's `object-fit: contain` by hand.
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

/// The tile an issuer mark rides — geometry and edge, shared by the brand
/// marks and the monogram so a list of cards keeps one rhythm.
///
/// Ported from the web's `.card-row-chip` (client/css/components.css). Every
/// issuer gets the same tile whatever mark it carries, and the mark is fitted
/// *into* it rather than the tile being sized to the mark — which is what
/// stopped a wide wordmark like US Bank's from reading as a loose strip
/// beside its neighbours' square marks.
enum IssuerTile {
    /// Proportions relative to the tile's height, matching the web's 48x32
    /// tile with its 40x20 content box.
    static let widthRatio: CGFloat = 1.5
    static let cornerRatio: CGFloat = 0.25
    static let markWidthRatio: CGFloat = 1.25
    static let markHeightRatio: CGFloat = 0.625

    static func width(_ height: CGFloat) -> CGFloat { height * widthRatio }

    /// The tile's edge: the brand's own color over a neutral floor.
    ///
    /// A brand tile reads as a slightly deeper edge of its own color; a white
    /// plate picks up a brand-tinted outline, which is what keeps it from
    /// reading as a logo floating loose on the card. The floor guarantees an
    /// edge either way — including for a brand as pale as Best Buy's yellow,
    /// and for a near-black tile (Apple, Bilt) on the dark theme, where it
    /// flips to light because the tile has no edge of its own there.
    @ViewBuilder
    static func edge(_ height: CGFloat, brand: UInt32, plated: Bool) -> some View {
        let shape = RoundedRectangle(cornerRadius: height * cornerRatio, style: .continuous)
        shape.strokeBorder(floor(plated: plated), lineWidth: 1)
        shape.strokeBorder(Theme.exact(brand).opacity(0.55), lineWidth: 1)
    }

    private static func floor(plated: Bool) -> Color {
        // A plate's own surface is the light one, so it keeps a dark floor in
        // both themes; a brand tile follows the theme.
        if plated { return Color.black.opacity(0.16) }
        return Color(UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(white: 1, alpha: 0.17)
                : UIColor(white: 0, alpha: 0.10)
        })
    }
}

/// Issuer initials on a brand-colored tile, for issuers with no bundled
/// logo (Mission Lane, Navy Federal, PNC, …). Shares `IssuerTile` with
/// `IssuerLogoView` so a list keeps its rhythm whichever mark a row gets.
struct IssuerMonogramView: View {
    let text: String
    let color: UInt32
    var size: CGFloat = 22

    var body: some View {
        Text(text)
            .font(Theme.ui(size * 0.42, weight: .heavy))
            // Ink, not always white: PNC's orange and Amazon's yellow can't
            // carry white initials any more than they can a white mark.
            .foregroundStyle(Theme.exact(BrandColor.ink(on: color)))
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .frame(width: size * IssuerTile.markWidthRatio, height: size * IssuerTile.markHeightRatio)
            .frame(width: IssuerTile.width(size), height: size)
            .background(
                RoundedRectangle(cornerRadius: size * IssuerTile.cornerRatio, style: .continuous)
                    .fill(Theme.exact(color))
            )
            .overlay(IssuerTile.edge(size, brand: color, plated: false))
    }
}

/// An issuer mark on its tile, `size` tall, falling back to the emoji
/// stand-in when the key isn't bundled.
///
/// A monochrome mark is knocked out of a tile in the brand's own color —
/// white for most brands, ink for the light ones that can't carry white (see
/// `BrandColor.ink(on:)`). A full-color mark can't be recolored, so its tile
/// becomes the white plate it was drawn for — in both themes, or Bilt's black
/// wordmark would vanish on the dark one.
///
/// Either way the mark is fitted into the same content box and the tile is
/// the same size, so every row's text starts at the same place.
struct IssuerLogoView: View {
    let key: String
    var size: CGFloat = 22
    var fallbackEmoji: String = "💳"

    var body: some View {
        if let layers = IssuerLogoCache.lookup(key), let logo = IssuerLogos.logo(key) {
            let plated = logo.isFullColor
            let ink = BrandColor.ink(on: logo.color)
            ZStack {
                ForEach(Array(layers.enumerated()), id: \.offset) { _, layer in
                    IssuerLogoShape(segments: layer.segments, viewBoxWidth: logo.width)
                        // Only a monochrome mark can be knocked out; a
                        // full-color one keeps every layer as authored.
                        .fill(Theme.exact(plated ? layer.color : ink), style: FillStyle(eoFill: false))
                }
            }
            .frame(width: size * IssuerTile.markWidthRatio, height: size * IssuerTile.markHeightRatio)
            .frame(width: IssuerTile.width(size), height: size)
            .background(
                RoundedRectangle(cornerRadius: size * IssuerTile.cornerRatio, style: .continuous)
                    .fill(plated ? Theme.logoPlate : Theme.exact(logo.color))
            )
            .overlay(IssuerTile.edge(size, brand: logo.color, plated: plated))
        } else {
            Text(fallbackEmoji)
                .font(.system(size: size))
                .lineLimit(1)
                .minimumScaleFactor(0.5)
        }
    }
}
