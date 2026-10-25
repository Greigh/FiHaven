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
        let icon: CategoryIcon
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

    private func itemsByDay(year y: Int, month m: Int) -> [Int: [DayItem]] {
        var map: [Int: [DayItem]] = [:]
        let first = DateLogic.dateForDay(1, year: y, month: m, cal: cal)
        let days = cal.range(of: .day, in: .month, for: first)?.count ?? 30
        for b in store.activeBills {
            for day in 1...days {
                let d = cal.date(byAdding: .day, value: day - 1, to: first)!
                guard BillSchedule.dueOn(b, date: d, tz: store.tz) else { continue }
                map[day, default: []].append(DayItem(
                    id: "bill-\(b.id)", name: b.name, amount: b.amountOrZero,
                    icon: CTConstants.iconInfo(forCategory: b.category, overrides: store.data.settings.categoryIcons), type: "bill", refId: String(b.id)))
            }
        }
        for c in store.activeCards {
            guard let d = c.dueDay else { continue }
            let amt = c.hasPromo ? max(c.minPaymentOrZero, Schedule.promoNeeded(c, tz: store.tz)) : c.minPaymentOrZero
            map[d, default: []].append(DayItem(
                id: "card-\(c.id)", name: c.name + " (payment)", amount: amt,
                icon: IssuerIcons.iconInfo(for: c), type: "card", refId: String(c.id)))
        }
        return map
    }

    /// This month's items — what the phone's single-month view reads.
    private var itemsByDay: [Int: [DayItem]] { itemsByDay(year: year, month: month) }

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 7)

    var body: some View {
        #if canImport(UIKit)
        phoneBody
        #else
        macBody
        #endif
    }

    private var phoneBody: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                weekdayHeader
                grid
                selectedList
            }
            .padding()
            .ctReadableColumn()
        }
        .background(Theme.bg.ignoresSafeArea())
        .brandedNavigationBar(store.monthLabel)
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
            // Blank ids run negative: `0..<leadingBlanks` overlaps the day ids
            // `1...daysInMonth`, and LazyVGrid drops every duplicate — for a
            // Thursday-first month that ate days 1–3.
            ForEach(-leadingBlanks..<0, id: \.self) { _ in Color.clear.frame(height: 44) }
            ForEach(1...daysInMonth, id: \.self) { day in
                dayCell(day)
            }
        }
        .ctCard()
    }

    private func dayCell(_ day: Int) -> some View {
        let items = itemsByDay[day] ?? []
        let has = !items.isEmpty
        let isToday = day == todayDay
        let isSelected = day == selectedDay
        return VStack(spacing: 3) {
            Text("\(day)")
                .font(Theme.ui(14, weight: isToday ? .bold : .regular))
                .foregroundStyle(isSelected ? .white : (isToday ? Theme.accent : Theme.text))
            if has {
                Text("•")
                    .font(Theme.mono(10, weight: .bold))
                    .foregroundStyle(isSelected ? .white : Theme.accent)
            } else {
                Color.clear.frame(width: 5, height: 5)
            }
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
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            A11y.calendarDayLabel(
                day: day,
                monthLabel: store.monthLabel,
                hasItems: has,
                itemCount: items.count,
                isToday: isToday,
                isSelected: isSelected
            )
        )
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
        .accessibilityHint(has ? "Shows what's due on this day." : "Shows this day's due items.")
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
        let icon = A11y.paidStateIcon(state)
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
                VStack(spacing: 2) {
                    Image(systemName: icon).foregroundStyle(color)
                    Text(A11y.paidStateLabel(state))
                        .font(Theme.ui(9, weight: .medium))
                        .foregroundStyle(color)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(item.name), \(A11y.paidStateLabel(state))")
            .accessibilityHint("Opens payment screen")
            // Bills and cards share the day's list — fixed slot, so an
            // issuer tile and a bill's emoji start their names alike.
            IconMark(icon: item.icon, size: 18, slot: IssuerTile.width(18))
                .accessibilityHidden(true)
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

    // MARK: - Mac month view

    #if !canImport(UIKit)
    /// A day slot in the Mac grid: its number and whether it belongs to the
    /// month on display, so the previous/next month's spilling days can dim.
    private struct MacCalDay: Hashable { let day: Int; let inMonth: Bool }

    @State private var monthOffset = 0

    private var displayComps: DateComponents {
        let base = DateLogic.today(tz: store.tz)
        let moved = cal.date(byAdding: .month, value: monthOffset, to: base) ?? base
        return cal.dateComponents([.year, .month], from: moved)
    }
    private var displayYear: Int { displayComps.year ?? year }
    private var displayMonth: Int { displayComps.month ?? month }

    private var displayMonthLabel: String {
        let d = DateLogic.dateForDay(1, year: displayYear, month: displayMonth, cal: cal)
        let f = DateFormatter()
        f.calendar = cal
        f.timeZone = store.tz
        f.dateFormat = "LLLL yyyy"
        return f.string(from: d)
    }

    private var displayItemsByDay: [Int: [DayItem]] { itemsByDay(year: displayYear, month: displayMonth) }

    /// The weeks on display, with the neighbouring months' days dimming into
    /// the grid's edges the way a printed calendar's do.
    private var displayWeeks: [[MacCalDay]] {
        let first = DateLogic.dateForDay(1, year: displayYear, month: displayMonth, cal: cal)
        let days = cal.range(of: .day, in: .month, for: first)?.count ?? 30
        let blanks = cal.component(.weekday, from: first) - 1
        let prev = cal.date(byAdding: .month, value: -1, to: first) ?? first
        let prevDays = cal.range(of: .day, in: .month, for: prev)?.count ?? 30
        var weeks: [[MacCalDay]] = []
        var n = 0
        let total = blanks + days
        for _ in 0..<Int(ceil(Double(total) / 7.0)) {
            var week: [MacCalDay] = []
            for _ in 0..<7 {
                n += 1
                if n <= blanks {
                    week.append(MacCalDay(day: prevDays - blanks + n, inMonth: false))
                } else if n <= total {
                    week.append(MacCalDay(day: n - blanks, inMonth: true))
                } else {
                    week.append(MacCalDay(day: n - total, inMonth: false))
                }
            }
            weeks.append(week)
        }
        return weeks
    }

    private var macBody: some View {
        // One month scan per render — itemsByDay walks every bill over every
        // day, so asking for it per cell pays that cost ~42 times.
        let dayItems = displayItemsByDay
        return GeometryReader { pane in
            VStack(spacing: 0) {
                macTitleRow
                macWeekdayHeader
                if pane.size.width >= 880 {
                    HStack(alignment: .top, spacing: 16) {
                        macGrid(items: dayItems)
                        macInspector(items: dayItems)
                            .frame(width: 300)
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
                    .frame(maxHeight: .infinity)
                } else {
                    // Too narrow for a side inspector: the grid fills the
                    // width and the day's list scrolls underneath.
                    ScrollView {
                        VStack(spacing: 12) {
                            macGrid(items: dayItems)
                                .frame(height: max(400, pane.size.height * 0.62))
                            macInspector(items: dayItems)
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 16)
                    }
                }
            }
        }
        .background(Theme.bg.ignoresSafeArea())
        .brandedNavigationBar(displayMonthLabel)
        .onAppear { if selectedDay == 0 { selectedDay = todayDay } }
        .onChange(of: monthOffset) { _, _ in selectedDay = monthOffset == 0 ? todayDay : 0 }
        .sheet(item: $paying) { target in PayView(target: target) }
    }

    /// The month name and the paging controls a month view lives by — back,
    /// forward, and a Today that returns to this month.
    private var macTitleRow: some View {
        HStack(spacing: 10) {
            Text(displayMonthLabel)
                .font(Theme.ui(20, weight: .bold))
                .foregroundStyle(Theme.text)
            Spacer()
            Button { monthOffset = 0 } label: { Text("Today") }
                .ctPlainButton()
                .disabled(monthOffset == 0)
                .opacity(monthOffset == 0 ? 0.4 : 1)
                .accessibilityHint("Returns to this month")
            Button { monthOffset -= 1 } label: { Image(systemName: "chevron.left") }
                .ctPlainButton()
                .accessibilityLabel("Previous month")
            Button { monthOffset += 1 } label: { Image(systemName: "chevron.right") }
                .ctPlainButton()
                .accessibilityLabel("Next month")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var macWeekdayHeader: some View {
        HStack(spacing: 1) {
            ForEach(Array(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].enumerated()), id: \.offset) { _, d in
                Text(d)
                    .font(Theme.ui(11, weight: .semibold))
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    /// The month grid: hairline-separated cells that share the pane's height,
    /// with due items drawn as chips inside their day the way a calendar's
    /// events sit inside theirs.
    private func macGrid(items dayItems: [Int: [DayItem]]) -> some View {
        VStack(spacing: 1) {
            ForEach(Array(displayWeeks.enumerated()), id: \.offset) { _, week in
                HStack(spacing: 1) {
                    ForEach(week, id: \.self) { d in
                        macCell(d, items: d.inMonth ? (dayItems[d.day] ?? []) : [])
                    }
                }
                .frame(maxHeight: .infinity)
            }
        }
        .background(Theme.border.opacity(0.7))
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radiusCard, style: .continuous)
                .stroke(Theme.border, lineWidth: 1)
        )
    }

    private func macCell(_ d: MacCalDay, items: [DayItem]) -> some View {
        let isToday = d.inMonth && monthOffset == 0 && d.day == todayDay
        let isSelected = d.inMonth && d.day == selectedDay
        return VStack(alignment: .leading, spacing: 4) {
            Text("\(d.day)")
                .font(Theme.ui(13, weight: isToday ? .bold : .regular))
                .foregroundStyle(isToday ? .white : (d.inMonth ? Theme.text : Theme.muted.opacity(0.45)))
                .frame(width: 22, height: 22)
                .background(isToday ? Theme.accent : .clear)
                .clipShape(Circle())

            ForEach(items.prefix(3)) { item in
                macChip(item)
            }
            if items.count > 3 {
                Text("+\(items.count - 3) more")
                    .font(Theme.ui(9, weight: .medium))
                    .foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(6)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(isSelected ? Theme.accent.opacity(0.12) : Theme.bg)
        .contentShape(Rectangle())
        .onTapGesture { if d.inMonth { selectedDay = d.day } }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            A11y.calendarDayLabel(
                day: d.day,
                monthLabel: displayMonthLabel,
                hasItems: !items.isEmpty,
                itemCount: items.count,
                isToday: isToday,
                isSelected: isSelected
            )
        )
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
        .accessibilityHint(items.isEmpty ? "Shows this day's due items." : "Shows what's due on this day.")
    }

    /// One due item inside a day cell: the paid-state dot and the name — the
    /// amount lives in the inspector, where there's room to show it.
    private func macChip(_ item: DayItem) -> some View {
        let color: Color = {
            switch store.paidState(type: item.type, refId: item.refId) {
            case .full: return Theme.green
            case .partial: return Theme.orange
            case .unpaid: return Theme.muted
            }
        }()
        return HStack(spacing: 5) {
            Circle().fill(color).frame(width: 5, height: 5)
            Text(item.name)
                .font(Theme.ui(11, weight: .medium))
                .foregroundStyle(Theme.text)
                .lineLimit(1)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface2)
        .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
    }

    /// The selected day, beside the grid the way Calendar's inspector sits
    /// beside its month — the same due rows the phone shows below it.
    private func macInspector(items dayItems: [Int: [DayItem]]) -> some View {
        let items = selectedDay == 0 ? [] : (dayItems[selectedDay] ?? [])
        return VStack(alignment: .leading, spacing: 8) {
            Text(selectedDay == 0
                 ? "Choose a day"
                 : "Due on \(displayMonthLabel.split(separator: " ").first.map(String.init) ?? "") \(selectedDay)\(ordinal(selectedDay))")
                .font(Theme.ui(13, weight: .semibold))
                .foregroundStyle(Theme.muted)
            if items.isEmpty {
                Text(selectedDay == 0 ? "Select a day to see what's due." : "Nothing due this day.")
                    .font(Theme.ui(14))
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .ctCard()
            } else {
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(Array(items.enumerated()), id: \.element.id) { i, item in
                            if i > 0 { Divider().overlay(Theme.border) }
                            dueRow(item)
                        }
                    }
                }
                .ctCard(padding: 0)
            }
            Spacer(minLength: 0)
        }
        .frame(maxHeight: .infinity)
    }
    #endif
}
