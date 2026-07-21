package app.fihaven.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.runtime.rememberCoroutineScope
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.launch
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.fihaven.BuildConfig
import app.fihaven.R
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.fihaven.AppViewModel
import app.fihaven.core.net.MfaChallenge
import app.fihaven.ui.theme.Ct

@Composable
fun AuthScreen(vm: AppViewModel) {
    val working by vm.working.collectAsStateWithLifecycle()
    val error by vm.authError.collectAsStateWithLifecycle()
    var signup by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var captchaToken by remember { mutableStateOf<String?>(null) }
    var captchaReload by remember { mutableIntStateOf(0) }
    var turnstileHeight by remember { mutableIntStateOf(72) }

    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) { vm.markAuthStarted() }

    fun reloadCaptcha() {
        captchaToken = null
        captchaReload++
    }

    // Google Sign-In: try Credential Manager (native), then fall back to a
    // Custom Tab + Google Identity Services page. Play builds often fail CM
    // with DEVELOPER_ERROR until an Android OAuth client has the App Signing
    // SHA-1; the web fallback does not need that client.
    fun signInWithGoogle() {
        scope.launch {
            vm.clearAuthError()
            val activity = context.findActivity()
            if (activity == null) {
                vm.reportAuthError("Google sign-in needs an active screen. Try again.")
                return@launch
            }
            val clientId = BuildConfig.GOOGLE_WEB_CLIENT_ID
            if (clientId.isBlank()) {
                vm.reportAuthError("Google sign-in is not configured in this build.")
                return@launch
            }
            val cm = CredentialManager.create(activity)
            try {
                // Labeled "Continue with Google" → Sign-In-with-Google first.
                val siwg = GetSignInWithGoogleOption.Builder(clientId).build()
                val siwgReq = GetCredentialRequest.Builder().addCredentialOption(siwg).build()
                finishGoogleCredential(cm.getCredential(activity, siwgReq), vm)
                return@launch
            } catch (_: GetCredentialCancellationException) {
                return@launch
            } catch (e: GetCredentialException) {
                Log.w(TAG_GOOGLE_AUTH, "Sign-In-with-Google failed; trying One Tap", e)
            }
            try {
                val oneTap = GetGoogleIdOption.Builder()
                    .setServerClientId(clientId)
                    .setFilterByAuthorizedAccounts(false)
                    .build()
                val oneTapReq = GetCredentialRequest.Builder().addCredentialOption(oneTap).build()
                finishGoogleCredential(cm.getCredential(activity, oneTapReq), vm)
                return@launch
            } catch (_: GetCredentialCancellationException) {
                return@launch
            } catch (e: GetCredentialException) {
                Log.w(TAG_GOOGLE_AUTH, "Credential Manager failed; opening web Google sign-in", e)
            }
            GoogleWebSignIn.launch(activity)
        }
    }

    // Passwordless passkey sign-in via Credential Manager. `auto` runs a quiet
    // check on screen load — it only surfaces UI if a passkey for this app is
    // immediately available (like Bitwarden offering a saved login); the
    // explicit button forces the picker. Resolves to a session with no password.
    fun signInWithPasskey(auto: Boolean) {
        scope.launch {
            val start = runCatching { vm.api.passkeyLoginStart() }.getOrNull() ?: return@launch
            val option = GetPublicKeyCredentialOption(start.options.toString())
            val request = GetCredentialRequest.Builder()
                .addCredentialOption(option)
                .setPreferImmediatelyAvailableCredentials(auto)
                .build()
            try {
                val result = CredentialManager.create(context).getCredential(context, request)
                val cred = result.credential
                if (cred is PublicKeyCredential) {
                    vm.loginWithPasskey(start.challengeId, cred.authenticationResponseJson)
                }
            } catch (_: GetCredentialException) {
                // No passkey, dismissed, or none immediately available — stay on
                // the password form. (Silent on the automatic check.)
            }
        }
    }

    // Quiet check on first composition so an existing passkey is offered up front.
    LaunchedEffect(Unit) { signInWithPasskey(auto = true) }

    Column(
        Modifier.authScreen().verticalScroll(rememberScrollState()).padding(22.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Wordmark(38)
        Text(
            if (signup) "Create your account" else "Welcome back",
            color = Ct.colors.muted, fontSize = 16.sp,
            modifier = Modifier.padding(top = 8.dp, bottom = 18.dp),
        )
        CtCard(Modifier.widthIn(max = 460.dp), padding = 20) {
            Column {
                OutlinedTextField(
                    value = email, onValueChange = { email = it },
                    label = { Text("Email") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    modifier = Modifier.fillMaxWidth().semantics {
                        contentType = ContentType.Username + ContentType.EmailAddress
                    },
                )
                OutlinedTextField(
                    value = password, onValueChange = { password = it },
                    label = { Text("Password") }, singleLine = true,
                    visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                    trailingIcon = {
                        IconButton(onClick = { showPassword = !showPassword }) {
                            Icon(
                                if (showPassword) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                                contentDescription = if (showPassword) "Hide password" else "Show password",
                                tint = Ct.colors.muted,
                            )
                        }
                    },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp).semantics {
                        contentType = if (signup) ContentType.NewPassword else ContentType.Password
                    },
                )
                if (!signup) {
                    val uriHandler = LocalUriHandler.current
                    TextButton(
                        onClick = { uriHandler.openUri(BuildConfig.API_BASE.trimEnd('/') + "/reset") },
                        modifier = Modifier.align(Alignment.End)
                    ) {
                        Text("Forgot Password?", color = Ct.colors.accent, fontSize = 13.sp)
                    }
                }
                // Kept mounted even after it solves so the token auto-refreshes
                // before it can expire — sitting on the screen otherwise leaves a
                // stale token and a disabled submit. `reloadKey` (captchaReload)
                // recreates it after a failed submit, since tokens are single-use.
                TurnstileView(
                    siteKey = BuildConfig.TURNSTILE_SITEKEY,
                    baseUrl = BuildConfig.API_BASE.trimEnd('/'),
                    reloadKey = captchaReload,
                    onToken = { captchaToken = it },
                    onError = { captchaToken = null },
                    onHeight = { turnstileHeight = it.coerceIn(0, 120) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = if (signup) 12.dp else 0.dp)
                        .height(turnstileHeight.coerceAtLeast(1).dp),
                )
                error?.let {
                    Text(it, color = Ct.colors.red, fontSize = 13.sp, modifier = Modifier.padding(top = 10.dp))
                }
                val canSubmit = !working && email.contains("@") && password.length >= 6 && captchaToken != null
                Button(
                    onClick = {
                        val token = captchaToken ?: return@Button
                        captchaToken = null
                        captchaReload++
                        if (signup) vm.signup(email, password, token)
                        else vm.login(email, password, token)
                    },
                    enabled = canSubmit,
                    colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent),
                    modifier = Modifier.fillMaxWidth().padding(top = if (signup) 16.dp else 4.dp),
                ) {
                    Text(if (working) "Please wait…" else if (signup) "Create account" else "Sign in")
                }

                // Sign-up consent — mirrors the web + iOS terms notice; both
                // stores expect terms + privacy reachable before account creation.
                if (signup) {
                    val legalHandler = LocalUriHandler.current
                    val base = BuildConfig.API_BASE.trimEnd('/')
                    Column(
                        Modifier.fillMaxWidth().padding(top = 12.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            "By creating an account you agree to our",
                            color = Ct.colors.muted, fontSize = 12.sp,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            TextButton(
                                onClick = { legalHandler.openUri("$base/terms") },
                                contentPadding = PaddingValues(horizontal = 4.dp),
                            ) { Text("Terms of Use", color = Ct.colors.accent, fontSize = 12.sp) }
                            Text("and", color = Ct.colors.muted, fontSize = 12.sp)
                            TextButton(
                                onClick = { legalHandler.openUri("$base/privacy") },
                                contentPadding = PaddingValues(horizontal = 4.dp),
                            ) { Text("Privacy Policy", color = Ct.colors.accent, fontSize = 12.sp) }
                        }
                    }
                }

                Text(
                    "or",
                    color = Ct.colors.muted,
                    fontSize = 12.sp,
                    modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
                // White button + official "G" mark (Google branding), sized to
                // match the Apple button.
                androidx.compose.material3.OutlinedButton(
                    onClick = { signInWithGoogle() },
                    enabled = !working,
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.outlinedButtonColors(
                        containerColor = Color.White,
                        contentColor = Color(0xFF3C3C3C),
                    ),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFDADCE0)),
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                ) {
                    Icon(
                        painterResource(R.drawable.ic_google_g),
                        contentDescription = null,
                        tint = Color.Unspecified,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(Modifier.width(10.dp))
                    Text("Continue with Google", color = Color(0xFF3C3C3C), fontWeight = androidx.compose.ui.text.font.FontWeight.Medium)
                }
                Button(
                    onClick = { AppleWebSignIn.launch(context) },
                    enabled = !working,
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color.Black,
                        contentColor = Color.White,
                    ),
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp).height(48.dp),
                ) {
                    Icon(
                        painterResource(R.drawable.ic_apple_logo),
                        contentDescription = null,
                        tint = Color.Unspecified,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(Modifier.width(10.dp))
                    Text("Continue with Apple", fontWeight = androidx.compose.ui.text.font.FontWeight.Medium)
                }
                if (!signup) {
                    TextButton(
                        onClick = { signInWithPasskey(auto = false) },
                        enabled = !working,
                        modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                    ) { Text("Sign in with a passkey", color = Ct.colors.accent) }
                }
            }
        }
        TextButton(onClick = { signup = !signup; reloadCaptcha() }, modifier = Modifier.padding(top = 6.dp, bottom = 8.dp)) {
            Text(
                if (signup) "Already have an account? Sign in" else "No account? Create one",
                color = Ct.colors.accent,
            )
        }
    }
}

@Composable
fun MfaScreen(vm: AppViewModel, challenge: MfaChallenge) {
    val working by vm.working.collectAsStateWithLifecycle()
    val error by vm.authError.collectAsStateWithLifecycle()
    var code by remember { mutableStateOf("") }
    val uriHandler = LocalUriHandler.current

    Column(
        Modifier.authScreen().verticalScroll(rememberScrollState()).padding(22.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Wordmark(34)
        Text("Two-factor verification", color = Ct.colors.muted, fontSize = 16.sp,
            modifier = Modifier.padding(top = 8.dp, bottom = 18.dp))
        CtCard(Modifier.widthIn(max = 460.dp), padding = 20) {
            Column {
                OutlinedTextField(
                    value = code, onValueChange = { code = it },
                    label = { Text("6-digit code") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    // Tell autofill this is a one-time code, not a password —
                    // otherwise the system offers saved passwords on the 2FA step.
                    modifier = Modifier.fillMaxWidth().semantics {
                        contentType = ContentType.SmsOtpCode
                    },
                )
                error?.let {
                    Text(it, color = Ct.colors.red, fontSize = 13.sp, modifier = Modifier.padding(top = 10.dp))
                }
                Button(
                    onClick = { vm.verifyMfa(code) },
                    enabled = !working && code.length >= 6,
                    colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent),
                    modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                ) { Text(if (working) "Verifying…" else "Verify") }
            }
        }
        TextButton(
            onClick = { uriHandler.openUri(BuildConfig.API_BASE.trimEnd('/') + "/recover") },
            modifier = Modifier.padding(top = 6.dp),
        ) {
            Text("Lost your 2FA device?", color = Ct.colors.accent)
        }
        TextButton(onClick = { vm.cancelMfa() }, modifier = Modifier.padding(top = 6.dp)) {
            Text("Cancel", color = Ct.colors.muted)
        }
    }
}

private const val TAG_GOOGLE_AUTH = "FiHavenGoogleAuth"

private fun Context.findActivity(): Activity? {
    var c: Context? = this
    while (c is ContextWrapper) {
        if (c is Activity) return c
        c = c.baseContext
    }
    return null
}

private fun finishGoogleCredential(result: GetCredentialResponse, vm: AppViewModel) {
    try {
        val cred = result.credential
        if (cred is CustomCredential &&
            cred.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
        ) {
            val google = GoogleIdTokenCredential.createFrom(cred.data)
            vm.oauthSignIn("google", google.idToken, google.displayName)
            return
        }
        vm.reportAuthError("Google did not return a sign-in token. Try again.")
    } catch (e: Exception) {
        Log.w(TAG_GOOGLE_AUTH, "Failed to read Google credential", e)
        vm.reportAuthError("Google sign-in failed. Try again.")
    }
}
