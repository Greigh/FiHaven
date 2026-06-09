package com.danielhipskind.fihaven.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.Celebration
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.danielhipskind.fihaven.AppViewModel
import com.danielhipskind.fihaven.ui.theme.Ct

private data class OnbPage(val icon: ImageVector, val title: String, val body: String)

/// First-run onboarding, shown once after a new account confirms its email
/// (gated on `user.onboarded`). Mirrors the web /welcome flow.
@Composable
fun OnboardingScreen(vm: AppViewModel) {
    var step by remember { mutableIntStateOf(0) }
    var finishing by remember { mutableStateOf(false) }
    val pages = remember {
        listOf(
            OnbPage(Icons.Filled.Celebration, "Welcome to FiHaven",
                "A calm home for your bills, cards, and debt payoff. Here's a quick tour."),
            OnbPage(Icons.Filled.Lock, "Secure your account",
                "Add two-factor authentication anytime from Settings → Security for an extra layer of protection."),
            OnbPage(Icons.AutoMirrored.Filled.ReceiptLong, "Track bills & cards",
                "Add recurring bills and credit cards — including 0% promo periods — from the Bills and Cards tabs."),
            OnbPage(Icons.Filled.WorkspacePremium, "FiHaven Pro",
                "Unlock the payoff planner, calendar, and full history. One subscription works across web, iOS, and Android."),
        )
    }
    val last = step == pages.lastIndex
    fun finish() { if (!finishing) { finishing = true; vm.completeOnboarding() } }

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(horizontal = 24.dp)) {
        Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = { finish() }, enabled = !finishing) {
                Text("Skip", color = Ct.colors.muted)
            }
        }
        Spacer(Modifier.weight(1f))
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(pages[step].icon, contentDescription = null, tint = Ct.colors.accent, modifier = Modifier.size(64.dp))
            Spacer(Modifier.height(20.dp))
            Text(pages[step].title, color = Ct.colors.text, fontSize = 26.sp,
                fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            Spacer(Modifier.height(12.dp))
            Text(pages[step].body, color = Ct.colors.muted, fontSize = 16.sp, textAlign = TextAlign.Center)
        }
        Spacer(Modifier.weight(1f))
        Row(Modifier.fillMaxWidth().padding(bottom = 20.dp), horizontalArrangement = Arrangement.Center) {
            pages.indices.forEach { i ->
                Box(
                    Modifier.padding(horizontal = 4.dp).size(8.dp).clip(CircleShape)
                        .background(if (i == step) Ct.colors.accent else Ct.colors.border),
                )
            }
        }
        Button(
            onClick = { if (!last) step++ else finish() },
            enabled = !finishing,
            modifier = Modifier.fillMaxWidth().padding(bottom = 30.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent),
        ) {
            Text(if (!last) "Next" else if (finishing) "Getting started…" else "Get started")
        }
    }
}
