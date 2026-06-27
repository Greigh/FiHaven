package app.fihaven

import android.content.Context
import android.content.Intent

/**
 * Build an explicit Intent with a fixed destination component. CodeQL's Kotlin
 * extractor does not treat `Intent(context, Class)` as explicit; `setClassName`
 * is the pattern the `java/android/implicit-pendingintents` query recognizes.
 */
internal fun explicitIntent(context: Context, klass: Class<*>, block: Intent.() -> Unit = {}): Intent {
    return Intent().apply {
        setClassName(context.packageName, klass.name)
        setPackage(context.packageName)
        block()
    }
}
