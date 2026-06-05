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
