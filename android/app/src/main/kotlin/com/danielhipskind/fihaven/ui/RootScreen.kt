package com.danielhipskind.fihaven.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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

    LaunchedEffect(session, autoLogin) {
        if (autoLogin && session is Session.SignedOut) vm.devAutoLogin()
    }

    // Re-engage the lock when the app leaves the foreground.
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) vm.lockIfEnabled()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    when (val s = session) {
        is Session.Loading -> LoadingScreen()
        is Session.SignedOut -> AuthScreen(vm)
        is Session.Mfa -> MfaScreen(vm, s.challenge)
        is Session.Unverified -> VerifyEmailScreen(vm, s.user)
        is Session.SignedIn ->
            if (locked) LockScreen(vm) else MainScaffold(vm, s.user, initialTab, initialRoute)
    }
}

@Composable
fun Wordmark(size: Int = 30) {
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
