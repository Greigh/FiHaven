import Foundation
import FiHavenCore

func runModelChecks() {
    section("Models — decode seed data") {
        let data = try JSONDecoder().decode(AppData.self, from: seedDataJSON)
        checkEqual(data.email, "demo@fihaven.app", "email")
        checkEqual(data.bills.count, 2, "bills count")
        checkEqual(data.cards.count, 2, "cards count")
        checkEqual(data.payments.count, 1, "payments count")

        let rent = data.bills[0]
        checkEqual(rent.name, "Rent", "bill name")
        checkClose(rent.amount, 1450, "bill amount")
        checkEqual(rent.dueDay, 1, "bill dueDay")
        check(rent.autopay, "bill autopay true")

        // Lenient: "85" (string) decodes to 85.
        checkClose(data.bills[1].amount, 85, "string amount → number")

        let chase = data.cards[0]
        check(chase.hasPromo, "card hasPromo")
        checkEqual(chase.promoEndDate, "2026-10-01", "promoEndDate")
        checkEqual(chase.promoBalance, 2340, "promoBalance")
        check(data.cards[1].promoEndDate == nil, "null promoEndDate → nil")
        check(data.cards[1].promoBalance == nil, "null promoBalance → nil")
    }

    section("Models — autopayDay round-trips and tolerates a string") {
        let bill = Bill(id: 1, name: "Rent", autopay: true, autopayDay: 18)
        let card = Card(id: 2, name: "Visa", autopay: true, autopayDay: 5)
        let rtBill = try JSONDecoder().decode(Bill.self, from: JSONEncoder().encode(bill))
        let rtCard = try JSONDecoder().decode(Card.self, from: JSONEncoder().encode(card))
        checkEqual(rtBill.autopayDay, 18, "bill autopayDay round-trip")
        checkEqual(rtCard.autopayDay, 5, "card autopayDay round-trip")

        // Missing key → nil (falls back to dueDay at the call sites).
        let plain = try JSONDecoder().decode(Bill.self, from: Data(#"{"id":3,"name":"x"}"#.utf8))
        check(plain.autopayDay == nil, "missing autopayDay → nil")
        // Web may write a string; flexibleInt tolerates it.
        let strDay = try JSONDecoder().decode(Card.self, from: Data(#"{"id":4,"name":"y","autopayDay":"12"}"#.utf8))
        checkEqual(strDay.autopayDay, 12, "string autopayDay → 12")
    }

    section("Perks — cycle keys, usage, totals") {
        let cal = DateLogic.calendar(tz: TimeZone(identifier: "America/New_York")!)
        var dc = DateComponents(); dc.year = 2026; dc.month = 6; dc.day = 20
        let jun20 = cal.date(from: dc)!

        checkEqual(Perks.cycleKey("monthly", date: jun20, cal: cal), "2026-06", "monthly key")
        checkEqual(Perks.cycleKey("quarterly", date: jun20, cal: cal), "2026-Q2", "quarterly key")
        checkEqual(Perks.cycleKey("semiannual", date: jun20, cal: cal), "2026-H1", "semiannual key")
        checkEqual(Perks.cycleKey("annual", date: jun20, cal: cal), "2026", "annual key")
        checkEqual(Perks.expiresInDays("monthly", date: jun20, cal: cal), 10, "10 days left in June")

        let perk = CardPerk(id: "P1", label: "Uber", amount: 10, frequency: "monthly")
        let card = Card(id: 1, name: "Visa", perks: [perk])
        var usage: [String: Double] = [:]
        checkClose(Perks.remaining(usage, cardId: "1", perk: perk, date: jun20, cal: cal), 10, "full remaining")

        usage = Perks.applyUsage(usage, cardId: "1", perk: perk, amount: 6, date: jun20, cal: cal)
        checkClose(Perks.used(usage, cardId: "1", perk: perk, date: jun20, cal: cal), 6, "used 6")
        checkClose(Perks.remaining(usage, cardId: "1", perk: perk, date: jun20, cal: cal), 4, "4 left")

        usage = Perks.applyUsage(usage, cardId: "1", perk: perk, amount: 999, date: jun20, cal: cal)
        checkClose(Perks.remaining(usage, cardId: "1", perk: perk, date: jun20, cal: cal), 0, "clamps to cap")
        checkClose(Perks.unrealizedTotal([card], usage: usage, date: jun20, cal: cal), 0, "nothing on table")
        checkClose(Perks.annualValue(card), 120, "annual value $120")

        // Round-trips through Card decode.
        let rt = try JSONDecoder().decode(Card.self, from: JSONEncoder().encode(card))
        checkEqual(rt.perks.count, 1, "perks round-trip count")
        checkEqual(rt.perks.first?.label, "Uber", "perk label round-trip")
    }

    section("Perks — annual-fee assessment") {
        let cal = DateLogic.calendar(tz: TimeZone(identifier: "America/New_York")!)
        var dc = DateComponents(); dc.year = 2026; dc.month = 6; dc.day = 20
        let jun20 = cal.date(from: dc)!
        let perk = CardPerk(id: "P1", label: "Uber", amount: 10, frequency: "monthly")
        let card = Card(id: 1, name: "Visa", perks: [perk], annualFee: 95)

        check(Perks.feeAssessment(Card(id: 2, name: "Free"), usage: [:], date: jun20, cal: cal) == nil, "fee-free → nil")

        // No usage: potential $120 covers $95 fee → optimize.
        var usage: [String: Double] = [:]
        var a = Perks.feeAssessment(card, usage: usage, date: jun20, cal: cal)!
        checkClose(a.potential, 120, "potential 120")
        checkClose(a.captured, 0, "captured 0")
        checkEqual(a.verdict.rawValue, "optimize", "optimize when unused")

        // Use the full $10 this month → annualized $120 ≥ fee → keep.
        usage = Perks.applyUsage(usage, cardId: "1", perk: perk, amount: 10, date: jun20, cal: cal)
        a = Perks.feeAssessment(card, usage: usage, date: jun20, cal: cal)!
        checkClose(a.captured, 120, "captured 120")
        checkClose(a.net, 25, "net +25")
        checkEqual(a.verdict.rawValue, "keep", "keep when captured covers fee")

        // Fee perks can never cover → review.
        let pricey = Card(id: 3, name: "Travel", perks: [CardPerk(id: "P2", label: "Credit", amount: 100, frequency: "annual")], annualFee: 550)
        checkEqual(Perks.feeAssessment(pricey, usage: [:], date: jun20, cal: cal)!.verdict.rawValue, "review", "review when fee > potential")

        // A spend-based rewards estimate folds into the verdict: $100 rewards
        // alone covers the $95 fee with no perk usage → keep.
        let withRewards = Perks.feeAssessment(card, usage: [:], date: jun20, cal: cal, rewardsEstimate: 100)!
        checkClose(withRewards.rewards, 100, "rewards estimate carried")
        checkClose(withRewards.value, 100, "value = captured 0 + rewards 100")
        checkClose(withRewards.net, 5, "net +5 with rewards")
        checkEqual(withRewards.verdict.rawValue, "keep", "keep once rewards cover the fee")
        // Negative estimates floor at 0 (verdict unchanged).
        checkClose(Perks.feeAssessment(card, usage: [:], date: jun20, cal: cal, rewardsEstimate: -50)!.rewards, 0, "negative estimate floored")

        // annualFee/feeMonth round-trip.
        let rt = try JSONDecoder().decode(Card.self, from: JSONEncoder().encode(Card(id: 9, name: "X", annualFee: 95, feeMonth: 3)))
        checkClose(rt.annualFee ?? 0, 95, "annualFee round-trip")
        checkEqual(rt.feeMonth, 3, "feeMonth round-trip")
    }

    section("Models — settings typed accessors") {
        let data = try JSONDecoder().decode(AppData.self, from: seedDataJSON)
        checkEqual(data.settings.timezone, "America/New_York", "timezone")
        checkEqual(data.settings.theme, "dark", "theme")
        checkClose(data.settings.income, 4506.67, "legacy income")
        checkEqual(data.settings.incomes.count, 1, "incomes count")
        checkEqual(data.settings.incomes[0].frequency, "biweekly", "income freq")
        checkClose(data.settings.incomes[0].amount, 2080, "income amount")
    }

    section("Models — settings preserves unknown keys on round-trip") {
        let data = try JSONDecoder().decode(AppData.self, from: seedDataJSON)
        let reencoded = try JSONEncoder().encode(data)
        let again = try JSONDecoder().decode(AppData.self, from: reencoded)
        check(again.settings.raw["unknownWebKey"] != nil, "web-only key survives save")
        if case .object(let o)? = again.settings.raw["unknownWebKey"] {
            check(o["nested"] != nil, "nested shape survives")
        } else {
            check(false, "unknownWebKey lost its shape")
        }
    }

    section("Models — empty detection") {
        check(AppData().isEmpty, "fresh AppData is empty")
        check(!AppData(bills: [Bill(id: 1, name: "x")]).isEmpty, "with a bill is not empty")
    }
}
