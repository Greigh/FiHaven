package com.danielhipskind.fihaven.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
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
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.danielhipskind.fihaven.BuildConfig
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.danielhipskind.fihaven.AppViewModel
import com.danielhipskind.fihaven.core.net.MfaChallenge
import com.danielhipskind.fihaven.ui.theme.Ct

@Composable
fun AuthScreen(vm: AppViewModel) {
    val working by vm.working.collectAsStateWithLifecycle()
    val error by vm.authError.collectAsStateWithLifecycle()
    var signup by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    LaunchedEffect(Unit) { vm.markAuthStarted() }

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
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                )
                error?.let {
                    Text(it, color = Ct.colors.red, fontSize = 13.sp, modifier = Modifier.padding(top = 10.dp))
                }
                Button(
                    onClick = { if (signup) vm.signup(email, password) else vm.login(email, password) },
                    enabled = !working && email.contains("@") && password.length >= 6,
                    colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent),
                    modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                ) {
                    Text(if (working) "Please wait…" else if (signup) "Create account" else "Sign in")
                }
            }
        }
        TextButton(onClick = { signup = !signup }, modifier = Modifier.padding(top = 6.dp)) {
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
        // Lost-2FA recovery lives on the web: it triggers a destructive
        // wipe confirmed from an emailed link, so it stays out of the app.
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
