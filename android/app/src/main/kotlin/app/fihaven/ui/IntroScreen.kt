package app.fihaven.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.CreditCard
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.fihaven.AppViewModel
import app.fihaven.ui.theme.Ct

private data class IntroFeature(val icon: ImageVector, val text: String)
private data class IntroPage(
    val icon: ImageVector,
    val title: String,
    val body: String,
    val badge: String?,
    val brand: Boolean = false,
    val features: List<IntroFeature> = emptyList(),
)

/// Pre-login first-run intro. Shown once before the auth screen (gated on
/// the local `intro_seen` flag — there's no account yet) to explain what
/// FiHaven is and which features are free vs Pro.
@Composable
fun IntroScreen(vm: AppViewModel) {
    var step by remember { mutableIntStateOf(0) }
    val pages = remember {
        listOf(
            IntroPage(
                Icons.AutoMirrored.Filled.ReceiptLong, "Welcome to FiHaven",
                "Five calm minutes a week instead of a frantic afternoon every payday.",
                badge = null, brand = true,
                features = listOf(
                    IntroFeature(Icons.AutoMirrored.Filled.ReceiptLong, "Track recurring bills in one place"),
                    IntroFeature(Icons.Filled.CreditCard, "Credit cards & 0% promo periods"),
                    IntroFeature(Icons.AutoMirrored.Filled.TrendingUp, "A clear plan to pay down debt"),
                ),
            ),
            IntroPage(
                Icons.Filled.Verified, "Free to use",
                "Your dashboard, bills, cards, and monthly budget are always free. Create an account and start in minutes.",
                badge = "FREE",
            ),
            IntroPage(
                Icons.Filled.WorkspacePremium, "FiHaven Pro",
                "Unlock the payoff planner, calendar, and full payment history. Start free and upgrade anytime — one subscription across web, iOS, and Android.",
                badge = "PRO",
            ),
        )
    }
    val last = step == pages.lastIndex
    val page = pages[step]
    val badgeColor = if (page.badge == "PRO") Ct.colors.accent else Ct.colors.green

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(horizontal = 24.dp)) {
        Row(
            Modifier.fillMaxWidth().padding(top = 14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Wordmark(size = 22)
            if (!last) TextButton(onClick = { vm.markIntroSeen() }) { Text("Skip", color = Ct.colors.muted) }
        }

        Spacer(Modifier.weight(1f))

        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            // Soft gradient disc with the FiHaven mark (page 1) or page glyph.
            Box(
                Modifier.size(132.dp).clip(RoundedCornerShape(50))
                    .background(
                        Brush.linearGradient(
                            listOf(Ct.colors.accent.copy(alpha = 0.18f), badgeColor.copy(alpha = 0.06f)),
                        ),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                if (page.brand) {
                    BrandMark(size = 72)
                } else {
                    Icon(page.icon, contentDescription = null, tint = badgeColor, modifier = Modifier.size(52.dp))
                }
            }

            page.badge?.let { b ->
                Spacer(Modifier.height(16.dp))
                Box(
                    Modifier.clip(RoundedCornerShape(50)).background(badgeColor.copy(alpha = 0.14f))
                        .padding(horizontal = 11.dp, vertical = 4.dp),
                ) {
                    Text(b, color = badgeColor, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
                }
            }

            Spacer(Modifier.height(20.dp))
            Text(page.title, color = Ct.colors.text, fontSize = 28.sp,
                fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            Spacer(Modifier.height(12.dp))
            Text(page.body, color = Ct.colors.muted, fontSize = 16.sp, textAlign = TextAlign.Center)

            if (page.features.isNotEmpty()) {
                Spacer(Modifier.height(24.dp))
                Column(
                    Modifier.fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(Ct.colors.surface)
                        .border(1.dp, Ct.colors.border, RoundedCornerShape(14.dp))
                        .padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    page.features.forEach { f ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(f.icon, contentDescription = null, tint = Ct.colors.accent,
                                modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(12.dp))
                            Text(f.text, color = Ct.colors.text, fontSize = 15.sp)
                        }
                    }
                }
            }
        }

        Spacer(Modifier.weight(1f))

        Row(
            Modifier.fillMaxWidth().padding(bottom = 20.dp),
            horizontalArrangement = Arrangement.Center,
        ) {
            pages.indices.forEach { i ->
                Box(
                    Modifier.padding(horizontal = 4.dp)
                        .width(if (i == step) 22.dp else 8.dp).height(8.dp)
                        .clip(RoundedCornerShape(50))
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
