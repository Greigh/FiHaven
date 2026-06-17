package app.fihaven.core

import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

/// Currency formatting matching the web client. The display currency is set
/// once from the user's synced `currency` setting (default USD); each
/// currency carries a locale so grouping and symbol placement match.
object Money {
    @Volatile private var currencyCode: String = "USD"

    private val locales: Map<String, Locale> = mapOf(
        "USD" to Locale.US, "CAD" to Locale.CANADA, "AUD" to Locale("en", "AU"),
        "GBP" to Locale.UK, "EUR" to Locale("en", "IE"), "JPY" to Locale.JAPAN,
        "INR" to Locale("en", "IN"), "CHF" to Locale("de", "CH"),
        "MXN" to Locale("es", "MX"), "BRL" to Locale("pt", "BR"),
    )

    /// Apply the display currency (no-op for unknown codes).
    fun setCurrency(code: String?) {
        if (code != null && locales.containsKey(code)) currencyCode = code
    }

    /// "$1,450.00" — the currency's natural fraction digits.
    fun fmt(n: Double): String = format(n, null)

    /// "$1,450" — no fraction digits.
    fun fmtShort(n: Double): String = format(n, 0)

    private fun format(n: Double, fraction: Int?): String {
        val value = if (n.isFinite()) n else 0.0
        val locale = locales[currencyCode] ?: Locale.US
        val f = NumberFormat.getCurrencyInstance(locale)
        runCatching { f.currency = Currency.getInstance(currencyCode) }
        if (fraction != null) {
            f.minimumFractionDigits = fraction
            f.maximumFractionDigits = fraction
        }
        return f.format(value)
    }
}
