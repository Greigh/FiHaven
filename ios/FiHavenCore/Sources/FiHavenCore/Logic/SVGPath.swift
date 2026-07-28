import Foundation

/// A point in SVG user space (24x24 for our brand marks).
public struct SVGPoint: Equatable, Sendable {
    public let x: Double
    public let y: Double
    public init(_ x: Double, _ y: Double) {
        self.x = x
        self.y = y
    }
}

/// A drawing step, reduced to the three primitives every renderer has.
/// Quadratics and elliptical arcs are converted to cubics while parsing, so
/// the UI layer only has to move, line, curve and close.
public enum SVGPathSegment: Equatable, Sendable {
    case move(to: SVGPoint)
    case line(to: SVGPoint)
    case curve(c1: SVGPoint, c2: SVGPoint, to: SVGPoint)
    case close
}

/// Minimal SVG path-data parser — enough for the Simple Icons marks in
/// `IssuerLogos` (M/L/H/V/C/S/Q/T/A/Z, absolute and relative, implicit
/// repeated commands, arc flags packed without separators).
///
/// SwiftUI has no SVG support, so this stands in: parse once, then map the
/// segments onto a `Path`. Kept free of CoreGraphics/SwiftUI so it runs in
/// the headless check suite.
public enum SVGPath {
    /// Parse path `d` data. Returns an empty array for malformed input —
    /// callers fall back to an emoji glyph rather than drawing nothing.
    public static func parse(_ d: String) -> [SVGPathSegment] {
        var scanner = Scanner(Array(d.unicodeScalars))
        var segments: [SVGPathSegment] = []

        var current = SVGPoint(0, 0)      // current point
        var subpathStart = SVGPoint(0, 0) // where the active subpath began
        var lastCubicControl: SVGPoint?   // for S/s
        var lastQuadControl: SVGPoint?    // for T/t
        var command: Unicode.Scalar?

        while true {
            scanner.skipSeparators()
            guard !scanner.isAtEnd else { break }

            if scanner.peekIsCommand() {
                command = scanner.takeScalar()
            } else if command == nil {
                return [] // numbers before any command
            } else if command == "M" {
                command = "L" // implicit lineto after a moveto
            } else if command == "m" {
                command = "l"
            }

            guard let cmd = command else { return [] }
            let relative = cmd.isLowercaseCommand
            func absolute(_ x: Double, _ y: Double) -> SVGPoint {
                relative ? SVGPoint(current.x + x, current.y + y) : SVGPoint(x, y)
            }

            switch Character(cmd).lowercased().first! {
            case "m":
                guard let x = scanner.number(), let y = scanner.number() else { return [] }
                current = absolute(x, y)
                subpathStart = current
                segments.append(.move(to: current))
                lastCubicControl = nil
                lastQuadControl = nil

            case "l":
                guard let x = scanner.number(), let y = scanner.number() else { return [] }
                current = absolute(x, y)
                segments.append(.line(to: current))
                lastCubicControl = nil
                lastQuadControl = nil

            case "h":
                guard let x = scanner.number() else { return [] }
                current = SVGPoint(relative ? current.x + x : x, current.y)
                segments.append(.line(to: current))
                lastCubicControl = nil
                lastQuadControl = nil

            case "v":
                guard let y = scanner.number() else { return [] }
                current = SVGPoint(current.x, relative ? current.y + y : y)
                segments.append(.line(to: current))
                lastCubicControl = nil
                lastQuadControl = nil

            case "c":
                guard let x1 = scanner.number(), let y1 = scanner.number(),
                      let x2 = scanner.number(), let y2 = scanner.number(),
                      let x = scanner.number(), let y = scanner.number() else { return [] }
                let c1 = absolute(x1, y1)
                let c2 = absolute(x2, y2)
                current = absolute(x, y)
                segments.append(.curve(c1: c1, c2: c2, to: current))
                lastCubicControl = c2
                lastQuadControl = nil

            case "s":
                guard let x2 = scanner.number(), let y2 = scanner.number(),
                      let x = scanner.number(), let y = scanner.number() else { return [] }
                let c1 = reflect(lastCubicControl, about: current)
                let c2 = absolute(x2, y2)
                current = absolute(x, y)
                segments.append(.curve(c1: c1, c2: c2, to: current))
                lastCubicControl = c2
                lastQuadControl = nil

            case "q":
                guard let x1 = scanner.number(), let y1 = scanner.number(),
                      let x = scanner.number(), let y = scanner.number() else { return [] }
                let control = absolute(x1, y1)
                let end = absolute(x, y)
                segments.append(quadratic(from: current, control: control, to: end))
                current = end
                lastQuadControl = control
                lastCubicControl = nil

            case "t":
                guard let x = scanner.number(), let y = scanner.number() else { return [] }
                let control = reflect(lastQuadControl, about: current)
                let end = absolute(x, y)
                segments.append(quadratic(from: current, control: control, to: end))
                current = end
                lastQuadControl = control
                lastCubicControl = nil

            case "a":
                // rx ry x-rotation large-arc-flag sweep-flag x y — the flags are
                // single digits and often run into the next number ("0 10-.001").
                guard let rx = scanner.number(), let ry = scanner.number(),
                      let rotation = scanner.number(),
                      let largeArc = scanner.flag(), let sweep = scanner.flag(),
                      let x = scanner.number(), let y = scanner.number() else { return [] }
                let end = absolute(x, y)
                segments.append(contentsOf: arc(
                    from: current, to: end,
                    rx: rx, ry: ry, rotation: rotation,
                    largeArc: largeArc, sweep: sweep
                ))
                current = end
                lastCubicControl = nil
                lastQuadControl = nil

            case "z":
                segments.append(.close)
                current = subpathStart
                lastCubicControl = nil
                lastQuadControl = nil

            default:
                return []
            }
        }

        return segments
    }

    /// Reflection of the previous control point — the smooth-curve rule.
    /// With no previous curve the control point coincides with the current point.
    private static func reflect(_ control: SVGPoint?, about point: SVGPoint) -> SVGPoint {
        guard let control else { return point }
        return SVGPoint(2 * point.x - control.x, 2 * point.y - control.y)
    }

    /// Exact cubic equivalent of a quadratic Bézier.
    private static func quadratic(from start: SVGPoint, control: SVGPoint, to end: SVGPoint) -> SVGPathSegment {
        let c1 = SVGPoint(
            start.x + 2.0 / 3.0 * (control.x - start.x),
            start.y + 2.0 / 3.0 * (control.y - start.y)
        )
        let c2 = SVGPoint(
            end.x + 2.0 / 3.0 * (control.x - end.x),
            end.y + 2.0 / 3.0 * (control.y - end.y)
        )
        return .curve(c1: c1, c2: c2, to: end)
    }

    /// Endpoint-parameterized elliptical arc → cubics, per the SVG spec's
    /// implementation notes (F.6.5/F.6.6). Split so no piece exceeds 90°.
    private static func arc(
        from start: SVGPoint,
        to end: SVGPoint,
        rx rxIn: Double,
        ry ryIn: Double,
        rotation: Double,
        largeArc: Bool,
        sweep: Bool
    ) -> [SVGPathSegment] {
        if start == end { return [] }
        var rx = abs(rxIn)
        var ry = abs(ryIn)
        // Degenerate radii mean a straight line (SVG F.6.6 step 1).
        guard rx > 0, ry > 0 else { return [.line(to: end)] }

        let phi = rotation * .pi / 180
        let cosPhi = cos(phi)
        let sinPhi = sin(phi)

        let dx2 = (start.x - end.x) / 2
        let dy2 = (start.y - end.y) / 2
        let x1p = cosPhi * dx2 + sinPhi * dy2
        let y1p = -sinPhi * dx2 + cosPhi * dy2

        // Scale up radii that are too small to span the endpoints.
        let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
        if lambda > 1 {
            let scale = lambda.squareRoot()
            rx *= scale
            ry *= scale
        }

        let rxSq = rx * rx
        let rySq = ry * ry
        let numerator = max(0, rxSq * rySq - rxSq * y1p * y1p - rySq * x1p * x1p)
        let denominator = rxSq * y1p * y1p + rySq * x1p * x1p
        let coefficient = (largeArc == sweep ? -1.0 : 1.0) * (denominator > 0 ? (numerator / denominator).squareRoot() : 0)
        let cxp = coefficient * rx * y1p / ry
        let cyp = -coefficient * ry * x1p / rx

        let cx = cosPhi * cxp - sinPhi * cyp + (start.x + end.x) / 2
        let cy = sinPhi * cxp + cosPhi * cyp + (start.y + end.y) / 2

        let theta1 = angle(ux: 1, uy: 0, vx: (x1p - cxp) / rx, vy: (y1p - cyp) / ry)
        var sweepAngle = angle(
            ux: (x1p - cxp) / rx, uy: (y1p - cyp) / ry,
            vx: (-x1p - cxp) / rx, vy: (-y1p - cyp) / ry
        )
        if !sweep, sweepAngle > 0 {
            sweepAngle -= 2 * .pi
        } else if sweep, sweepAngle < 0 {
            sweepAngle += 2 * .pi
        }

        let count = max(1, Int(ceil(abs(sweepAngle) / (.pi / 2))))
        let delta = sweepAngle / Double(count)
        let alpha = 4.0 / 3.0 * tan(delta / 4)

        func point(_ theta: Double) -> SVGPoint {
            SVGPoint(
                cx + rx * cosPhi * cos(theta) - ry * sinPhi * sin(theta),
                cy + rx * sinPhi * cos(theta) + ry * cosPhi * sin(theta)
            )
        }
        func derivative(_ theta: Double) -> SVGPoint {
            SVGPoint(
                -rx * cosPhi * sin(theta) - ry * sinPhi * cos(theta),
                -rx * sinPhi * sin(theta) + ry * cosPhi * cos(theta)
            )
        }

        var out: [SVGPathSegment] = []
        for i in 0..<count {
            let from = theta1 + Double(i) * delta
            let to = from + delta
            let p0 = point(from)
            let p1 = point(to)
            let d0 = derivative(from)
            let d1 = derivative(to)
            out.append(.curve(
                c1: SVGPoint(p0.x + alpha * d0.x, p0.y + alpha * d0.y),
                c2: SVGPoint(p1.x - alpha * d1.x, p1.y - alpha * d1.y),
                to: p1
            ))
        }
        return out
    }

    /// Signed angle between two vectors.
    private static func angle(ux: Double, uy: Double, vx: Double, vy: Double) -> Double {
        let dot = ux * vx + uy * vy
        let lengths = (ux * ux + uy * uy).squareRoot() * (vx * vx + vy * vy).squareRoot()
        guard lengths > 0 else { return 0 }
        let value = acos(min(1, max(-1, dot / lengths)))
        return (ux * vy - uy * vx) < 0 ? -value : value
    }

    /// Character scanner over path data. Numbers may run together without
    /// separators (`1-2`, `.5.5`), which rules out splitting on whitespace.
    private struct Scanner {
        private let scalars: [Unicode.Scalar]
        private var index = 0

        init(_ scalars: [Unicode.Scalar]) {
            self.scalars = scalars
        }

        var isAtEnd: Bool { index >= scalars.count }

        mutating func skipSeparators() {
            while index < scalars.count, scalars[index] == " " || scalars[index] == ","
                || scalars[index] == "\n" || scalars[index] == "\t" || scalars[index] == "\r" {
                index += 1
            }
        }

        func peekIsCommand() -> Bool {
            guard index < scalars.count else { return false }
            return scalars[index].isPathCommand
        }

        mutating func takeScalar() -> Unicode.Scalar {
            defer { index += 1 }
            return scalars[index]
        }

        /// A single `0`/`1` arc flag, which the spec allows to be unseparated.
        mutating func flag() -> Bool? {
            skipSeparators()
            guard index < scalars.count else { return nil }
            switch scalars[index] {
            case "0": index += 1; return false
            case "1": index += 1; return true
            default: return nil
            }
        }

        mutating func number() -> Double? {
            skipSeparators()
            let start = index
            if index < scalars.count, scalars[index] == "+" || scalars[index] == "-" {
                index += 1
            }
            var sawDigit = false
            var sawDot = false
            while index < scalars.count {
                let scalar = scalars[index]
                if scalar.isASCIIDigit {
                    sawDigit = true
                } else if scalar == ".", !sawDot {
                    sawDot = true
                } else if (scalar == "e" || scalar == "E"), sawDigit {
                    // Exponent; the sign belongs to it, not to the next number.
                    let next = index + 1
                    guard next < scalars.count,
                          scalars[next].isASCIIDigit || scalars[next] == "+" || scalars[next] == "-" else { break }
                    index = next
                    if !scalars[index].isASCIIDigit { index += 1 }
                    while index < scalars.count, scalars[index].isASCIIDigit { index += 1 }
                    break
                } else {
                    break
                }
                index += 1
            }
            guard sawDigit, start < index else {
                index = start
                return nil
            }
            return Double(String(String.UnicodeScalarView(scalars[start..<index])))
        }
    }
}

private extension Unicode.Scalar {
    var isASCIIDigit: Bool { self >= "0" && self <= "9" }

    var isPathCommand: Bool {
        switch self {
        case "M", "m", "L", "l", "H", "h", "V", "v",
             "C", "c", "S", "s", "Q", "q", "T", "t",
             "A", "a", "Z", "z":
            return true
        default:
            return false
        }
    }

    var isLowercaseCommand: Bool { self >= "a" && self <= "z" }
}
