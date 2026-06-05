package com.danielhipskind.fihaven.ui

import android.content.Context
import android.content.ContextWrapper
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.danielhipskind.fihaven.BuildConfig

/** BiometricPrompt wrapper for the optional app lock (fingerprint / face). */
object BiometricAuth {
    private const val AUTHENTICATORS = BiometricManager.Authenticators.BIOMETRIC_WEAK

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
        val prompt = BiometricPrompt(
            activity,
            ContextCompat.getMainExecutor(activity),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) =
                    onResult(true)
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
        prompt.authenticate(info)
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
