// Plugin versions declared once here (apply false); modules apply them
// without versions to avoid loading the Kotlin plugin multiple times.
plugins {
    // CodeQL supports Kotlin through 2.4.0 (not 2.4.10). Keep plugins aligned.
    // https://github.blog/changelog/2026-07-10-codeql-2-26-0-adds-kotlin-2-4-0-support-and-ai-prompt-injection-detection/
    kotlin("jvm") version "2.4.0" apply false
    kotlin("plugin.serialization") version "2.4.0" apply false
    kotlin("plugin.compose") version "2.4.0" apply false
    id("com.android.application") version "9.3.0" apply false
    id("com.google.gms.google-services") version "4.5.0" apply false
}
