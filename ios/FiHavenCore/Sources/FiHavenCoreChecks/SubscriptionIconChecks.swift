import Foundation
import FiHavenCore

func runSubscriptionIconChecks() {
    section("SubscriptionIcons — brand emoji") {
        checkEqual(SubscriptionIcons.emoji("Netflix"), "🎬", "Netflix")
        checkEqual(SubscriptionIcons.emoji("NETFLIX"), "🎬", "case-insensitive")
        checkEqual(SubscriptionIcons.emoji("Disney+"), "🏰", "punctuation stripped")
        checkEqual(SubscriptionIcons.emoji("Apple Music"), "🎵", "applemusic beats apple")
        checkEqual(SubscriptionIcons.emoji("Apple TV+"), "🍏", "appletv")
        checkEqual(SubscriptionIcons.emoji("Spotify"), "🎵", "Spotify")
    }

    section("SubscriptionIcons — fallbacks") {
        checkEqual(SubscriptionIcons.emoji("Local Gym LLC", category: "Subscriptions"), "🔁",
                   "unknown subscription → generic recurring glyph")
        checkEqual(SubscriptionIcons.emoji("Local Gym LLC"), "🔁", "unknown → generic glyph")
        check(SubscriptionIcons.brand("Local Gym LLC") == nil, "unknown brand → nil")
        checkEqual(SubscriptionIcons.brand("Netflix"), "🎬", "brand() returns the emoji")
    }

    section("SubscriptionIcons — normalize") {
        checkEqual(SubscriptionIcons.normalize("HBO Max!"), "hbomax", "normalize")
        checkEqual(SubscriptionIcons.normalize(""), "", "empty")
    }
}
