package app.fihaven.core

import app.fihaven.core.model.CategoryIcon
import app.fihaven.core.model.categoryIcons
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class CategoryIconTest {
    @Test fun parseEmojiAndImage() {
        assertEquals(CategoryIcon.Emoji("🏡"), CategoryIcon.parse(JsonPrimitive("🏡")))
        assertEquals(
            CategoryIcon.Emoji("💡"),
            CategoryIcon.parse(buildJsonObject {
                put("type", JsonPrimitive("emoji"))
                put("value", JsonPrimitive("💡"))
            }),
        )
        val uri = "data:image/png;base64,abc"
        assertEquals(
            CategoryIcon.Image(uri),
            CategoryIcon.parse(buildJsonObject {
                put("type", JsonPrimitive("image"))
                put("value", JsonPrimitive(uri))
            }),
        )
        assertEquals(
            CategoryIcon.Image("data:image/webp;base64,abc"),
            CategoryIcon.parse(buildJsonObject {
                put("type", JsonPrimitive("image"))
                put("value", JsonPrimitive("data:image/webp;base64,abc"))
            }),
        )
        assertNull(CategoryIcon.parse(JsonPrimitive("Housing")))
        assertNull(CategoryIcon.parse(JsonPrimitive("https://example.com/x.png")))
        assertNull(CategoryIcon.parse(buildJsonObject {
            put("type", JsonPrimitive("image"))
            put("value", JsonPrimitive("http://evil.example/x.png"))
        }))
        assertNull(CategoryIcon.parse(buildJsonObject {
            put("type", JsonPrimitive("image"))
            put("value", JsonPrimitive("data:text/plain;base64,abc"))
        }))
    }

    @Test fun settingsMapAndResolver() {
        val settings = buildJsonObject {
            put("categoryIcons", buildJsonObject {
                put("Housing", JsonPrimitive("🏡"))
                put(
                    "Auto",
                    buildJsonObject {
                        put("type", JsonPrimitive("image"))
                        put("value", JsonPrimitive("data:image/png;base64,abc"))
                    },
                )
            })
        }
        val map = settings.categoryIcons
        assertEquals(CategoryIcon.Emoji("🏡"), map["Housing"])
        assertTrue(map["Auto"] is CategoryIcon.Image)
        assertEquals(
            CategoryIcon.Image("data:image/png;base64,abc"),
            CTConstants.iconInfoForCategory("Auto", map),
        )
        assertEquals("🚗", CTConstants.iconForCategory("Auto", map))
        assertEquals("🏡", CTConstants.iconForCategory("Housing", map))
        assertEquals("📌", CTConstants.iconForCategory("Nope", emptyMap()))
        assertEquals("🏠", CTConstants.iconForCategory("Housing", emptyMap()))
    }
}
