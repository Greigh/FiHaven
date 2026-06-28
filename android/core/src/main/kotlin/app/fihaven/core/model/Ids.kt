package app.fihaven.core.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * Decodes a record id from JSON whether it arrives as a string (the web's
 * canonical `genId()` format, e.g. "lq3x9z4k2a") or as a number (legacy
 * bills/cards created on iOS/Android with timestamp ids). Always stores it
 * as a String so ids round-trip losslessly across platforms — a 64-bit iOS
 * timestamp id overflows a 32-bit Kotlin Int, and web string ids aren't
 * numbers at all, so a String is the only type that holds every variant.
 */
object FlexStringIdSerializer : KSerializer<String> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("FlexStringId", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): String {
        val jd = decoder as? JsonDecoder ?: return decoder.decodeString()
        return jd.decodeJsonElement().jsonPrimitive.contentOrNull ?: ""
    }

    override fun serialize(encoder: Encoder, value: String) = encoder.encodeString(value)
}

/**
 * A collision-proof string id for new records, matching the web's `genId()`
 * (base36 timestamp + random suffix) so ids look identical across platforms.
 */
fun genId(): String {
    val charset = ('a'..'z') + ('0'..'9')
    val rand = (1..6).map { charset.random() }.joinToString("")
    return System.currentTimeMillis().toString(36) + rand
}
