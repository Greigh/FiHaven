import Foundation

/// A savings goal — a target amount, how much is saved so far, and an
/// optional target date used to suggest a monthly contribution. Mirrors
/// the web `goals` shape.
public struct SavingsGoal: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var target: Double
    public var saved: Double
    public var targetDate: String   // "YYYY-MM-DD" or ""
    public var notes: String

    public init(
        id: String,
        name: String = "",
        target: Double = 0,
        saved: Double = 0,
        targetDate: String = "",
        notes: String = ""
    ) {
        self.id = id
        self.name = name
        self.target = target
        self.saved = saved
        self.targetDate = targetDate
        self.notes = notes
    }

    enum CodingKeys: String, CodingKey {
        case id, name, target, saved, targetDate, notes
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.flexibleString(.id) ?? ""
        name = c.flexibleString(.name) ?? ""
        target = c.flexibleDouble(.target) ?? 0
        saved = c.flexibleDouble(.saved) ?? 0
        targetDate = c.flexibleString(.targetDate) ?? ""
        notes = c.flexibleString(.notes) ?? ""
    }

    /// 0–1 progress toward the target.
    public var progress: Double { target > 0 ? min(1, saved / target) : 0 }
    public var remaining: Double { max(0, target - saved) }
}
