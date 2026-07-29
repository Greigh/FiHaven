import SwiftUI
import FiHavenCore

/// Income vs. merged spending over time — two lines on one axis, oldest → newest.
/// Mirrors the web `CashflowChart.svelte`.
///
/// Deliberately TWO lines rather than one net line: a single net series collapses
/// "earned more" and "spent less" into identical upward movement, and those are
/// very different facts about a month. The band between the lines carries the net
/// visually.
///
/// The y-axis IS zero-based here — unusual for a trend line, but the reader's job
/// is the GAP between the series, and cropping the axis would inflate that gap out
/// of proportion to the money it represents.
///
/// Months we can't account for BREAK the spending line rather than plotting a zero.
/// Dashing a line down to the axis still draws a number we don't have; a gap plus a
/// shaded column says "no data" and means it.
struct CashflowChartView: View {
    let rows: [CashflowHistory.Row]
    var height: CGFloat = 190

    private let padL: CGFloat = 46
    private let padR: CGFloat = 10
    private let padT: CGFloat = 10
    private let padB: CGFloat = 22

    /// Round the axis ceiling up to a readable step so gridline labels land on
    /// round money. Deliberately fine-grained — a coarse 1/2/5/10 ladder strands
    /// a $7.3k series under a $10k ceiling and wastes a third of the plot height.
    private static let niceSteps: [Double] = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]

    private var maxY: Double {
        let peak = rows.map { max($0.income, $0.spending) }.max() ?? 1
        let v = max(1, peak) * 1.05
        let mag = pow(10, floor(log10(v)))
        let n = v / mag
        return (Self.niceSteps.first { n <= $0 + 1e-9} ?? 10) * mag
    }

    /// Runs of consecutive months whose spending we can actually account for.
    private var runs: [[Int]] {
        var out: [[Int]] = []
        var cur: [Int] = []
        for (i, r) in rows.enumerated() {
            if r.blind {
                if !cur.isEmpty { out.append(cur) }
                cur = []
            } else {
                cur.append(i)
            }
        }
        if !cur.isEmpty { out.append(cur) }
        return out
    }

    private func axisLabel(_ v: Double) -> String {
        if v >= 1000 {
            let k = v / 1000
            return "$" + (v.truncatingRemainder(dividingBy: 1000) == 0
                ? String(format: "%.0f", k) : String(format: "%.1f", k)) + "k"
        }
        return "$" + String(format: "%.0f", v)
    }

    // Geometry helpers live on the type, not inside the ViewBuilder closure —
    // a `func` declaration can't appear in one.
    private func xAt(_ i: Int, plotW: CGFloat) -> CGFloat {
        rows.count <= 1
            ? padL + plotW / 2
            : padL + (CGFloat(i) * plotW) / CGFloat(rows.count - 1)
    }
    private func yAt(_ v: Double, plotH: CGFloat) -> CGFloat {
        padT + plotH - CGFloat(max(0, v) / maxY) * plotH
    }

    private func monthLabel(_ mk: String) -> String {
        let parts = mk.split(separator: "-")
        guard parts.count >= 2, let m = Int(parts[1]), (1...12).contains(m) else { return mk }
        return DateFormatter().shortMonthSymbols?[m - 1]
            ?? Calendar(identifier: .gregorian).shortMonthSymbols[m - 1]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Legend: always present for two series, so identity is never
            // carried by color alone.
            HStack(spacing: 14) {
                legendKey(Theme.chartIncome, "Income")
                legendKey(Theme.chartSpend, "Spending")
                if rows.contains(where: { $0.blind }) {
                    HStack(spacing: 5) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Theme.muted.opacity(0.22))
                            .frame(width: 10, height: 10)
                        Text("Not recorded").font(Theme.ui(11)).foregroundStyle(Theme.muted)
                    }
                }
            }

            GeometryReader { geo in
                let plotW = max(40, geo.size.width - padL - padR)
                let plotH = max(40, height - padT - padB)
                let n = rows.count

                ZStack(alignment: .topLeading) {
                    // Shaded columns for months with no usable spending figure.
                    let half = n > 1 ? (plotW / CGFloat(n - 1)) / 2 : plotW / 2
                    ForEach(Array(rows.enumerated()).filter { $0.element.blind }, id: \.offset) { item in
                        let x = max(padL, xAt(item.offset, plotW: plotW) - half)
                        Rectangle()
                            .fill(Theme.muted.opacity(0.12))
                            .frame(width: min(half * 2, plotW), height: plotH)
                            .position(x: x + min(half * 2, plotW) / 2, y: padT + plotH / 2)
                    }

                    // Gridlines + axis labels, recessive.
                    ForEach([0.0, 0.25, 0.5, 0.75, 1.0], id: \.self) { f in
                        let y = padT + plotH - CGFloat(f) * plotH
                        Path { p in
                            p.move(to: CGPoint(x: padL, y: y))
                            p.addLine(to: CGPoint(x: padL + plotW, y: y))
                        }
                        .stroke(Theme.border, lineWidth: 1)
                        Text(axisLabel(maxY * f))
                            .font(Theme.ui(10))
                            .foregroundStyle(Theme.muted)
                            .frame(width: padL - 6, alignment: .trailing)
                            .position(x: (padL - 6) / 2, y: y)
                    }

                    // Band between the series, one shape per run so it never
                    // spans a gap.
                    ForEach(Array(runs.enumerated()), id: \.offset) { entry in
                        let run = entry.element
                        if run.count > 1 {
                            Path { p in
                                p.move(to: CGPoint(x: xAt(run[0], plotW: plotW), y: yAt(rows[run[0]].income, plotH: plotH)))
                                for i in run.dropFirst() { p.addLine(to: CGPoint(x: xAt(i, plotW: plotW), y: yAt(rows[i].income, plotH: plotH))) }
                                for i in run.reversed() { p.addLine(to: CGPoint(x: xAt(i, plotW: plotW), y: yAt(rows[i].spending, plotH: plotH))) }
                                p.closeSubpath()
                            }
                            .fill(Theme.chartIncome.opacity(0.10))
                        }
                    }

                    // Spending: solid within each run, broken across gaps.
                    ForEach(Array(runs.enumerated()), id: \.offset) { entry in
                        let run = entry.element
                        if run.count > 1 {
                            Path { p in
                                p.move(to: CGPoint(x: xAt(run[0], plotW: plotW), y: yAt(rows[run[0]].spending, plotH: plotH)))
                                for i in run.dropFirst() { p.addLine(to: CGPoint(x: xAt(i, plotW: plotW), y: yAt(rows[i].spending, plotH: plotH))) }
                            }
                            .stroke(Theme.chartSpend, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                        } else if let i = run.first {
                            // A run of one has no segment to draw — mark it.
                            Circle()
                                .fill(Theme.chartSpend)
                                .frame(width: 7, height: 7)
                                .position(x: xAt(i, plotW: plotW), y: yAt(rows[i].spending, plotH: plotH))
                        }
                    }

                    // Income is known for every month (it's projected from
                    // settings), so that line stays continuous.
                    Path { p in
                        guard let first = rows.first else { return }
                        p.move(to: CGPoint(x: xAt(0, plotW: plotW), y: yAt(first.income, plotH: plotH)))
                        for i in 1..<max(1, n) { p.addLine(to: CGPoint(x: xAt(i, plotW: plotW), y: yAt(rows[i].income, plotH: plotH))) }
                    }
                    .stroke(Theme.chartIncome, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))

                    if n == 1, let only = rows.first {
                        Circle().fill(Theme.chartIncome).frame(width: 7, height: 7)
                            .position(x: xAt(0, plotW: plotW), y: yAt(only.income, plotH: plotH))
                    }

                    // Thin the x labels to whatever fits: ~64pt each.
                    let every = max(1, Int(ceil(Double(n) / Double(max(2, Int(plotW / 64))))))
                    ForEach(Array(rows.enumerated()), id: \.offset) { item in
                        if item.offset % every == 0 || item.offset == n - 1 {
                            Text(monthLabel(item.element.mk))
                                .font(Theme.ui(10))
                                .foregroundStyle(Theme.muted)
                                .position(x: xAt(item.offset, plotW: plotW), y: height - padB / 2)
                        }
                    }
                }
            }
            .frame(height: height)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilitySummary)
        }
    }

    private func legendKey(_ color: Color, _ label: String) -> some View {
        HStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 10, height: 10)
            Text(label).font(Theme.ui(11, weight: .semibold)).foregroundStyle(Theme.text)
        }
    }

    private var accessibilitySummary: String {
        guard let first = rows.first, let last = rows.last else { return "No cash-flow data yet." }
        let spend = last.blind ? "not recorded" : Money.fmt(last.spending)
        return "Income versus spending, \(first.mk) to \(last.mk). "
            + "Latest month: income \(Money.fmt(last.income)), spending \(spend). "
            + "Full figures follow in the table below."
    }
}
