package app.fihaven.ui

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.fihaven.core.logic.BrandColor
import app.fihaven.core.logic.IssuerLogos
import app.fihaven.core.model.CategoryIcon
import app.fihaven.ui.theme.Ct

/**
 * Render a [CategoryIcon] — emoji glyph, a decoded data-URI image, or a
 * bundled issuer brand mark.
 */
@Composable
fun IconMark(
    icon: CategoryIcon,
    size: Dp = 22.dp,
    fallbackEmoji: String = "📌",
    modifier: Modifier = Modifier,
) {
    when (icon) {
        is CategoryIcon.Emoji -> {
            Text(icon.value, fontSize = (size.value * 0.95f).sp, modifier = modifier)
        }
        is CategoryIcon.Logo -> {
            IssuerLogoMark(icon.key, size = size, fallbackEmoji = icon.emoji, modifier = modifier)
        }
        is CategoryIcon.Image -> {
            val bitmap = remember(icon.dataUri) { decodeIconDataUrl(icon.dataUri) }
            if (bitmap != null) {
                Image(
                    bitmap = bitmap,
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = modifier
                        .size(size)
                        .clip(RoundedCornerShape((size.value * 0.18f).dp)),
                )
            } else {
                Text(fallbackEmoji, fontSize = (size.value * 0.95f).sp, modifier = modifier)
            }
        }
    }
}

/**
 * Draw a bundled issuer brand mark ([IssuerLogos]) as a vector.
 *
 * The marks are Simple Icons paths on a 24x24 grid — the same `d` data the
 * web renders — which Compose's [addPathNodes] parses directly. Falls back
 * to the emoji stand-in if the key isn't bundled.
 */
@Composable
fun IssuerLogoMark(
    key: String,
    size: Dp = 22.dp,
    fallbackEmoji: String = "💳",
    modifier: Modifier = Modifier,
) {
    val logo = IssuerLogos.logo(key)
    // Nudge the brand color toward the surface's contrast floor: Visa's navy
    // and Apple's black are otherwise invisible on the dark theme.
    val surface = Ct.colors.surface
    val image = remember(logo, size, surface) {
        logo ?: return@remember null
        val tint = Color(BrandColor.legible(logo.color, surface.toArgb() and 0xFFFFFF) or (0xFF shl 24))
        runCatching {
            ImageVector.Builder(
                name = logo.key,
                defaultWidth = size,
                defaultHeight = size,
                viewportWidth = 24f,
                viewportHeight = 24f,
            ).addPath(addPathNodes(logo.path), fill = SolidColor(tint)).build()
        }.getOrNull()
    }

    if (image != null) {
        Image(
            imageVector = image,
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = modifier.size(size),
        )
    } else {
        Text(fallbackEmoji, fontSize = (size.value * 0.95f).sp, modifier = modifier)
    }
}

internal fun decodeIconDataUrl(s: String): androidx.compose.ui.graphics.ImageBitmap? {
    val comma = s.indexOf(',')
    if (comma < 0) return null
    return runCatching {
        val bytes = Base64.decode(s.substring(comma + 1), Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
    }.getOrNull()
}
