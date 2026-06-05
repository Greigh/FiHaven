import Foundation

let utcTZ = TimeZone(identifier: "UTC")!

/// Build a fixed Date for deterministic date-logic checks.
func makeDate(_ y: Int, _ m: Int, _ d: Int, hour: Int = 12, tz: TimeZone = utcTZ) -> Date {
    var c = DateComponents()
    c.year = y; c.month = m; c.day = d; c.hour = hour
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = tz
    return cal.date(from: c)!
}

/// The seed dataset from app.js, with a couple of deliberate quirks
/// (a string amount, a web-only settings key) to exercise leniency.
let seedDataJSON = """
{
  "email": "demo@fihaven.app",
  "bills": [
    { "id": 1, "name": "Rent", "category": "Housing", "amount": 1450, "dueDay": 1, "frequency": "Monthly", "autopay": true, "notes": "Oakwood Apts" },
    { "id": 2, "name": "Electric", "category": "Utilities", "amount": "85", "dueDay": 15, "frequency": "Monthly", "autopay": false, "notes": "AEP account" }
  ],
  "cards": [
    { "id": 10, "name": "Chase Freedom Flex", "balance": 2340, "limit": 8000, "minPayment": 35, "regularAPR": 24.99, "hasPromo": true, "promoAPR": 0, "promoEndDate": "2026-10-01", "promoBalance": 2340, "dueDay": 18, "autopay": false, "notes": "1.5% cashback" },
    { "id": 12, "name": "Discover It", "balance": 450, "limit": 3500, "minPayment": 15, "regularAPR": 26.99, "hasPromo": false, "promoAPR": null, "promoEndDate": null, "promoBalance": null, "dueDay": 25, "autopay": false, "notes": "" }
  ],
  "payments": [
    { "id": 1730000000000, "type": "bill", "refId": "1", "name": "Rent", "amount": 1450, "date": "2026-05-01", "monthKey": "2026-05", "note": "" }
  ],
  "settings": {
    "incomes": [ { "id": "src-seed-1", "label": "Primary paycheck", "amount": 2080, "frequency": "biweekly" } ],
    "income": 4506.67,
    "timezone": "America/New_York",
    "theme": "dark",
    "unknownWebKey": { "nested": [1, 2, 3] }
  }
}
""".data(using: .utf8)!
