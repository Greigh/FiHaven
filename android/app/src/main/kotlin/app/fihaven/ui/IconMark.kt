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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.fihaven.core.model.CategoryIcon

/** Render a [CategoryIcon] — emoji glyph or a decoded data-URI image. */
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

internal fun decodeIconDataUrl(s: String): androidx.compose.ui.graphics.ImageBitmap? {
    val comma = s.indexOf(',')
    if (comma < 0) return null
    return runCatching {
        val bytes = Base64.decode(s.substring(comma + 1), Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
    }.getOrNull()
}
