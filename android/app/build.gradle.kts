plugins {
    id("com.android.application")
    kotlin("plugin.compose")
    kotlin("plugin.serialization")
}

android {
    namespace = "com.danielhipskind.fihaven"
    compileSdk = 36
    buildToolsVersion = "36.1.0"

    defaultConfig {
        applicationId = "app.fihaven"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.2.0"
    }

    buildFeatures { compose = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        getByName("debug") {
            isMinifyEnabled = false
            // Dev points at the host's localhost via the emulator alias.
            buildConfigField("String", "API_BASE", "\"http://10.0.2.2:5222\"")
        }
        getByName("release") {
            isMinifyEnabled = false
            buildConfigField("String", "API_BASE", "\"https://fihaven.app\"")
        }
    }
    buildFeatures { buildConfig = true }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    implementation(project(":core"))

    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    debugImplementation("androidx.compose.ui:ui-tooling")

    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.10.0")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.0")

    // Google Play Billing for subscriptions (docs/native-contract.md §billing).
    implementation("com.android.billingclient:billing-ktx:7.1.1")

    // Keystore-backed encrypted token storage (parity with iOS Keychain).
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // Biometric app lock (fingerprint / face). BiometricPrompt needs the
    // host to be a FragmentActivity.
    implementation("androidx.biometric:biometric:1.1.0")

    // Plaid Link for in-app bank connections (Pro). Drives the existing
    // /api/plaid link-token + exchange endpoints.
    implementation("com.plaid.link:sdk-core:5.1.1")
}
