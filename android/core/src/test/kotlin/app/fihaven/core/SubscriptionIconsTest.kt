package app.fihaven.core

import app.fihaven.core.logic.SubscriptionIcons
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class SubscriptionIconsTest {
    @Test fun brandEmoji() {
        assertEquals("🎬", SubscriptionIcons.emoji("Netflix"))
        assertEquals("🎬", SubscriptionIcons.emoji("NETFLIX"))
        assertEquals("🏰", SubscriptionIcons.emoji("Disney+"))
        assertEquals("🎵", SubscriptionIcons.emoji("Apple Music")) // applemusic beats apple
        assertEquals("🍏", SubscriptionIcons.emoji("Apple TV+"))
        assertEquals("🎵", SubscriptionIcons.emoji("Spotify"))
    }

    @Test fun fallbacks() {
        assertEquals("📱", SubscriptionIcons.emoji("Local Gym LLC", "Subscriptions"))
        assertEquals("🔁", SubscriptionIcons.emoji("Local Gym LLC"))
        assertEquals("🔁", SubscriptionIcons.emoji(null))
        assertNull(SubscriptionIcons.brand("Local Gym LLC"))
        assertEquals("🎬", SubscriptionIcons.brand("Netflix"))
    }

    @Test fun normalize() {
        assertEquals("hbomax", SubscriptionIcons.normalize("HBO Max!"))
        assertEquals("", SubscriptionIcons.normalize(null))
    }
}
