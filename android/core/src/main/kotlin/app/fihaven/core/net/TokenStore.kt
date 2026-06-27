package app.fihaven.core.net

/// Persists the Bearer token. The Android app provides an
/// Android Keystore-backed implementation in the app module; the core ships an
/// in-memory one for tests.
interface TokenStore {
    fun get(): String?
    fun set(token: String)
    fun clear()
}

class InMemoryTokenStore(initial: String? = null) : TokenStore {
    private var token: String? = initial

    @Synchronized override fun get(): String? = token
    @Synchronized override fun set(token: String) { this.token = token }
    @Synchronized override fun clear() { token = null }
}
