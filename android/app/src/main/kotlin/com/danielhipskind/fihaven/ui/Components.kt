package com.danielhipskind.fihaven.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.danielhipskind.fihaven.ui.theme.Ct

/// A surface "card": padded, rounded, hairline border — the web's `.card`.
@Composable
fun CtCard(
    modifier: Modifier = Modifier,
    padding: Int = 16,
    content: @Composable () -> Unit,
) {
    Box(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Ct.colors.surface)
            .border(1.dp, Ct.colors.border, RoundedCornerShape(14.dp))
            .padding(padding.dp)
    ) { content() }
}

/// The web's footer credit: "Made with ♥ by Daniel Hipskind".
@Composable
fun MadeWithLove(modifier: Modifier = Modifier) {
    val uriHandler = LocalUriHandler.current
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
        Text("Made with ", color = Ct.colors.muted, fontSize = 13.sp)
        Text("♥", color = Ct.colors.red, fontSize = 13.sp)
        Text(" by ", color = Ct.colors.muted, fontSize = 13.sp)
        Text(
            "Daniel Hipskind",
            color = Ct.colors.accent,
            fontSize = 13.sp,
            modifier = Modifier.clickable { uriHandler.openUri("https://fihaven.app/") },
        )
    }
}

/// Uppercase mono label, like the web's `data-label`.
@Composable
fun FieldLabel(text: String) {
    Text(
        text.uppercase(),
        color = Ct.colors.muted,
        fontSize = 10.sp,
        fontWeight = FontWeight.Medium,
        letterSpacing = 0.8.sp,
    )
}
