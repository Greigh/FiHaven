import SwiftUI
import FiHavenCore

// Shared accessibility helpers: Dynamic Type–friendly motion, paid-state
// semantics, and money/status views that do not rely on color alone.

enum A11y {

    // MARK: - Paid state

    static func paidStateLabel(_ state: PaidState, skipped: Bool = false, periodNoun: String = "month") -> String {
        if skipped { return "Skipped this \(periodNoun)" }
        switch state {
        case .full: return "Paid"
        case .partial: return "Partially paid"
        case .unpaid: return "Unpaid"
        }
    }

    static func paidStateIcon(_ state: PaidState, skipped: Bool = false) -> String {
        if skipped { return "forward.end.circle.fill" }
        switch state {
        case .full: return "checkmark.circle.fill"
        case .partial: return "circle.lefthalf.filled"
        case .unpaid: return "circle"
        }
    }

    static func paidStateHint(_ state: PaidState, skipped: Bool = false, periodNoun: String = "month") -> String {
        if skipped { return "Double tap to un-skip this \(periodNoun)" }
        switch state {
        case .full: return "Double tap to undo payment"
        case .partial, .unpaid: return "Double tap to record payment"
        }
    }

    // MARK: - Money / status tone

    enum MoneyTone {
        case positive, negative, warning, neutral, accent

        var color: Color {
            switch self {
            case .positive: return Theme.green
            case .negative: return Theme.red
            case .warning: return Theme.orange
            case .neutral: return Theme.text
            case .accent: return Theme.accent
            }
        }

        /// Visible icon so status is not conveyed by color alone.
        var symbolName: String? {
            switch self {
            case .positive: return "arrow.up.circle.fill"
            case .negative: return "arrow.down.circle.fill"
            case .warning: return "exclamationmark.circle.fill"
            case .neutral, .accent: return nil
            }
        }

        var spokenDescriptor: String? {
            switch self {
            case .positive: return "positive"
            case .negative: return "negative"
            case .warning: return "warning"
            case .neutral, .accent: return nil
            }
        }

        static func fromBudgetStatus(_ status: String) -> MoneyTone {
            status == "ok" ? .positive : .negative
        }

        static func fromBudgetRowStatus(_ status: String) -> MoneyTone {
            switch status {
            case "ok": return .positive
            case "under": return .negative
            default: return .warning
            }
        }
    }

    static func budgetStatusWords(_ status: String) -> String {
        status == "ok" ? "On track" : "Over budget"
    }

    static func budgetRowStatusWords(_ status: String) -> String {
        switch status {
        case "ok": return "On track"
        case "under": return "Under"
        default: return "Over"
        }
    }

    static func enabledStatusWords(_ on: Bool) -> String { on ? "On" : "Off" }

    static func enabledStatusIcon(_ on: Bool) -> String {
        on ? "checkmark.circle.fill" : "circle"
    }

    static func syncStatusWords(offline: Bool, saving: Bool) -> String {
        if saving { return "Saving" }
        if offline { return "Offline" }
        return "Synced"
    }

    static func syncStatusIcon(offline: Bool, saving: Bool) -> String {
        if saving { return "arrow.triangle.2.circlepath.icloud" }
        if offline { return "icloud.slash" }
        return "checkmark.icloud.fill"
    }

    static func payoffCalculatorKeyLabel(_ key: String) -> String {
        switch key {
        case "C": return "Clear"
        case "⌫": return "Delete"
        case "±": return "Negate"
        case "%": return "Percent"
        case "÷": return "Divide"
        case "×": return "Multiply"
        case "−": return "Subtract"
        case "+": return "Add"
        case "=": return "Equals"
        case ".": return "Decimal point"
        default: return key
        }
    }

    static func subscriptionStatusIcon(_ kind: String) -> String {
        switch kind {
        case "duplicate": return "bolt.fill"
        case "trial": return "clock.fill"
        case "priceUp": return "arrow.up.circle.fill"
        case "stale": return "exclamationmark.triangle.fill"
        default: return "info.circle"
        }
    }

    // MARK: - Calendar

    static func calendarDayLabel(
        day: Int, monthLabel: String, hasItems: Bool, itemCount: Int,
        isToday: Bool, isSelected: Bool
    ) -> String {
        var parts = ["\(monthLabel) \(day)"]
        if isToday { parts.append("today") }
        if isSelected { parts.append("selected") }
        if hasItems {
            parts.append(itemCount == 1 ? "1 item due" : "\(itemCount) items due")
        } else {
            parts.append("nothing due")
        }
        return parts.joined(separator: ", ")
    }
}

// MARK: - Subscription status badge

struct SubscriptionStatusBadge: View {
    let icon: String
    let text: String
    var tone: A11y.MoneyTone = .neutral

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption2)
                .foregroundStyle(tone == .neutral ? Theme.muted : tone.color)
            Text(text)
                .font(Theme.ui(11))
                .foregroundStyle(Theme.text)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Form error banner

struct FormErrorBanner: View {
    let message: String

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundStyle(Theme.red)
            Text(message)
                .font(Theme.ui(13))
                .foregroundStyle(Theme.text)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Error. \(message)")
    }
}

// MARK: - Semantic amount (icon + value, not color-only)

struct SemanticAmount: View {
    let value: String
    let tone: A11y.MoneyTone
    var font: Font = Theme.mono(15, weight: .medium)
    var statusWords: String? = nil

    var body: some View {
        HStack(spacing: 4) {
            if let symbol = tone.symbolName {
                Image(systemName: symbol)
                    .font(.caption)
                    .foregroundStyle(tone.color)
            }
            Text(value)
                .font(font)
                .foregroundStyle(tone.color)
            if let statusWords {
                Text(statusWords)
                    .font(Theme.ui(11, weight: .medium))
                    .foregroundStyle(tone.color)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
    }

    private var accessibilityLabel: String {
        if let statusWords {
            return "\(value), \(statusWords)"
        }
        if let spoken = tone.spokenDescriptor {
            return "\(value), \(spoken)"
        }
        return value
    }
}

// MARK: - Chart bar (income history, etc.)

struct ChartBarRow: View {
    let label: String
    let value: String
    let fraction: Double

    var body: some View {
        HStack(spacing: 8) {
            Text(label)
                .font(Theme.ui(11))
                .foregroundStyle(Theme.muted)
                .frame(width: 64, alignment: .leading)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4).fill(Theme.surface2)
                    RoundedRectangle(cornerRadius: 4).fill(Theme.accent)
                        .frame(width: geo.size.width * CGFloat(max(0, min(1, fraction))))
                }
            }
            .frame(height: 14)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(label), \(value)")
            .accessibilityValue("\(Int(fraction * 100)) percent of peak month")
            Text(value)
                .font(Theme.mono(12, weight: .medium))
                .foregroundStyle(Theme.text)
                .frame(width: 78, alignment: .trailing)
        }
    }
}

// MARK: - Motion

extension View {
    /// Applies animation only when Reduce Motion is off.
    @ViewBuilder
    func animationIfAllowed<V: Equatable>(_ animation: Animation?, value: V) -> some View {
        modifier(ReducedMotionAnimationModifier(animation: animation, value: value))
    }

    /// Toolbar / icon-only control labels for VoiceOver and Voice Control.
    func accessibilityIconButton(_ label: String, hint: String? = nil) -> some View {
        accessibilityLabel(label)
            .accessibilityHint(hint ?? "")
    }
}

private struct ReducedMotionAnimationModifier<V: Equatable>: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let animation: Animation?
    let value: V

    func body(content: Content) -> some View {
        content.animation(reduceMotion ? nil : animation, value: value)
    }
}

@MainActor
func performWithAnimation(
    _ enabled: Bool,
    _ animation: Animation? = .default,
    _ updates: () -> Void
) {
    if enabled {
        withAnimation(animation, updates)
    } else {
        updates()
    }
}
