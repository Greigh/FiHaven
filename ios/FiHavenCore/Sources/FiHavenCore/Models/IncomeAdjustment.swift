import Foundation

/// A one-off or recurring change to a single period's income, stored in
/// `settings.incomeAdjustments`. `amount` is signed: positive adds (a bonus,
/// a raise), negative subtracts (unpaid time off). Mirrors income.js.
public struct IncomeAdjustment: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var label: String
    public var amount: Double      // signed
    public var kind: String        // "once" | "recurring"
    public var monthKey: String    // "once" → the single month it applies ("YYYY-MM")
    public var date: String        // "once" → the day it landed ("YYYY-MM-DD", "" = unset)
    public var startMonth: String  // "recurring" → first month (inclusive)
    public var endMonth: String    // "recurring" → last month ("" = ongoing)

    public init(
        id: String,
        label: String = "",
        amount: Double = 0,
        kind: String = "once",
        monthKey: String = "",
        date: String = "",
        startMonth: String = "",
        endMonth: String = ""
    ) {
        self.id = id
        self.label = label
        self.amount = amount
        self.kind = kind
        self.monthKey = monthKey
        self.date = date
        self.startMonth = startMonth
        self.endMonth = endMonth
    }

    public init?(json: JSONValue) {
        guard let o = json.asObject else { return nil }
        self.id = o["id"]?.asString ?? UUID().uuidString
        self.label = o["label"]?.asString ?? ""
        self.amount = o["amount"]?.asDouble ?? 0
        self.kind = o["kind"]?.asString == "recurring" ? "recurring" : "once"
        self.monthKey = o["monthKey"]?.asString ?? ""
        // Only a one-time change has a day. Older builds stamped it into
        // `monthKey`, so a legacy full date there becomes the date instead of
        // being dropped on the next save. Mirrors normalizeAdjustment.
        let rawDate = o["date"]?.asString ?? ""
        self.date = self.kind == "once"
            ? (dayOf(rawDate).isEmpty ? dayOf(self.monthKey) : dayOf(rawDate))
            : ""
        self.startMonth = o["startMonth"]?.asString ?? ""
        self.endMonth = o["endMonth"]?.asString ?? ""
    }

    public var json: JSONValue {
        .object([
            "id": .string(id),
            "label": .string(label),
            "amount": .number(amount),
            "kind": .string(kind),
            "monthKey": .string(monthKey),
            "date": .string(date),
            "startMonth": .string(startMonth),
            "endMonth": .string(endMonth),
        ])
    }

    /// True if this adjustment affects the month `mk` ("YYYY-MM").
    ///
    /// Every key is coerced to a month first. A *period* key is only a month
    /// key in calendar mode — the other modes key a period by its start date —
    /// so a caller handing over `bounds.key` used to match nothing, and a
    /// one-time adjustment stamped with a date by an older build was invisible
    /// to this and to every income total. Both heal here.
    public func applies(to mk: String) -> Bool {
        let m = monthOf(mk)
        guard !m.isEmpty else { return false }
        if kind == "recurring" {
            let start = monthOf(startMonth)
            let end = monthOf(endMonth)
            if !start.isEmpty && m < start { return false }
            if !end.isEmpty && m > end { return false }
            return true
        }
        return monthOf(monthKey) == m
    }
}

/// "YYYY-MM" from a month key or any longer date key ("YYYY-MM-DD").
/// Mirrors monthOf in income.js.
public func monthOf(_ key: String) -> String {
    key.count > 7 ? String(key.prefix(7)) : key
}

/// "YYYY-MM-DD" from anything that starts with one, else "".
/// Mirrors dayOf in income.js.
public func dayOf(_ key: String) -> String {
    let s = String(key.prefix(10))
    guard s.count == 10 else { return "" }
    let chars = Array(s)
    for (i, c) in chars.enumerated() {
        let wantsDash = (i == 4 || i == 7)
        if wantsDash ? c != "-" : !(c.isASCII && c.isNumber) { return "" }
    }
    return s
}
