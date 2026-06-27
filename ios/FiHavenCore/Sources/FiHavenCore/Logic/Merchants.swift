import Foundation

/// Merchant → spend-category hints. A tiny keyword table that guesses which
/// reward category a merchant name belongs to ("Starbucks" → Dining). Powers
/// the optimizer's "you shopped at X — best card is Y" nudge and the
/// spend-based rewards estimate. A hint, never a hard classification: an
/// unknown merchant returns nil. Mirrors the web `merchants.js` (and Android
/// `Merchants.kt`) — keep all three in sync. Categories returned are exactly
/// `Rewards.categories`.
public enum Merchants {
    /// (substring, category) pairs. Order matters: the FIRST match wins, so
    /// more-specific merchants come before broad keywords.
    public static let hints: [(String, String)] = [
        // Groceries
        ("whole foods", "Groceries"), ("trader joe", "Groceries"), ("safeway", "Groceries"),
        ("kroger", "Groceries"), ("publix", "Groceries"), ("aldi", "Groceries"),
        ("wegmans", "Groceries"), ("costco", "Groceries"), ("sam's club", "Groceries"),
        ("heb", "Groceries"), ("h-e-b", "Groceries"), ("sprouts", "Groceries"),
        ("food lion", "Groceries"), ("giant", "Groceries"), ("supermarket", "Groceries"),
        ("grocery", "Groceries"),
        // Gas
        ("shell", "Gas"), ("chevron", "Gas"), ("exxon", "Gas"), ("mobil", "Gas"),
        ("bp ", "Gas"), ("texaco", "Gas"), ("valero", "Gas"), ("marathon", "Gas"),
        ("speedway", "Gas"), ("arco", "Gas"), ("sunoco", "Gas"), ("citgo", "Gas"),
        ("gas station", "Gas"), ("fuel", "Gas"), ("phillips 66", "Gas"),
        // Transit / rideshare
        ("uber", "Transit"), ("lyft", "Transit"), ("metro", "Transit"),
        ("transit", "Transit"), ("parking", "Transit"), ("toll", "Transit"),
        ("mta", "Transit"), ("bart", "Transit"), ("amtrak", "Transit"),
        ("subway tran", "Transit"),
        // Travel
        ("airline", "Travel"), ("airlines", "Travel"), ("hotel", "Travel"),
        ("marriott", "Travel"), ("hilton", "Travel"), ("hyatt", "Travel"),
        ("airbnb", "Travel"), ("expedia", "Travel"), ("delta", "Travel"),
        ("united air", "Travel"), ("american air", "Travel"), ("southwest", "Travel"),
        ("booking.com", "Travel"), ("airport", "Travel"), ("rental car", "Travel"),
        ("hertz", "Travel"), ("enterprise rent", "Travel"),
        // Streaming
        ("netflix", "Streaming"), ("spotify", "Streaming"), ("hulu", "Streaming"),
        ("disney+", "Streaming"), ("disney plus", "Streaming"), ("hbo", "Streaming"),
        ("max.com", "Streaming"), ("youtube premium", "Streaming"), ("youtube tv", "Streaming"),
        ("apple music", "Streaming"), ("paramount+", "Streaming"), ("peacock", "Streaming"),
        ("audible", "Streaming"), ("pandora", "Streaming"),
        // Drugstores
        ("cvs", "Drugstores"), ("walgreens", "Drugstores"), ("rite aid", "Drugstores"),
        ("pharmacy", "Drugstores"), ("drugstore", "Drugstores"), ("duane reade", "Drugstores"),
        // Online shopping
        ("amazon", "Online shopping"), ("ebay", "Online shopping"), ("etsy", "Online shopping"),
        ("paypal", "Online shopping"), ("wayfair", "Online shopping"), ("shopify", "Online shopping"),
        ("aliexpress", "Online shopping"), ("temu", "Online shopping"), ("chewy", "Online shopping"),
        // Dining
        ("starbucks", "Dining"), ("dunkin", "Dining"), ("mcdonald", "Dining"),
        ("chipotle", "Dining"), ("doordash", "Dining"), ("grubhub", "Dining"),
        ("ubereats", "Dining"), ("uber eats", "Dining"), ("restaurant", "Dining"),
        ("cafe", "Dining"), ("coffee", "Dining"), ("pizza", "Dining"), ("grill", "Dining"),
        ("kitchen", "Dining"), ("taqueria", "Dining"), ("bakery", "Dining"),
        ("bar & grill", "Dining"), ("diner", "Dining"), ("panera", "Dining"),
        ("subway", "Dining"), ("wendy", "Dining"), ("taco bell", "Dining"),
        ("burger", "Dining"),
    ]

    /// Guess the reward category for a merchant name, or nil when nothing
    /// matches. Case-insensitive substring match, first hint wins.
    public static func category(_ merchant: String?) -> String? {
        guard let merchant, !merchant.isEmpty else { return nil }
        let m = merchant.lowercased()
        for (needle, category) in hints where m.contains(needle) { return category }
        return nil
    }
}
