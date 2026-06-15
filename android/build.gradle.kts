// Plugin versions declared once here (apply false); modules apply them
// without versions to avoid loading the Kotlin plugin multiple times.
plugins {
    // CodeQL's Kotlin extractor currently supports versions below 2.3.30
    // (github.com/github/codeql/issues/21938). Keep plugins aligned until 2.4 lands.
    kotlin("jvm") version "2.3.21" apply false
    kotlin("plugin.serialization") version "2.3.21" apply false
    kotlin("plugin.compose") version "2.3.21" apply false
    id("com.android.application") version "9.2.1" apply false
}
