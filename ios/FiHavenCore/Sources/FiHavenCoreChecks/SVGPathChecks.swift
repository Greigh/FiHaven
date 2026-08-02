import Foundation
import FiHavenCore

// The SwiftUI side draws issuer marks by mapping these segments onto a Path,
// so a parse failure means an invisible logo. Every bundled mark is parsed
// here, plus the grammar corners the Simple Icons data actually uses.

/// Bounding box of the parsed geometry, control points included.
private func bounds(_ segments: [SVGPathSegment]) -> (minX: Double, minY: Double, maxX: Double, maxY: Double) {
    var minX = Double.infinity, minY = Double.infinity
    var maxX = -Double.infinity, maxY = -Double.infinity
    func include(_ p: SVGPoint) {
        minX = min(minX, p.x); maxX = max(maxX, p.x)
        minY = min(minY, p.y); maxY = max(maxY, p.y)
    }
    for segment in segments {
        switch segment {
        case .move(let p), .line(let p): include(p)
        case .curve(let c1, let c2, let p): include(c1); include(c2); include(p)
        case .close: break
        }
    }
    return (minX, minY, maxX, maxY)
}

func runSVGPathChecks() {
    section("SVGPath — commands") {
        checkEqual(
            SVGPath.parse("M1 2 L3 4"),
            [.move(to: SVGPoint(1, 2)), .line(to: SVGPoint(3, 4))],
            "absolute move + line"
        )
        checkEqual(
            SVGPath.parse("m1 2 l3 4"),
            [.move(to: SVGPoint(1, 2)), .line(to: SVGPoint(4, 6))],
            "relative line is offset from current point"
        )
        checkEqual(
            SVGPath.parse("M1 1 2 2 3 3"),
            [.move(to: SVGPoint(1, 1)), .line(to: SVGPoint(2, 2)), .line(to: SVGPoint(3, 3))],
            "repeated moveto args become linetos"
        )
        checkEqual(
            SVGPath.parse("M0 0H5V5Z"),
            [.move(to: SVGPoint(0, 0)), .line(to: SVGPoint(5, 0)), .line(to: SVGPoint(5, 5)), .close],
            "H/V/Z"
        )
        checkEqual(
            SVGPath.parse("M0 0 1-2.5.5.5"),
            [.move(to: SVGPoint(0, 0)), .line(to: SVGPoint(1, -2.5)), .line(to: SVGPoint(0.5, 0.5))],
            "numbers packed without separators"
        )
        checkEqual(
            SVGPath.parse("M0 0C1 1 2 1 3 0"),
            [.move(to: SVGPoint(0, 0)), .curve(c1: SVGPoint(1, 1), c2: SVGPoint(2, 1), to: SVGPoint(3, 0))],
            "cubic"
        )
        checkEqual(
            SVGPath.parse("M0 0C1 1 2 1 3 0S5 -1 6 0"),
            [
                .move(to: SVGPoint(0, 0)),
                .curve(c1: SVGPoint(1, 1), c2: SVGPoint(2, 1), to: SVGPoint(3, 0)),
                .curve(c1: SVGPoint(4, -1), c2: SVGPoint(5, -1), to: SVGPoint(6, 0)),
            ],
            "smooth cubic reflects the previous control point"
        )
        checkEqual(
            SVGPath.parse("M0 0Q3 3 6 0"),
            [.move(to: SVGPoint(0, 0)), .curve(c1: SVGPoint(2, 2), c2: SVGPoint(4, 2), to: SVGPoint(6, 0))],
            "quadratic promoted to a cubic"
        )
    }

    section("SVGPath — arcs") {
        // A half-circle: two 90° cubics, landing exactly on the far endpoint.
        let semi = SVGPath.parse("M0 0A5 5 0 1 1 10 0")
        checkEqual(semi.count, 3, "arc splits into 90° pieces")
        if case .curve(_, _, let end) = semi.last {
            checkClose(end.x, 10, "arc endpoint x", tol: 1e-9)
            checkClose(end.y, 0, "arc endpoint y", tol: 1e-9)
        } else {
            check(false, "arc produced curves")
        }
        // The flags may run into the next number — the case Bank of America's
        // mark hits ("a7.8265 7.8265 0 10-.001-15.652").
        let packed = SVGPath.parse("M12 20a8 8 0 10-.001-15.652")
        check(!packed.isEmpty, "packed arc flags parse")
        checkEqual(SVGPath.parse("M0 0A0 5 0 1 1 10 0").last, .line(to: SVGPoint(10, 0)), "zero radius → line")
        checkEqual(SVGPath.parse("M0 0Z L1 1").isEmpty, false, "close mid-path keeps parsing")
    }

    section("SVGPath — malformed input") {
        checkEqual(SVGPath.parse(""), [], "empty")
        checkEqual(SVGPath.parse("1 2 3"), [], "numbers with no command")
        checkEqual(SVGPath.parse("M1"), [], "truncated moveto")
        checkEqual(SVGPath.parse("M0 0C1 1 2"), [], "truncated cubic")
        checkEqual(SVGPath.parse("M0 0X9"), [], "unknown command")
    }

    section("IssuerLogos — every bundled mark parses") {
        checkEqual(IssuerLogos.all.count, 47, "bundled mark count")
        for key in IssuerLogos.all.keys.sorted() {
            guard let logo = IssuerLogos.all[key] else {
                check(false, "\(key) present")
                continue
            }
            check(!logo.layers.isEmpty, "\(key) has at least one layer")
            // A monochrome mark is recolorable, so it must stay single-path.
            if !logo.isFullColor {
                checkEqual(logo.layers.count, 1, "\(key) monochrome mark is single-path")
                checkEqual(logo.width, 24, "\(key) monochrome mark is square")
            }
            check(logo.width >= 24, "\(key) is at least as wide as it is tall")
            check(logo.color <= 0xFFFFFF, "\(key) color is 0xRRGGBB")
            checkEqual(logo.key, key, "\(key) is self-keyed")

            // Union of the layers — an individual layer (a dot on an "i") can
            // be tiny, but the mark as a whole has to fill its box.
            var union = (minX: Double.infinity, minY: Double.infinity, maxX: -Double.infinity, maxY: -Double.infinity)
            for (index, layer) in logo.layers.enumerated() {
                let segments = SVGPath.parse(layer.path)
                check(!segments.isEmpty, "\(key) layer \(index) parses")
                guard !segments.isEmpty else { continue }

                if case .move = segments.first {
                    check(true, "\(key) layer \(index) starts with a moveto")
                } else {
                    check(false, "\(key) layer \(index) starts with a moveto")
                }
                check(layer.color <= 0xFFFFFF, "\(key) layer \(index) color is 0xRRGGBB")

                // Marks are authored `width` x 24; geometry far outside that
                // box means the mark was scaled onto the wrong grid and would
                // be clipped or drawn tiny. `bounds` includes Bézier control
                // points, which sit outside the painted shape by design —
                // Capital One's swoosh reaches 2.7 above its own top edge — so
                // the tolerance is the control hull's, not the artwork's. The
                // tight bound is enforced by cropping each mark to its
                // measured fill bounds when it's generated.
                let slack = 3.0
                let box = bounds(segments)
                check(
                    box.minX >= -slack && box.minY >= -slack,
                    "\(key) layer \(index) starts inside the \(logo.width)x24 box"
                )
                check(
                    box.maxX <= logo.width + slack && box.maxY <= 24 + slack,
                    "\(key) layer \(index) ends inside the \(logo.width)x24 box"
                )
                union.minX = min(union.minX, box.minX); union.maxX = max(union.maxX, box.maxX)
                union.minY = min(union.minY, box.minY); union.maxY = max(union.maxY, box.maxY)
            }
            check(
                union.maxX - union.minX > 1 && union.maxY - union.minY > 1,
                "\(key) mark has real extent"
            )
            // Full-color marks are generated by scaling the source artwork
            // onto the height-24 grid, so their geometry has to reach the box
            // they declare — otherwise the renderer letterboxes empty space
            // and draws the logo smaller than the row allows. Simple Icons
            // glyphs are hand-authored and legitimately don't all touch an
            // edge (Visa's wordmark is short, PayPal's is narrow).
            if logo.isFullColor {
                check(union.maxX >= logo.width - 1.5, "\(key) fills its declared width")
                check(union.maxY >= 22.5, "\(key) fills its declared height")
            }
        }
    }

    // Theme surfaces the marks are drawn on (Theme.swift / tokens.css).
    let lightSurface: UInt32 = 0xFFFFFF
    let darkSurface: UInt32 = 0x17181B

    section("BrandColor — contrast math") {
        checkClose(BrandColor.relativeLuminance(0x000000), 0, "black luminance")
        checkClose(BrandColor.relativeLuminance(0xFFFFFF), 1, "white luminance")
        checkClose(BrandColor.contrastRatio(0x000000, 0xFFFFFF), 21, "black on white is 21:1", tol: 0.01)
        checkClose(BrandColor.contrastRatio(0x117ACA, 0x117ACA), 1, "a color against itself", tol: 0.001)

        checkEqual(BrandColor.mix(0x000000, 0xFFFFFF, amount: 0), 0x000000, "mix at 0")
        checkEqual(BrandColor.mix(0x000000, 0xFFFFFF, amount: 1), 0xFFFFFF, "mix at 1")
        checkEqual(BrandColor.mix(0x000000, 0xFFFFFF, amount: 0.5), 0x808080, "mix midpoint")
        checkEqual(BrandColor.mix(0x000000, 0xFFFFFF, amount: 2), 0xFFFFFF, "mix clamps")
    }

    section("BrandColor — legibility") {
        checkEqual(BrandColor.legible(0x117ACA, on: lightSurface), 0x117ACA, "Chase blue untouched on white")
        checkEqual(BrandColor.legible(0xFF6000, on: darkSurface), 0xFF6000, "Discover orange untouched on dark")

        // Apple black and the Visa / Bank of America navies are the marks that
        // would otherwise disappear on the dark card surface.
        for color: UInt32 in [0x000000, 0x1A1F71, 0x012169] {
            let lifted = BrandColor.legible(color, on: darkSurface)
            check(
                BrandColor.contrastRatio(lifted, darkSurface) >= 3,
                String(format: "0x%06X lifted to 0x%06X clears 3:1", color, lifted)
            )
        }
        let visa = BrandColor.legible(0x1A1F71, on: darkSurface)
        check((visa & 0xFF) > ((visa >> 16) & 0xFF), "lifted navy keeps its blue cast")

        for (key, logo) in IssuerLogos.all {
            for surface in [lightSurface, darkSurface] {
                let color = BrandColor.legible(logo.color, on: surface)
                check(
                    BrandColor.contrastRatio(color, surface) >= 3,
                    String(format: "\(key) readable on 0x%06X", surface)
                )
            }
        }
    }
}
