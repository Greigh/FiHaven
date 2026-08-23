package app.fihaven.ui

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
 *
 * [slot] fixes the width the icon occupies, whatever it turns out to be. Pass
 * it in a list that mixes bills with cards: an issuer's tile is wider than a
 * bill's emoji, and without a slot every row's text would start at a
 * different place. `IssuerTile.width(size)` is the width to ask for.
 */
@Composable
fun IconMark(
    icon: CategoryIcon,
    size: Dp = 22.dp,
    fallbackEmoji: String = "📌",
    modifier: Modifier = Modifier,
    slot: Dp? = null,
) {
    val box = if (slot != null) modifier.width(slot) else modifier
    IconMarkContent(icon, size, fallbackEmoji, box, centered = slot != null)
}

@Composable
private fun IconMarkContent(
    icon: CategoryIcon,
    size: Dp,
    fallbackEmoji: String,
    modifier: Modifier,
    centered: Boolean,
) {
    // A slot is only useful if its contents sit in the middle of it.
    if (centered) {
        Box(modifier, contentAlignment = Alignment.Center) {
            IconMarkContent(icon, size, fallbackEmoji, Modifier, centered = false)
        }
        return
    }
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
 * The tile an issuer mark rides — geometry and edge, shared by the brand
 * marks and the monogram so a list of cards keeps one rhythm.
 *
 * Ported from the web's `.card-row-chip` (client/css/components.css). Every
 * issuer gets the same tile whatever mark it carries, and the mark is fitted
 * *into* it rather than the tile being sized to the mark — which is what
 * stopped a wide wordmark like US Bank's from reading as a loose strip beside
 * its neighbours' square marks.
 *
 * The ratios are relative to the tile's height, matching the web's 48x32 tile
 * with its 40x20 content box.
 */
object IssuerTile {
    const val WIDTH_RATIO = 1.5f
    const val CORNER_RATIO = 0.25f
    const val MARK_WIDTH_RATIO = 1.25f
    const val MARK_HEIGHT_RATIO = 0.625f

    fun width(height: Dp): Dp = (height.value * WIDTH_RATIO).dp

    /**
     * A plate's own surface is the light one, so it keeps a dark floor in
     * both themes; a brand tile follows the theme (see `CtColors.tileEdge`).
     */
    val plateEdge = Color(0x29000000)
}

/**
 * The tile's edge: the brand's own color over a neutral floor.
 *
 * A brand tile reads as a slightly deeper edge of its own color; a white
 * plate picks up a brand-tinted outline, which is what keeps it from reading
 * as a logo floating loose on the card. The floor guarantees an edge either
 * way — including for a brand as pale as Best Buy's yellow.
 */
private fun Modifier.issuerTile(
    height: Dp,
    fill: Color,
    brand: Int,
    plated: Boolean,
    floor: Color,
): Modifier {
    val shape = RoundedCornerShape((height.value * IssuerTile.CORNER_RATIO).dp)
    return this
        .size(width = IssuerTile.width(height), height = height)
        .clip(shape)
        .background(fill)
        .border(1.dp, if (plated) IssuerTile.plateEdge else floor, shape)
        .border(1.dp, Color(brand or (0xFF shl 24)).copy(alpha = 0.55f), shape)
}

/**
 * Draw a bundled issuer brand mark ([IssuerLogos]) on its tile.
 *
 * The marks are SVG paths on a grid 24 units tall — the same `d` data the web
 * renders — which Compose's [addPathNodes] parses directly.
 *
 * A monochrome mark is knocked out of a tile in the brand's own color: white
 * for most brands, ink for the light ones that can't carry white (see
 * [BrandColor.ink]). A full-color mark can't be recolored, so its tile becomes
 * the white plate it was drawn for — in both themes, or Bilt's black wordmark
 * would vanish on the dark one.
 *
 * Either way the mark is fitted into the same content box by
 * [ContentScale.Fit] (the web's `object-fit: contain`) and the tile is the
 * same size, so every row's text starts at the same place. Falls back to the
 * emoji stand-in if the key isn't bundled.
 */
@Composable
fun IssuerLogoMark(
    key: String,
    size: Dp = 22.dp,
    fallbackEmoji: String = "\uD83D\uDCB3",
    modifier: Modifier = Modifier,
) {
    val logo = IssuerLogos.logo(key)
    val image = remember(logo) {
        logo ?: return@remember null
        runCatching {
            val builder = ImageVector.Builder(
                name = logo.key,
                defaultWidth = logo.width.dp,
                defaultHeight = 24.dp,
                viewportWidth = logo.width,
                viewportHeight = 24f,
            )
            // Only a monochrome mark can be knocked out; a full-color one
            // keeps every layer as authored.
            val ink = BrandColor.ink(logo.color)
            for (layer in logo.layers) {
                val argb = if (logo.isFullColor) layer.color else ink
                builder.addPath(addPathNodes(layer.path), fill = SolidColor(Color(argb or (0xFF shl 24))))
            }
            builder.build()
        }.getOrNull()
    }

    if (image == null || logo == null) {
        Text(fallbackEmoji, fontSize = (size.value * 0.95f).sp, modifier = modifier)
        return
    }

    Box(
        modifier = modifier.issuerTile(
            height = size,
            fill = if (logo.isFullColor) Ct.colors.logoPlate else Color(logo.color or (0xFF shl 24)),
            brand = logo.color,
            plated = logo.isFullColor,
            floor = Ct.colors.tileEdge,
        ),
        contentAlignment = Alignment.Center,
    ) {
        Image(
            imageVector = image,
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = Modifier.size(
                width = (size.value * IssuerTile.MARK_WIDTH_RATIO).dp,
                height = (size.value * IssuerTile.MARK_HEIGHT_RATIO).dp,
            ),
        )
    }
}

/**
 * Issuer initials on a brand-colored tile, for issuers with no bundled logo
 * (Mission Lane, Navy Federal, PNC, …). Shares the tile with [IssuerLogoMark]
 * so a list keeps its rhythm whichever mark a row gets.
 */
@Composable
fun IssuerMonogramMark(
    text: String,
    color: Int,
    size: Dp = 22.dp,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.issuerTile(
            height = size,
            fill = Color(color or (0xFF shl 24)),
            brand = color,
            plated = false,
            floor = Ct.colors.tileEdge,
        ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            // Ink, not always white: PNC's orange and Amazon's yellow can't
            // carry white initials any more than they can a white mark.
            color = Color(BrandColor.ink(color) or (0xFF shl 24)),
            fontSize = (size.value * 0.42f).sp,
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
