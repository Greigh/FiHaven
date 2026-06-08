package com.danielhipskind.fihaven.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.danielhipskind.fihaven.AppViewModel
import com.danielhipskind.fihaven.core.net.User
import com.danielhipskind.fihaven.ui.theme.Ct
import kotlinx.coroutines.launch

/** Shown when the signed-in account hasn't confirmed its email. The link
 *  is opened from the email (it lands on the web verify page); here the
 *  user can resend it and re-check once they've clicked it. */
@Composable
fun VerifyEmailScreen(vm: AppViewModel, user: User) {
    val scope = rememberCoroutineScope()
    var checking by remember { mutableStateOf(false) }
    var notYet by remember { mutableStateOf(false) }
    var resending by remember { mutableStateOf(false) }
    var resendLabel by remember { mutableStateOf("Resend the email") }

    Column(
        Modifier.fillMaxSize().background(Ct.colors.bg).padding(28.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Wordmark(34)
        Spacer(Modifier.height(14.dp))
        Text("Confirm your email", color = Ct.colors.muted, fontSize = 16.sp)
        Spacer(Modifier.height(10.dp))
        Text(
            "We sent a confirmation link to ${user.email}. Open it to unlock FiHaven, then tap “I’ve confirmed” below.",
            color = Ct.colors.muted, fontSize = 14.sp, textAlign = TextAlign.Center,
        )
        if (notYet) {
            Spacer(Modifier.height(10.dp))
            Text(
                "Still not confirmed — check your inbox (and spam), then try again.",
                color = Ct.colors.red, fontSize = 13.sp, textAlign = TextAlign.Center,
            )
        }
        Spacer(Modifier.height(24.dp))
        Button(
            onClick = {
                if (checking) return@Button
                checking = true; notYet = false
                scope.launch {
                    val ok = vm.refreshVerification()
                    checking = false
                    if (!ok) notYet = true
                }
            },
            enabled = !checking,
            colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent),
        ) { Text(if (checking) "Checking…" else "I’ve confirmed — continue") }

        TextButton(
            enabled = !resending,
            onClick = {
                resending = true; resendLabel = "Sending…"
                scope.launch {
                    val ok = vm.resendVerification()
                    resending = false
                    resendLabel = if (ok) "Sent — check your inbox" else "Couldn’t send — tap to retry"
                }
            },
        ) { Text(resendLabel, color = Ct.colors.accent) }

        TextButton(onClick = { vm.logout() }) {
            Text("Use a different account", color = Ct.colors.muted)
        }
    }
}
