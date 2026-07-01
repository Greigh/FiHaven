# FiHaven release shrinker keeps — add rules if a release build crashes on
# reflection/serialization (smoke-test ./gradlew :app:assembleRelease).

-keepattributes *Annotation*, InnerClasses, EnclosingMethod, Signature

# kotlinx.serialization (API models in :core and app)
-keep,includedescriptorclasses class app.fihaven.**$$serializer { *; }
-keepclassmembers class app.fihaven.** {
    *** Companion;
}
-keepclasseswithmembers class app.fihaven.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep @kotlinx.serialization.Serializable class app.fihaven.** { *; }

# Plaid Link SDK
-keep class com.plaid.** { *; }
-dontwarn com.plaid.**

# Credential Manager / Google Sign-In
-keep class androidx.credentials.** { *; }
-keep class com.google.android.libraries.identity.googleid.** { *; }

# Play Billing
-keep class com.android.vending.billing.** { *; }
