package com.danielhipskind.fihaven.core

import java.text.NumberFormat
import java.util.Locale

/// Currency formatting matching the web's fmt/fmtShort (en-US, "$").
object Money {
    fun fmt(n: Double): String = "$" + decimal(n, 2)
    fun fmtShort(n: Double): String = "$" + decimal(n, 0)

    private fun decimal(n: Double, fraction: Int): String {
        val value = if (n.isFinite()) n else 0.0
        val f = NumberFormat.getNumberInstance(Locale.US)
        f.minimumFractionDigits = fraction
        f.maximumFractionDigits = fraction
        return f.format(value)
    }
}
