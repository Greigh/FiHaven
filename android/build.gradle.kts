// Plugin versions declared once here (apply false); modules apply them
// without versions to avoid loading the Kotlin plugin multiple times.
plugins {
    kotlin("jvm") version "2.1.20" apply false
    kotlin("plugin.serialization") version "2.4.0" apply false
    kotlin("plugin.compose") version "2.2.10" apply false
    id("com.android.application") version "9.2.1" apply false
}
