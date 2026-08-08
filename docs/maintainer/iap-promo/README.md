# IAP promotional images (App Store)

1024×1024 PNGs for promoted auto-renewable subscriptions. **Do not** reuse the
app icon; each product needs a unique image (Guideline 2.3.2).

| File | Product ID |
|---|---|
| `iap-promo-monthly.png` | `app.fihaven.pro.monthly` |
| `iap-promo-yearly.png` | `app.fihaven.pro.yearly` |
| `iap-promo-family.png` | `app.fihaven.pro.family` |

Upload in App Store Connect → Monetization → each subscription → Promotional Image.

## Editing

The `.svg` files are the source; the PNGs are generated. Edit the SVG, then:

```sh
./export-iap-promo.sh    # needs: brew install librsvg
```

They share the design language of `android/play-store/feature-graphic.svg` —
same gradient, brand blue `#3D6FE1`, card treatment, and Manrope. The font is
loaded by relative path from `android/play-store/Manrope-Variable.ttf`, so the
SVGs only render correctly from inside this repo.

Deliberately **no prices**: App Store Connect promotional images shouldn't carry
pricing, and it would go stale against the real product configuration.
