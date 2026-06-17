// FiHaven Android — Gradle settings.
//
// :core (a pure-JVM Kotlin library) is included so it can be built and unit-tested without the Android SDK.
// :app (the Android application module) is included once Android Studio + the SDK are installed.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

plugins {
    // Auto-provision a JDK 21 toolchain if one isn't already installed.
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "fihaven"
include(":core")
include(":app")
