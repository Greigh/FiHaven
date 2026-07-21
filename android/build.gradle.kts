// Plugin versions declared once here (apply false); modules apply them
// without versions to avoid loading the Kotlin plugin multiple times.
plugins {
    // Keep Kotlin plugins aligned on the same version.
    kotlin("jvm") version "2.4.10" apply false
    kotlin("plugin.serialization") version "2.4.10" apply false
    kotlin("plugin.compose") version "2.4.10" apply false
    id("com.android.application") version "9.3.0" apply false
    id("com.google.gms.google-services") version "4.5.0" apply false
}
