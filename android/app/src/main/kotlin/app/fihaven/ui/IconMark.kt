package app.fihaven.ui

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
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
        is CategoryIcon.Monogram -> {
            IssuerMonogramMark(icon.text, icon.color, size = size, modifier = modifier)
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
 * Gap between a full-color mark and the edge of its plate, as a fraction of
 * the plate. Enough that the plate reads as a tile around the mark rather
 * than a box clamped onto it.
 */
private const val LOGO_PLATE_INSET = 0.0625f

/**
 * Draw a bundled issuer brand mark ([IssuerLogos]) as a vector.
 *
 * The marks are SVG paths on a grid 24 units tall — the same `d` data the web
 * renders — which Compose's [addPathNodes] parses directly. A monochrome mark
 * is a square tinted for the current surface; a full-color one keeps its own
 * colors on a light plate (it was drawn for a white page, and Bilt's black
 * wordmark would vanish on the dark theme).
 *
 * The plate is square and exactly [size], like every other mark a row can
 * get, with the mark scaled whole to fit inside it — so a 4:1 wordmark like
 * US Bank's reads as a logo tile and every row's text starts at the same
 * place. Sizing the plate to the mark instead (as the web's fixed 48x32 chip
 * can afford to) flattened a wordmark into a strip and shoved the name
 * column right on exactly the rows that carry one.
 * Falls back to the emoji stand-in if the key isn't bundled.
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
    // and Apple's black are otherwise invisible on the dark theme. A
    // full-color mark is exempt — it sits on its own plate.
    val surface = Ct.colors.surface
    val fullColor = logo != null && logo.isFullColor
    val aspect = if (fullColor) logo!!.aspect else 1f
    // The mark's box: its own aspect ratio, scaled to fit inside the plate's
    // inset. Sizing the box square and letting `ContentScale.Fit` sort it out
    // letterboxed the mark inside its own plate instead.
    val inner = size.value * (1f - 2f * LOGO_PLATE_INSET)
    val markWidth = if (!fullColor) size else (if (aspect >= 1f) inner else inner * aspect).dp
    val markHeight = if (!fullColor) size else (if (aspect >= 1f) inner / aspect else inner).dp
    val image = remember(logo, markWidth, markHeight, surface) {
        logo ?: return@remember null
        runCatching {
            val builder = ImageVector.Builder(
                name = logo.key,
                defaultWidth = markWidth,
                defaultHeight = markHeight,
                viewportWidth = logo.width,
                viewportHeight = 24f,
            )
            for (layer in logo.layers) {
                val argb = if (logo.isFullColor) {
                    layer.color
                } else {
                    BrandColor.legible(layer.color, surface.toArgb() and 0xFFFFFF)
                }
                builder.addPath(addPathNodes(layer.path), fill = SolidColor(Color(argb or (0xFF shl 24))))
            }
            builder.build()
        }.getOrNull()
    }

    if (image == null) {
        Text(fallbackEmoji, fontSize = (size.value * 0.95f).sp, modifier = modifier)
        return
    }

    val mark: @Composable (Modifier) -> Unit = { m ->
        Image(
            imageVector = image,
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = m.size(width = markWidth, height = markHeight),
        )
    }
    if (fullColor) {
        Box(
            modifier = modifier
                .size(size)
                // Same corner as the monogram chip: the two are siblings in a
                // list, one carrying a mark and the other initials.
                .clip(RoundedCornerShape((size.value * 0.22f).dp))
                .background(Ct.colors.logoPlate),
            contentAlignment = Alignment.Center,
        ) {
            mark(Modifier)
        }
    } else {
        mark(modifier)
    }
}

/**
 * Issuer initials on a brand-colored chip, for issuers with no bundled logo
 * (Citi, Capital One, Bilt, …). Sized to match [IssuerLogoMark] so a list
 * keeps its rhythm whichever mark a row gets.
 */
@Composable
fun IssuerMonogramMark(
    text: String,
    color: Int,
    size: Dp = 22.dp,
    modifier: Modifier = Modifier,
) {
    val surface = Ct.colors.surface
    val chip = remember(color, surface) {
        // Dark enough for white initials, then still distinct from the card
        // behind it — an almost black brand would vanish on the dark theme.
        val readable = BrandColor.legible(color, 0xFFFFFF)
        Color(BrandColor.legible(readable, surface.toArgb() and 0xFFFFFF, 1.6) or (0xFF shl 24))
    }
    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape((size.value * 0.22f).dp))
            .background(chip),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            color = Color.White,
            fontSize = (size.value * 0.5f).sp,
            fontWeight = FontWeight.ExtraBold,
            maxLines = 1,
        )
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
