// Plugin versions declared once here (apply false); modules apply them
// without versions to avoid loading the Kotlin plugin multiple times.
plugins {
    // Keep all three Kotlin plugins on the same version. CodeQL traces the Android build,
    // so check its supported Kotlin range before a bump:
    // https://codeql.github.com/docs/codeql-overview/supported-languages-and-frameworks/
    kotlin("jvm") version "2.4.20" apply false
    kotlin("plugin.serialization") version "2.4.20" apply false
    kotlin("plugin.compose") version "2.4.20" apply false
    id("com.android.application") version "9.4.1" apply false
    id("com.google.gms.google-services") version "4.5.0" apply false
}
