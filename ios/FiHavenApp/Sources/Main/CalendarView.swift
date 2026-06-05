import SwiftUI
import FiHavenCore

/// Month grid of due dates. Days with bills/cards due show a dot; tapping
/// a day lists what's due, with mark-paid.
struct CalendarView: View {
    @EnvironmentObject var store: AppStore
    @State private var selectedDay: Int = 0
    @State private var paying: PayTarget?

    private struct DayItem: Identifiable {
        let id: String
        let name: String
        let amount: Double
        let icon: String
        let type: String
        let refId: String
    }

    private var cal: Calendar { DateLogic.calendar(tz: store.tz) }
    private var nowComps: DateComponents { cal.dateComponents([.year, .month, .day], from: Date()) }
    private var year: Int { nowComps.year ?? 2026 }
    private var month: Int { nowComps.month ?? 1 }
    private var todayDay: Int { nowComps.day ?? 1 }

    private var daysInMonth: Int {
        let first = DateLogic.dateForDay(1, year: year, month: month, cal: cal)
        return cal.range(of: .day, in: .month, for: first)?.count ?? 30
    }
    private var leadingBlanks: Int {
        let first = DateLogic.dateForDay(1, year: year, month: month, cal: cal)
        return cal.component(.weekday, from: first) - 1   // 1=Sun
    }

    private var itemsByDay: [Int: [DayItem]] {
        var map: [Int: [DayItem]] = [:]
        for b in store.data.bills {
            guard let d = b.dueDay else { continue }
            map[d, default: []].append(DayItem(
                id: "bill-\(b.id)", name: b.name, amount: b.amount,
                icon: CTConstants.icon(forCategory: b.category), type: "bill", refId: String(b.id)))
        }
        for c in store.data.cards {
            guard let d = c.dueDay else { continue }
            let amt = c.hasPromo ? max(c.minPayment, Schedule.promoNeeded(c, tz: store.tz)) : c.minPayment
            map[d, default: []].append(DayItem(
                id: "card-\(c.id)", name: c.name + " (payment)", amount: amt,
                icon: CTConstants.cardIcon, type: "card", refId: String(c.id)))
        }
        return map
    }

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 7)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                weekdayHeader
                grid
                selectedList
            }
            .padding()
        }
        .background(Theme.bg.ignoresSafeArea())
        .navigationTitle(store.monthLabel)
        .onAppear { if selectedDay == 0 { selectedDay = todayDay } }
        .sheet(item: $paying) { target in PayView(target: target) }
    }

    private var weekdayHeader: some View {
        LazyVGrid(columns: columns, spacing: 6) {
            // Index-based id: "T" and "S" repeat, so id:\.self would collapse them.
            ForEach(Array(["S", "M", "T", "W", "T", "F", "S"].enumerated()), id: \.offset) { _, d in
                Text(d).font(Theme.mono(11, weight: .medium)).foregroundStyle(Theme.muted)
            }
        }
    }

    private var grid: some View {
        LazyVGrid(columns: columns, spacing: 6) {
            ForEach(0..<leadingBlanks, id: \.self) { _ in Color.clear.frame(height: 44) }
            ForEach(1...daysInMonth, id: \.self) { day in
                dayCell(day)
            }
        }
        .ctCard()
    }

    private func dayCell(_ day: Int) -> some View {
        let has = !(itemsByDay[day] ?? []).isEmpty
        let isToday = day == todayDay
        let isSelected = day == selectedDay
        return VStack(spacing: 3) {
            Text("\(day)")
                .font(Theme.ui(14, weight: isToday ? .bold : .regular))
                .foregroundStyle(isSelected ? .white : (isToday ? Theme.accent : Theme.text))
            Circle()
                .fill(has ? (isSelected ? Color.white : Theme.accent) : .clear)
                .frame(width: 5, height: 5)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 44)
        .background(isSelected ? Theme.accent : .clear)
        .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 9)
                .stroke(isToday && !isSelected ? Theme.accent : .clear, lineWidth: 1)
        )
        .contentShape(Rectangle())
        .onTapGesture { selectedDay = day }
    }

    @ViewBuilder
    private var selectedList: some View {
        let items = itemsByDay[selectedDay] ?? []
        VStack(alignment: .leading, spacing: 8) {
            Text("Due on the \(selectedDay)\(ordinal(selectedDay))")
                .font(Theme.ui(13, weight: .semibold)).foregroundStyle(Theme.muted)
            if items.isEmpty {
                Text("Nothing due this day.").font(Theme.ui(14)).foregroundStyle(Theme.muted).ctCard()
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { i, item in
                        if i > 0 { Divider().overlay(Theme.border) }
                        dueRow(item)
                    }
                }
                .ctCard(padding: 0)
            }
        }
    }

    private func dueRow(_ item: DayItem) -> some View {
        let state = store.paidState(type: item.type, refId: item.refId)
        let icon: String = {
            switch state {
            case .full: return "checkmark.circle.fill"
            case .partial: return "circle.lefthalf.filled"
            case .unpaid: return "circle"
            }
        }()
        let color: Color = {
            switch state {
            case .full: return Theme.green
            case .partial: return Theme.orange
            case .unpaid: return Theme.muted
            }
        }()
        return HStack(spacing: 12) {
            Button {
                paying = PayTarget(type: item.type, refId: item.refId, name: item.name)
            } label: {
                Image(systemName: icon).foregroundStyle(color)
            }
            .buttonStyle(.plain)
            Text(item.icon)
            Text(item.name).font(Theme.ui(15)).foregroundStyle(Theme.text)
            Spacer()
            Text(Money.fmt(item.amount)).font(Theme.mono(14, weight: .medium)).foregroundStyle(Theme.text)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
    }

    private func ordinal(_ n: Int) -> String {
        switch n % 100 {
        case 11, 12, 13: return "th"
        default:
            switch n % 10 { case 1: return "st"; case 2: return "nd"; case 3: return "rd"; default: return "th" }
        }
    }
}
