import SwiftUI
import UIKit
import XCTest
@testable import FiHaven

/// The page-width cap is a layout promise — "no screen stretches on a wide
/// iPad" — and layout is what was wrong the first time: nothing in the app had
/// a width limit, so a one-number tile ran 1300pt wide on a 13" iPad. Reading
/// the modifier chain is how that shipped, so the check here runs a real
/// SwiftUI layout pass and samples the pixels.
///
/// `ImageRenderer` lays out at 1 point per pixel, so the arithmetic below is
/// exact: a 1400pt-wide window under the 1180pt cap must paint columns
/// 110…1289 and nothing outside them.
@MainActor
final class PageWidthTests: XCTestCase {

    /// A column that fills whatever width it is proposed, so what gets painted
    /// is exactly the width the cap allows.
    private struct Probe: View {
        var body: some View { Theme.accent.ctPageWidth() }
    }

    private struct NarrowProbe: View {
        var body: some View { Theme.accent.ctPageWidth(Theme.columnMaxWidth) }
    }

    /// The painted horizontal run at the vertical center of the render. Also
    /// pins that the run is contiguous — a cap that left gaps would pass a
    /// "width ≤ max" assertion while looking broken.
    private func paintedRun(_ content: some View, width: CGFloat) throws -> Range<Int> {
        let renderer = ImageRenderer(content: content)
        renderer.proposedSize = ProposedViewSize(width: width, height: 200)
        renderer.scale = 1
        renderer.isOpaque = false
        let image = try XCTUnwrap(renderer.uiImage, "ImageRenderer produced no image")
        let cg = try XCTUnwrap(image.cgImage)
        let w = cg.width, h = cg.height
        XCTAssertEqual(CGFloat(w), width, "the renderer did not honor the proposed width")

        // Redraw into a known RGBA8 layout: the CGImage's own bitmapInfo is
        // whatever ImageRenderer felt like using.
        var rgba = [UInt8](repeating: 0, count: w * h * 4)
        rgba.withUnsafeMutableBytes { raw in
            let ctx = CGContext(
                data: raw.baseAddress, width: w, height: h,
                bitsPerComponent: 8, bytesPerRow: w * 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            )
            ctx?.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        }

        let row = (h / 2) * w * 4
        let painted = (0..<w).filter { rgba[row + $0 * 4 + 3] > 0 }
        let first = try XCTUnwrap(painted.first, "nothing was painted at all")
        let last = try XCTUnwrap(painted.last, "nothing was painted at all")
        XCTAssertEqual(painted.count, last - first + 1, "the painted run is not contiguous")
        return first..<(last + 1)
    }

    func testThePageCapHoldsAndCentersOnAWideWindow() throws {
        // iPad Pro 13" landscape is 1366pt; 1400 keeps the arithmetic round.
        // 1400 - 1180 = 220, split evenly into a 110pt margin each side.
        XCTAssertEqual(try paintedRun(Probe(), width: 1400), 110..<1290)
    }

    func testTheCapDoesNotBindAtPhoneWidth() throws {
        // The phone layout is the one that must not change: a 390pt window
        // still paints edge to edge.
        XCTAssertEqual(try paintedRun(Probe(), width: 390), 0..<390)
    }

    func testTheNarrowColumnCentersAtTheSameWindowWidth() throws {
        // Sign-in, onboarding, and the Pro-locked screen use the readable
        // single-column measure. (1400 - 460) / 2 = 470.
        XCTAssertEqual(try paintedRun(NarrowProbe(), width: 1400), 470..<930)
    }
}
