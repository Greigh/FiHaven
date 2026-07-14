import java.util.Properties

plugins {
    id("com.android.application")
    kotlin("plugin.compose")
    kotlin("plugin.serialization")
}

val hasGoogleServices = file("google-services.json").exists()

// Local release signing — copy keystore.properties.example → keystore.properties
// (gitignored). Never commit the .jks or passwords.
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties()
if (keystorePropsFile.exists()) {
    keystoreProps.load(keystorePropsFile.inputStream())
}

android {
    namespace = "app.fihaven"
    // androidx.lifecycle 2.11.0 (Compose) requires compiling against API 37; AGP
    // 9.2.x already supports it. targetSdk stays at 36 — bumping it opts into
    // Android 17 runtime behavior and is a separate, testable change.
    compileSdk = 37
    buildToolsVersion = "36.1.0"

    defaultConfig {
        applicationId = "app.fihaven"
        minSdk = 26
        targetSdk = 36
        versionCode = 19
        versionName = "1.6.0"
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
        buildConfigField("Boolean", "FCM_ENABLED", hasGoogleServices.toString())
    }

    buildFeatures { compose = true }

    packaging {
        jniLibs {
            keepDebugSymbols += "**/*.so"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    signingConfigs {
        if (keystorePropsFile.exists()) {
            create("release") {
                storeFile = file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        getByName("debug") {
            isMinifyEnabled = false
            buildConfigField("String", "API_BASE", "\"https://fihaven.app\"")
        }
        getByName("release") {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            ndk {
                debugSymbolLevel = "symbol_table"
            }
            buildConfigField("String", "API_BASE", "\"https://fihaven.app\"")
            if (keystorePropsFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
    buildFeatures { buildConfig = true }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    implementation(project(":core"))

    implementation(platform("androidx.compose:compose-bom:2026.06.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    debugImplementation("androidx.compose.ui:ui-tooling")

    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.11.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.11.0")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")

    // Google Play Billing for subscriptions (docs/native-contract.md §billing).
    implementation("com.android.billingclient:billing-ktx:9.1.0")

    // Biometric app lock (fingerprint / face). BiometricPrompt needs the
    // host to be a FragmentActivity.
    implementation("androidx.biometric:biometric:1.1.0")

    // Plaid Link for in-app bank connections (Pro). Drives the existing
    // /api/plaid link-token + exchange endpoints.
    implementation("com.plaid.link:sdk-core:6.0.0")

    // Google Sign-In via Credential Manager (returns an OIDC ID token we post
    // to /api/auth/oauth/google).
    implementation("androidx.credentials:credentials:1.6.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.6.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.2.0")

    // Custom Tabs for the Sign in with Apple web flow.
    implementation("androidx.browser:browser:1.10.0")

    implementation(platform("com.google.firebase:firebase-bom:34.16.0"))
    implementation("com.google.firebase:firebase-messaging")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.11.0")
}

if (hasGoogleServices) {
    apply(plugin = "com.google.gms.google-services")
}
