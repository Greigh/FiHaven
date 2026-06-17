package app.fihaven.data

import android.content.Context
import androidx.core.content.edit
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import app.fihaven.core.net.TokenStore

/// EncryptedSharedPreferences-backed [TokenStore]. The Bearer token is kept
/// at rest under an Android Keystore master key (AES-256), so it survives
/// process death without ever sitting in plaintext prefs. Mirrors the iOS
/// Keychain-backed token store.
class PrefsTokenStore(context: Context) : TokenStore {
    private val prefs = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "fh_secure_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    override fun get(): String? = prefs.getString(KEY, null)

    override fun set(token: String) {
        prefs.edit { putString(KEY, token) }
    }

    override fun clear() {
        prefs.edit { remove(KEY) }
    }

    private companion object {
        const val KEY = "auth_token"
    }
}
