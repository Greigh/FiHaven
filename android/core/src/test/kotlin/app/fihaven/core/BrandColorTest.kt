package app.fihaven.core

import app.fihaven.core.logic.BrandColor
import app.fihaven.core.logic.IssuerLogos
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Theme surfaces the issuer marks are drawn on (Theme.kt / tokens.css). */
private const val LIGHT_SURFACE = 0xFFFFFF
private const val DARK_SURFACE = 0x17181B

class BrandColorTest {
    @Test fun luminanceAndContrast() {
        assertEquals(0.0, BrandColor.relativeLuminance(0x000000))
        assertEquals(1.0, BrandColor.relativeLuminance(0xFFFFFF))
        assertEquals(21.0, BrandColor.contrastRatio(0x000000, 0xFFFFFF), 0.01)
        assertEquals(1.0, BrandColor.contrastRatio(0x117ACA, 0x117ACA), 0.001)
    }

    @Test fun mixInterpolates() {
        assertEquals(0x000000, BrandColor.mix(0x000000, 0xFFFFFF, 0.0))
        assertEquals(0xFFFFFF, BrandColor.mix(0x000000, 0xFFFFFF, 1.0))
        assertEquals(0x808080, BrandColor.mix(0x000000, 0xFFFFFF, 0.5))
        assertEquals(0xFFFFFF, BrandColor.mix(0x000000, 0xFFFFFF, 2.0), "amount clamps")
    }

    @Test fun legibleLeavesUsableColorsAlone() {
        // Chase blue already clears 3:1 on white.
        assertEquals(0x117ACA, BrandColor.legible(0x117ACA, LIGHT_SURFACE))
        // Discover orange is fine on the dark surface.
        assertEquals(0xFF6000, BrandColor.legible(0xFF6000, DARK_SURFACE))
    }

    @Test fun legibleLiftsDarkBrandsOnDarkSurfaces() {
        // Apple black and Visa/BofA navy are the invisible cases.
        for (color in listOf(0x000000, 0x1A1F71, 0x012169)) {
            val lifted = BrandColor.legible(color, DARK_SURFACE)
            assertTrue(
                BrandColor.contrastRatio(lifted, DARK_SURFACE) >= 3.0,
                "0x%06X lifted to 0x%06X clears 3:1".format(color, lifted),
            )
        }
        // A navy keeps its blue cast rather than washing out to white.
        val visa = BrandColor.legible(0x1A1F71, DARK_SURFACE)
        assertTrue((visa and 0xFF) > ((visa shr 16) and 0xFF), "blue channel still dominates")
    }

    @Test fun everyBundledMarkIsLegibleOnBothSurfaces() {
        for ((key, logo) in IssuerLogos.all) {
            for (surface in listOf(LIGHT_SURFACE, DARK_SURFACE)) {
                val color = BrandColor.legible(logo.color, surface)
                assertTrue(
                    BrandColor.contrastRatio(color, surface) >= 3.0,
                    "$key readable on 0x%06X".format(surface),
                )
            }
        }
    }
}
