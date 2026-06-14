package com.danielhipskind.fihaven.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.danielhipskind.fihaven.AppViewModel
import com.danielhipskind.fihaven.Session
import com.danielhipskind.fihaven.ui.theme.Ct

@Composable
fun RootScreen(
    vm: AppViewModel,
    autoLogin: Boolean,
    initialTab: String? = null,
    initialRoute: String? = null,
) {
    val session by vm.session.collectAsStateWithLifecycle()
    val locked by vm.locked.collectAsStateWithLifecycle()
    val introSeen by vm.introSeen.collectAsStateWithLifecycle()
    val dataLoaded by vm.dataLoaded.collectAsStateWithLifecycle()
    val dataError by vm.dataError.collectAsStateWithLifecycle()

    LaunchedEffect(session, autoLogin) {
        if (autoLogin && session is Session.SignedOut) vm.devAutoLogin()
    }

    // Re-engage the lock when the app leaves the foreground.
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_STOP -> vm.onBackground()
                Lifecycle.Event.ON_START -> vm.onForeground()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    when (val s = session) {
        is Session.Loading -> LoadingScreen()
        is Session.SignedOut -> if (introSeen) AuthScreen(vm) else IntroScreen(vm)
        is Session.Mfa -> MfaScreen(vm, s.challenge)
        is Session.Unverified -> VerifyEmailScreen(vm, s.user)
        is Session.SignedIn -> when {
            locked -> LockScreen(vm)
            !s.user.onboarded -> OnboardingScreen(vm)
            dataError != null -> DataErrorScreen(dataError!!, onRetry = { vm.retryDataLoad() }, onLogout = { vm.logout() })
            !dataLoaded -> DataLoadScreen()
            else -> MainScaffold(vm, s.user, initialTab, initialRoute)
        }
    }
}

@Composable
fun Wordmark(size: Int = 30) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        BrandMark(size = (size * 0.85f).toInt(), modifier = Modifier.padding(end = 10.dp))
        Text(
            buildAnnotatedString {
                withStyle(SpanStyle(color = Ct.colors.text)) { append("Fi") }
                withStyle(SpanStyle(color = Ct.colors.accent)) { append("Haven") }
            },
            fontSize = size.sp,
            fontWeight = FontWeight.ExtraBold,
            letterSpacing = (-1).sp,
        )
    }
}

/** Fi monogram on a rounded accent tile — matches the web appbar mark. */
@Composable
fun BrandMark(size: Int = 26, modifier: Modifier = Modifier) {
    Box(
        modifier
            .size(size.dp)
            .clip(RoundedCornerShape((size * 0.23f).dp))
            .background(Ct.colors.accent),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize().padding((size * 0.22f).dp)) {
            val w = this.size.width
            val h = this.size.height
            val bar = w * 0.18f
            drawRoundRect(Color.White, topLeft = Offset(0f, 0f), size = Size(bar, h), cornerRadius = CornerRadius(bar * 0.3f))
            drawRoundRect(Color.White, topLeft = Offset(0f, 0f), size = Size(w * 0.75f, bar), cornerRadius = CornerRadius(bar * 0.3f))
            drawRoundRect(Color.White, topLeft = Offset(0f, h * 0.38f), size = Size(w * 0.58f, bar * 0.85f), cornerRadius = CornerRadius(bar * 0.3f))
        }
    }
}

@Composable
fun LoadingScreen() {
    Column(
        Modifier.fillMaxSize().background(Ct.colors.bg),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Wordmark(34)
        CircularProgressIndicator(Modifier.padding(top = 16.dp).size(28.dp), color = Ct.colors.accent)
    }
}

@Composable
fun DataLoadScreen() = LoadingScreen()

@Composable
fun DataErrorScreen(message: String, onRetry: () -> Unit, onLogout: () -> Unit) {
    Column(
        Modifier.fillMaxSize().background(Ct.colors.bg).padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Wordmark(30)
        Text(
            "Couldn't load your data",
            color = Ct.colors.text,
            fontSize = 18.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(top = 20.dp),
        )
        Text(message, color = Ct.colors.muted, fontSize = 14.sp, modifier = Modifier.padding(top = 8.dp))
        Button(
            onClick = onRetry,
            colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent),
            modifier = Modifier.padding(top = 20.dp),
        ) { Text("Try again") }
        TextButton(onClick = onLogout, modifier = Modifier.padding(top = 8.dp)) {
            Text("Sign out", color = Ct.colors.muted)
        }
    }
}
