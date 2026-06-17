package app.fihaven.core.model

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Coerce JSON scalars to String (mirrors iOS `flexibleString`). */
internal fun JsonElement?.flexString(): String? {
    val p = this?.jsonPrimitive ?: return null
    return p.contentOrNull ?: p.content
}

internal fun JsonElement?.flexDouble(default: Double = 0.0): Double =
    this?.jsonPrimitive?.doubleOrNull
        ?: this?.jsonPrimitive?.contentOrNull?.toDoubleOrNull()
        ?: default

internal fun JsonElement?.flexInt(default: Int = 0): Int =
    this?.jsonPrimitive?.intOrNull
        ?: this?.jsonPrimitive?.contentOrNull?.toIntOrNull()
        ?: default

internal fun JsonElement?.flexBool(default: Boolean = false): Boolean =
    this?.jsonPrimitive?.booleanOrNull
        ?: when (this?.jsonPrimitive?.contentOrNull?.lowercase()) {
            "true", "1", "yes" -> true
            "false", "0", "no" -> false
            else -> default
        }

/** Decode one payment row with legacy coercion (numeric ids, string amounts). */
internal fun decodePayment(el: JsonElement): Payment? = runCatching {
    val o = el.jsonObject
    Payment(
        id = o["id"].flexString() ?: "",
        type = o["type"].flexString() ?: "",
        refId = o["refId"].flexString() ?: "",
        name = o["name"].flexString() ?: "",
        amount = o["amount"].flexDouble(),
        date = o["date"].flexString() ?: "",
        monthKey = o["monthKey"].flexString() ?: "",
        note = o["note"].flexString() ?: "",
        skipped = o["skipped"].flexBool(),
    )
}.getOrNull()

private inline fun <T> JsonArray.decodeEach(decode: (JsonElement) -> T?): List<T> =
    mapNotNull { decode(it) }

/** Lenient `/api/data` decode — one bad row must not zero the whole blob (iOS parity). */
fun decodeAppData(json: String): AppData {
    val root = runCatching { FiHavenJson.parseToJsonElement(json).jsonObject }.getOrNull()
        ?: return AppData()
    return AppData(
        email = root["email"].flexString(),
        bills = root["bills"]?.jsonArray?.decodeEach {
            runCatching { FiHavenJson.decodeFromJsonElement(Bill.serializer(), it) }.getOrNull()
        } ?: emptyList(),
        cards = root["cards"]?.jsonArray?.decodeEach {
            runCatching { FiHavenJson.decodeFromJsonElement(Card.serializer(), it) }.getOrNull()
        } ?: emptyList(),
        payments = root["payments"]?.jsonArray?.decodeEach { decodePayment(it) } ?: emptyList(),
        accounts = root["accounts"]?.jsonArray?.decodeEach {
            runCatching { FiHavenJson.decodeFromJsonElement(Account.serializer(), it) }.getOrNull()
        } ?: emptyList(),
        goals = root["goals"]?.jsonArray?.decodeEach {
            runCatching { FiHavenJson.decodeFromJsonElement(SavingsGoal.serializer(), it) }.getOrNull()
        } ?: emptyList(),
        transactions = root["transactions"]?.jsonArray?.decodeEach {
            runCatching { FiHavenJson.decodeFromJsonElement(SpendTransaction.serializer(), it) }.getOrNull()
        } ?: emptyList(),
        settings = root["settings"]?.jsonObject ?: JsonObject(emptyMap()),
        entitlement = root["entitlement"]?.let {
            runCatching { FiHavenJson.decodeFromJsonElement(Entitlement.serializer(), it) }.getOrNull()
        },
    )
}
