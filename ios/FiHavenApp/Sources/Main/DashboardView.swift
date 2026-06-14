import SwiftUI
import FiHavenCore

/// The dashboard: monthly overview + upcoming items, built from the
/// store's derived values (Income / Schedule from FiHavenCore).
struct DashboardView: View {
    @EnvironmentObject var store: AppStore
    @State private var paying: PayTarget?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                summary
                upcomingSection
            }
            .padding()
        }
        .background(Theme.bg.ignoresSafeArea())
        .navigationTitle(store.monthLabel)
        .navigationBarTitleDisplayMode(.large)
        .overlay {
            if !store.loaded && store.dashboardUpcoming.isEmpty {
                ProgressView()
            }
        }
        .sheet(item: $paying) { target in PayView(target: target) }
    }

    // ── Summary cards ────────────────────────────────────────────────
    private var summary: some View {
        HStack(spacing: 12) {
            stat(store.incomeLabel, Money.fmt(store.periodIncome), Theme.green)
            stat(store.owedLabel, Money.fmt(store.remainingThisMonth), Theme.accent)
        }
    }

    private func stat(_ label: String, _ value: String, _ accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            FieldLabel(text: label)
            Text(value)
                .font(Theme.mono(22, weight: .semibold))
                .foregroundStyle(accent)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
        }
        .ctCard()
    }

    // ── Upcoming ─────────────────────────────────────────────────────
    private var upcomingSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Upcoming")
                .font(Theme.ui(13, weight: .semibold))
                .tracking(0.4)
                .foregroundStyle(Theme.muted)

            if store.dashboardUpcoming.isEmpty {
                Text(store.loaded ? "Nothing scheduled — add a bill or card." : "Loading…")
                    .font(Theme.ui(15))
                    .foregroundStyle(Theme.muted)
                    .ctCard()
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(store.dashboardUpcoming.enumerated()), id: \.element.id) { index, item in
                        if index > 0 { Divider().overlay(Theme.border) }
                        UpcomingRow(
                            item: item,
                            state: store.paidState(item),
                            paidSoFar: store.paidAmount(item),
                            goal: store.goalAmount(item),
                            remaining: store.remaining(item),
                            tz: store.tz
                        )
                        .contentShape(Rectangle())
                        .onTapGesture { paying = PayTarget(item) }
                    }
                }
                .ctCard(padding: 0)
            }
        }
    }
}

private struct UpcomingRow: View {
    let item: UpcomingItem
    let state: PaidState
    let paidSoFar: Double
    let goal: Double
    let remaining: Double
    let tz: TimeZone

    var body: some View {
        HStack(spacing: 12) {
            Text(item.icon).font(.system(size: 22))

            VStack(alignment: .leading, spacing: 2) {
                Text(item.name)
                    .font(Theme.ui(15, weight: .medium))
                    .foregroundStyle(Theme.text)
                Text(dueLabel)
                    .font(Theme.ui(12))
                    .foregroundStyle(labelColor)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(Money.fmt(state == .full ? goal : remaining))
                    .font(Theme.mono(15, weight: .medium))
                    .foregroundStyle(Theme.text)
                if item.autopay {
                    Text("autopay")
                        .font(Theme.mono(9))
                        .foregroundStyle(Theme.muted)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    private var labelColor: Color {
        switch state {
        case .full: return Theme.green
        case .partial: return Theme.orange
        case .unpaid: return dueColor
        }
    }

    private var dueColor: Color {
        if item.days < 0 { return Theme.red }
        if item.days <= 3 { return Theme.orange }
        return Theme.muted
    }

    private var dueLabel: String {
        switch state {
        case .full: return "Paid this month"
        case .partial: return "Paid \(Money.fmt(paidSoFar)) of \(Money.fmt(goal))"
        case .unpaid: break
        }
        let when: String
        switch item.days {
        case ..<0: when = "Overdue"
        case 0: when = "Due today"
        case 1: when = "Due tomorrow"
        default: when = "Due in \(item.days) days"
        }
        if let next = item.nextDue {
            return "\(when) · \(Self.short(next, tz: tz))"
        }
        return when
    }

    private static func short(_ date: Date, tz: TimeZone) -> String {
        let f = DateFormatter()
        f.timeZone = tz
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = "MMM d"
        return f.string(from: date)
    }
}
