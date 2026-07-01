package app.fihaven.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.fihaven.AppViewModel
import app.fihaven.ui.theme.Ct

/** Shown over the signed-in app when the biometric lock is engaged.
 *  Auto-prompts on appear; offers a manual retry and a sign-out escape. */
@Composable
fun LockScreen(vm: AppViewModel) {
    val activity = LocalContext.current.findFragmentActivity()
    fun prompt() {
        activity?.let {
            BiometricAuth.authenticate(it, "Unlock FiHaven", "Use your fingerprint or face") { ok ->
                if (ok) vm.confirmUnlock()
            }
        }
    }
    LaunchedEffect(Unit) { prompt() }

    Column(
        Modifier.authScreen().padding(28.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Wordmark(34)
        Spacer(Modifier.height(14.dp))
        Icon(Icons.Filled.Fingerprint, contentDescription = null,
            tint = Ct.colors.accent, modifier = Modifier.size(48.dp))
        Spacer(Modifier.height(10.dp))
        Text("FiHaven is locked", color = Ct.colors.muted, fontSize = 16.sp)
        Spacer(Modifier.height(24.dp))
        Button(
            onClick = { prompt() },
            colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent),
        ) { Text("Unlock") }
        TextButton(onClick = { vm.logout() }) {
            Text("Sign out", color = Ct.colors.muted)
        }
    }
}
