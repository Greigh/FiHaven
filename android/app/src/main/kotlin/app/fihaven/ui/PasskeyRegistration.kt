package app.fihaven.ui

import android.content.Context
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager

/** Runs the platform passkey registration flow via Credential Manager. */
suspend fun createPasskeyCredential(context: Context, optionsJson: String): String {
    val result = CredentialManager.create(context).createCredential(
        context,
        CreatePublicKeyCredentialRequest(requestJson = optionsJson),
    )
    return (result as CreatePublicKeyCredentialResponse).registrationResponseJson
}
