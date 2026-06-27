package app.fihaven.core.logic

/**
 * Merchant → spend-category hints. A tiny keyword table that guesses which
 * reward category a merchant name belongs to ("Starbucks" → Dining). Powers
 * the optimizer's "you shopped at X — best card is Y" nudge and the
 * spend-based rewards estimate. A hint, never a hard classification: an
 * unknown merchant returns null. Mirrors the web `merchants.js` (and iOS
 * `Merchants.swift`) — keep all three in sync. Categories returned are
 * exactly [Rewards.CATEGORIES].
 */
object Merchants {
    /** (substring, category) pairs. Order matters: the FIRST match wins, so
     *  more-specific merchants come before broad keywords. */
    val HINTS: List<Pair<String, String>> = listOf(
        // Groceries
        "whole foods" to "Groceries", "trader joe" to "Groceries", "safeway" to "Groceries",
        "kroger" to "Groceries", "publix" to "Groceries", "aldi" to "Groceries",
        "wegmans" to "Groceries", "costco" to "Groceries", "sam's club" to "Groceries",
        "heb" to "Groceries", "h-e-b" to "Groceries", "sprouts" to "Groceries",
        "food lion" to "Groceries", "giant" to "Groceries", "supermarket" to "Groceries",
        "grocery" to "Groceries",
        // Gas
        "shell" to "Gas", "chevron" to "Gas", "exxon" to "Gas", "mobil" to "Gas",
        "bp " to "Gas", "texaco" to "Gas", "valero" to "Gas", "marathon" to "Gas",
        "speedway" to "Gas", "arco" to "Gas", "sunoco" to "Gas", "citgo" to "Gas",
        "gas station" to "Gas", "fuel" to "Gas", "phillips 66" to "Gas",
        // Transit / rideshare
        "uber" to "Transit", "lyft" to "Transit", "metro" to "Transit",
        "transit" to "Transit", "parking" to "Transit", "toll" to "Transit",
        "mta" to "Transit", "bart" to "Transit", "amtrak" to "Transit",
        "subway tran" to "Transit",
        // Travel
        "airline" to "Travel", "airlines" to "Travel", "hotel" to "Travel",
        "marriott" to "Travel", "hilton" to "Travel", "hyatt" to "Travel",
        "airbnb" to "Travel", "expedia" to "Travel", "delta" to "Travel",
        "united air" to "Travel", "american air" to "Travel", "southwest" to "Travel",
        "booking.com" to "Travel", "airport" to "Travel", "rental car" to "Travel",
        "hertz" to "Travel", "enterprise rent" to "Travel",
        // Streaming
        "netflix" to "Streaming", "spotify" to "Streaming", "hulu" to "Streaming",
        "disney+" to "Streaming", "disney plus" to "Streaming", "hbo" to "Streaming",
        "max.com" to "Streaming", "youtube premium" to "Streaming", "youtube tv" to "Streaming",
        "apple music" to "Streaming", "paramount+" to "Streaming", "peacock" to "Streaming",
        "audible" to "Streaming", "pandora" to "Streaming",
        // Drugstores
        "cvs" to "Drugstores", "walgreens" to "Drugstores", "rite aid" to "Drugstores",
        "pharmacy" to "Drugstores", "drugstore" to "Drugstores", "duane reade" to "Drugstores",
        // Online shopping
        "amazon" to "Online shopping", "ebay" to "Online shopping", "etsy" to "Online shopping",
        "paypal" to "Online shopping", "wayfair" to "Online shopping", "shopify" to "Online shopping",
        "aliexpress" to "Online shopping", "temu" to "Online shopping", "chewy" to "Online shopping",
        // Dining
        "starbucks" to "Dining", "dunkin" to "Dining", "mcdonald" to "Dining",
        "chipotle" to "Dining", "doordash" to "Dining", "grubhub" to "Dining",
        "ubereats" to "Dining", "uber eats" to "Dining", "restaurant" to "Dining",
        "cafe" to "Dining", "coffee" to "Dining", "pizza" to "Dining", "grill" to "Dining",
        "kitchen" to "Dining", "taqueria" to "Dining", "bakery" to "Dining",
        "bar & grill" to "Dining", "diner" to "Dining", "panera" to "Dining",
        "subway" to "Dining", "wendy" to "Dining", "taco bell" to "Dining",
        "burger" to "Dining",
    )

    /** Guess the reward category for a merchant name, or null when nothing
     *  matches. Case-insensitive substring match, first hint wins. */
    fun category(merchant: String?): String? {
        if (merchant.isNullOrEmpty()) return null
        val m = merchant.lowercase()
        for ((needle, category) in HINTS) {
            if (m.contains(needle)) return category
        }
        return null
    }
}
