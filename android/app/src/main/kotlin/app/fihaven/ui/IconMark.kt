package app.fihaven.ui

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
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
 * Widest a brand mark may render, as a multiple of its height. Matches the
 * 42px cap the web's 48x32 card chip allows a 24px-tall mark, so a 4:1
 * wordmark can't push a row's text around.
 */
private const val MAX_LOGO_ASPECT = 1.75f

/**
 * Draw a bundled issuer brand mark ([IssuerLogos]) as a vector.
 *
 * The marks are SVG paths on a grid 24 units tall — the same `d` data the web
 * renders — which Compose's [addPathNodes] parses directly. A monochrome mark
 * is a square tinted for the current surface; a full-color one keeps its own
 * colors on a light plate (it was drawn for a white page, and Bilt's black
 * wordmark would vanish on the dark theme) and keeps its own aspect ratio, up
 * to [MAX_LOGO_ASPECT] wide — past that the whole mark scales down and the
 * plate shrinks with it, the way the web's does. Sizing the plate to the row
 * instead left a 4:1 wordmark like Bilt's floating in white bands.
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
    // The mark's box, at the mark's own aspect ratio: width is capped so a
    // wordmark can't push the row's text around, and past the cap the height
    // comes down with it so the mark is scaled whole. Keeping the box square
    // at [size] and letting `ContentScale.Fit` sort it out letterboxed the
    // mark inside its own plate.
    val markWidth = if (fullColor) (size.value * minOf(aspect, MAX_LOGO_ASPECT)).dp else size
    val markHeight = if (aspect > MAX_LOGO_ASPECT) (size.value * MAX_LOGO_ASPECT / aspect).dp else size
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
                // A short, wide plate needs a smaller radius than a square one,
                // or the corners eat the mark.
                .clip(RoundedCornerShape(minOf(size.value * 0.18f, markHeight.value * 0.25f).dp))
                .background(Ct.colors.logoPlate)
                .padding(1.dp),
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
