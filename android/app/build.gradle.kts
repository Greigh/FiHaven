plugins {
    id("com.android.application")
    kotlin("plugin.compose")
    kotlin("plugin.serialization")
}

android {
    namespace = "app.fihaven"
    compileSdk = 36
    buildToolsVersion = "36.1.0"

    defaultConfig {
        applicationId = "app.fihaven"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "1.2.3"
        buildConfigField("String", "TURNSTILE_SITEKEY", "\"0x4AAAAAADVKKZMye086WePX\"")
        // Google Sign-In: the WEB OAuth client id is used as the Credential
        // Manager serverClientId, so the ID token's audience is the web client
        // the server already trusts. Public value (shipped in the APK anyway).
        buildConfigField(
            "String",
            "GOOGLE_WEB_CLIENT_ID",
            "\"742737810532-pfjcg9bri0vn2qu1rk94nhcv0lsluug1.apps.googleusercontent.com\"",
        )
        // Sign in with Apple (web flow): the Services ID is the OAuth client
        // for the Custom Tab authorize request. Public value.
        buildConfigField("String", "APPLE_SERVICES_ID", "\"app.fihaven.web\"")
    }

    buildFeatures { compose = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        getByName("debug") {
            isMinifyEnabled = false
            buildConfigField("String", "API_BASE", "\"https://fihaven.app\"")
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

    implementation(platform("androidx.compose:compose-bom:2026.05.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    debugImplementation("androidx.compose.ui:ui-tooling")

    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.10.0")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")

    // Google Play Billing for subscriptions (docs/native-contract.md §billing).
    implementation("com.android.billingclient:billing-ktx:9.1.0")

    // Keystore-backed encrypted token storage (parity with iOS Keychain).
    implementation("androidx.security:security-crypto:1.1.0")

    // Biometric app lock (fingerprint / face). BiometricPrompt needs the
    // host to be a FragmentActivity.
    implementation("androidx.biometric:biometric:1.1.0")

    // Plaid Link for in-app bank connections (Pro). Drives the existing
    // /api/plaid link-token + exchange endpoints.
    implementation("com.plaid.link:sdk-core:5.5.2")

    // Google Sign-In via Credential Manager (returns an OIDC ID token we post
    // to /api/auth/oauth/google).
    implementation("androidx.credentials:credentials:1.3.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")

    // Custom Tabs for the Sign in with Apple web flow.
    implementation("androidx.browser:browser:1.10.0")
}
