package com.danielhipskind.fihaven.core.net

/// Where the client points (docs/native-contract.md §2).
data class ApiConfig(val baseUrl: String) {
    companion object {
        val production = ApiConfig("https://danielhipskind.com/fihaven")

        /// The Android emulator's alias for the host machine's localhost.
        val emulatorLocalhost = ApiConfig("http://10.0.2.2:5222/fihaven")

        /// Plain localhost (JVM tests / live checks against a local server).
        val localhost = ApiConfig("http://localhost:5222/fihaven")
    }
}
