package com.danielhipskind.fihaven.ui

import android.content.Context
import android.content.ContextWrapper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.danielhipskind.fihaven.BuildConfig
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

/**
 * BiometricPrompt wrapper for the optional app lock (fingerprint / face).
 *
 * The unlock is bound to a hardware-backed AndroidKeyStore key via a
 * [BiometricPrompt.CryptoObject]. The key is generated with
 * `setUserAuthenticationRequired(true)`, so it can only be used after a
 * fresh biometric match — an attacker can't bypass the lock by hooking the
 * success callback, because a real Class-3 biometric must release the key.
 * Because a CryptoObject requires it, we use STRONG (Class 3) biometrics.
 */
object BiometricAuth {
    // CryptoObject-backed auth requires STRONG (Class 3) biometrics.
    private const val AUTHENTICATORS = BiometricManager.Authenticators.BIOMETRIC_STRONG
    private const val KEY_NAME = "fihaven.applock.v1"
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val TRANSFORMATION =
        KeyProperties.KEY_ALGORITHM_AES + "/" +
            KeyProperties.BLOCK_MODE_GCM + "/" +
            KeyProperties.ENCRYPTION_PADDING_NONE

    /** DEBUG screenshot aid: pretend biometrics are available even on an
     *  emulator without an enrolled fingerprint. */
    var demoMode = false

    fun isAvailable(activity: FragmentActivity): Boolean {
        if (BuildConfig.DEBUG && demoMode) return true
        return BiometricManager.from(activity).canAuthenticate(AUTHENTICATORS) ==
            BiometricManager.BIOMETRIC_SUCCESS
    }

    fun authenticate(
        activity: FragmentActivity,
        title: String,
        subtitle: String,
        onResult: (Boolean) -> Unit,
    ) {
        // Debug screenshots: no real keystore/biometric on the emulator.
        if (BuildConfig.DEBUG && demoMode) { onResult(true); return }

        // A Cipher locked to the biometric-gated KeyStore key. If a new
        // biometric was enrolled the key is invalidated, so we drop it and
        // regenerate once.
        val crypto = buildCryptoObject()
        if (crypto == null) {
            // Fail closed: never fall back to an unguarded prompt — that would
            // defeat the whole point of binding the lock to the keystore.
            onResult(false)
            return
        }

        val prompt = BiometricPrompt(
            activity,
            ContextCompat.getMainExecutor(activity),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    // A non-null cryptoObject proves the keystore key was
                    // actually unlocked by the biometric, not just a callback.
                    onResult(result.cryptoObject != null)
                }
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) =
                    onResult(false)
                // onAuthenticationFailed (a single bad read) is intentionally
                // left to the system UI so the user can retry.
            },
        )
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setNegativeButtonText("Cancel")
            .setAllowedAuthenticators(AUTHENTICATORS)
            .build()
        prompt.authenticate(info, crypto)
    }

    private fun buildCryptoObject(): BiometricPrompt.CryptoObject? = try {
        BiometricPrompt.CryptoObject(initCipher())
    } catch (_: KeyPermanentlyInvalidatedException) {
        deleteKey()
        try { BiometricPrompt.CryptoObject(initCipher()) } catch (_: Exception) { null }
    } catch (_: Exception) {
        null
    }

    private fun initCipher(): Cipher =
        Cipher.getInstance(TRANSFORMATION).apply {
            init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        }

    private fun getOrCreateKey(): SecretKey {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (ks.getKey(KEY_NAME, null) as? SecretKey)?.let { return it }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_NAME,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setUserAuthenticationRequired(true)
                // Enrolling a new fingerprint/face invalidates the key, forcing
                // a regenerate — so a freshly added biometric can't silently
                // inherit an existing lock without re-enabling it.
                .setInvalidatedByBiometricEnrollment(true)
                .build(),
        )
        return generator.generateKey()
    }

    private fun deleteKey() {
        try {
            KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }.deleteEntry(KEY_NAME)
        } catch (_: Exception) { /* best effort */ }
    }
}

/** Walk the Context chain to the hosting FragmentActivity (BiometricPrompt needs it). */
fun Context.findFragmentActivity(): FragmentActivity? {
    var c: Context? = this
    while (c is ContextWrapper) {
        if (c is FragmentActivity) return c
        c = c.baseContext
    }
    return null
}
