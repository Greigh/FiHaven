package app.fihaven.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.runtime.rememberCoroutineScope
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.launch
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.fihaven.BuildConfig
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

    // Google Sign-In via Credential Manager. Returns an OIDC ID token whose
    // audience is the WEB client id (passed as serverClientId); the server
    // verifies and signs the user in. Cancellation is silently ignored.
    fun signInWithGoogle() {
        scope.launch {
            try {
                val option = GetGoogleIdOption.Builder()
                    .setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID)
                    .setFilterByAuthorizedAccounts(false)
                    .build()
                val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
                val result = CredentialManager.create(context).getCredential(context, request)
                val cred = result.credential
                if (cred is CustomCredential &&
                    cred.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                ) {
                    val google = GoogleIdTokenCredential.createFrom(cred.data)
                    vm.oauthSignIn("google", google.idToken, google.displayName)
                }
            } catch (_: GetCredentialException) {
                // No Google account, dismissed, or no Play Services — leave the
                // password form available; nothing to surface.
            }
        }
    }

    Column(
        Modifier.fillMaxSize().background(Ct.colors.bg).padding(22.dp),
        verticalArrangement = Arrangement.Center,
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
                    modifier = Modifier.fillMaxWidth(),
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
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
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
                if (captchaToken == null) {
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
                }
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

                Text(
                    "or",
                    color = Ct.colors.muted,
                    fontSize = 12.sp,
                    modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
                androidx.compose.material3.OutlinedButton(
                    onClick = { signInWithGoogle() },
                    enabled = !working,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Continue with Google", color = Ct.colors.text)
                }
                Button(
                    onClick = { AppleWebSignIn.launch(context) },
                    enabled = !working,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = androidx.compose.ui.graphics.Color.Black,
                        contentColor = androidx.compose.ui.graphics.Color.White,
                    ),
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                ) {
                    Text("Continue with Apple")
                }
            }
        }
        TextButton(onClick = { signup = !signup; reloadCaptcha() }, modifier = Modifier.padding(top = 6.dp)) {
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
        Modifier.fillMaxSize().background(Ct.colors.bg).padding(22.dp),
        verticalArrangement = Arrangement.Center,
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
                    modifier = Modifier.fillMaxWidth(),
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
