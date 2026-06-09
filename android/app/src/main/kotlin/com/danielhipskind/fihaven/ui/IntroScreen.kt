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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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

private data class IntroPage(val icon: ImageVector, val title: String, val body: String, val badge: String?)

/// Pre-login first-run intro. Shown once before the auth screen (gated on
/// the local `intro_seen` flag — there's no account yet) to explain what
/// FiHaven is and which features are free vs Pro.
@Composable
fun IntroScreen(vm: AppViewModel) {
    var step by remember { mutableIntStateOf(0) }
    val pages = remember {
        listOf(
            IntroPage(Icons.Filled.AccountBalanceWallet, "Welcome to FiHaven",
                "Track recurring bills, credit cards, and debt payoff — five calm minutes a week instead of a frantic afternoon every payday.", null),
            IntroPage(Icons.Filled.Verified, "Free to use",
                "Your dashboard, bills, cards, and monthly budget are always free. Create an account and start in minutes.", "FREE"),
            IntroPage(Icons.Filled.WorkspacePremium, "FiHaven Pro",
                "Unlock the payoff planner, calendar, and full payment history with Pro. Start free and upgrade anytime — one subscription across web, iOS, and Android.", "PRO"),
        )
    }
    val last = step == pages.lastIndex
    val page = pages[step]

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(horizontal = 24.dp)) {
        Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = { vm.markIntroSeen() }) { Text("Skip", color = Ct.colors.muted) }
        }
        Spacer(Modifier.weight(1f))
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(page.icon, contentDescription = null, tint = Ct.colors.accent, modifier = Modifier.size(64.dp))
            page.badge?.let { b ->
                val color = if (b == "PRO") Ct.colors.accent else Ct.colors.green
                Spacer(Modifier.height(14.dp))
                Box(
                    Modifier.clip(RoundedCornerShape(50)).background(color.copy(alpha = 0.14f))
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                ) {
                    Text(b, color = color, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                }
            }
            Spacer(Modifier.height(20.dp))
            Text(page.title, color = Ct.colors.text, fontSize = 26.sp,
                fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            Spacer(Modifier.height(12.dp))
            Text(page.body, color = Ct.colors.muted, fontSize = 16.sp, textAlign = TextAlign.Center)
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
            onClick = { if (!last) step++ else vm.markIntroSeen() },
            modifier = Modifier.fillMaxWidth().padding(bottom = 30.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent),
        ) {
            Text(if (!last) "Next" else "Get started")
        }
    }
}
