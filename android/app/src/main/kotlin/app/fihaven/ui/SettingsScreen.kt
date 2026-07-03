package app.fihaven.ui

import app.fihaven.ui.theme.PlexMono

import android.Manifest
import android.content.Intent
import android.os.Build
import androidx.fragment.app.FragmentActivity
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.Image
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Checkbox
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import app.fihaven.BuildConfig
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.activity.compose.BackHandler
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.fihaven.AppViewModel
import app.fihaven.BioLockDelay
import app.fihaven.SyncState
import app.fihaven.core.model.Entitlement
import app.fihaven.core.model.autopayMark
import app.fihaven.core.model.autopayMarkHour
import app.fihaven.core.model.billReminders
import app.fihaven.core.model.currency
import app.fihaven.core.model.hidePaidOnDashboard
import app.fihaven.core.model.dashboardLayout
import app.fihaven.core.model.landingView
import app.fihaven.core.model.localNotifications
import app.fihaven.core.model.pushNotifications
import app.fihaven.core.model.offerReminders
import app.fihaven.core.model.monthlySummary
import app.fihaven.core.model.notifyHour
import app.fihaven.core.model.paidGoal
import app.fihaven.core.model.reminderLeadDays
import app.fihaven.core.model.remindOnDueDay
import app.fihaven.core.model.weeklyDigest
import app.fihaven.core.model.periodAnchor
import app.fihaven.core.model.periodLength
import app.fihaven.core.model.periodMode
import app.fihaven.core.model.periodStartDay
import app.fihaven.core.model.tabBar
import app.fihaven.core.model.timezoneSetting
import app.fihaven.core.model.budgetRule
import app.fihaven.core.model.budgetRuleSplits
import app.fihaven.core.model.debtFocusExtra
import app.fihaven.core.model.envelopeRollover
import app.fihaven.core.model.budgetBucketOverrides
import app.fihaven.core.model.SPENDING_CATEGORIES
import app.fihaven.core.CTConstants
import app.fihaven.core.logic.BudgetRules
import app.fihaven.core.logic.PaidGoalPolicy
import kotlinx.serialization.json.JsonObject
import app.fihaven.core.net.ApiError
import app.fihaven.core.net.MfaStatus
import app.fihaven.core.net.PasskeyInfo
import app.fihaven.core.net.User
import androidx.credentials.exceptions.CreateCredentialCancellationException
import app.fihaven.ui.theme.Ct
import app.fihaven.ui.theme.LocalThemeController
import app.fihaven.ui.theme.ThemeController
import app.fihaven.ui.theme.ThemePref
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(vm: AppViewModel, user: User, padding: PaddingValues, onBack: (() -> Unit)? = null) {
    val data by vm.data.collectAsStateWithLifecycle()
    val entitlement by vm.entitlement.collectAsStateWithLifecycle()
    val themeController = LocalThemeController.current
    val activity = LocalContext.current.findFragmentActivity()
    val lockAfter by vm.lockAfterMinutes.collectAsStateWithLifecycle()
    var dialog by remember { mutableStateOf<String?>(null) }
    var mfa by remember { mutableStateOf<MfaStatus?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    val current = vm.currentUser ?: user
    val uriHandler = LocalUriHandler.current

    LaunchedEffect(reload) { mfa = runCatching { vm.api.mfaStatus() }.getOrNull() }
    val close: () -> Unit = { dialog = null; reload++ }

    // POST_NOTIFICATIONS (Android 13+); reschedule once the user responds.
    val notifPermLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { vm.refreshNotifications() }

    // Grouped landing: pick a group, drill into its settings. `group == null`
    // shows the category list; back returns there, then out to More.
    var group by remember { mutableStateOf<String?>(null) }
    if (group != null) BackHandler { group = null }

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        ScreenHeader(
            group?.let { groupTitle(it) } ?: "Settings",
            onBack = if (group != null) ({ group = null }) else onBack,
            branded = true,
        )
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
          if (group == null) {
            item { MembershipCard(vm, current, entitlement) }
            item {
                Section("SETTINGS") {
                    GroupRow("Account", "Profile, email, password") { group = "account" }
                    HorizontalDivider(color = Ct.colors.border)
                    GroupRow("Security", "Two-factor, recovery") { group = "security" }
                    HorizontalDivider(color = Ct.colors.border)
                    GroupRow("Preferences", "Currency, period, display") { group = "preferences" }
                    HorizontalDivider(color = Ct.colors.border)
                    GroupRow("Budget lens", "Split presets, debt focus, envelopes") { group = "budgetlens" }
                    HorizontalDivider(color = Ct.colors.border)
                    GroupRow("Notifications", "Reminders, digest, summary") { group = "notifications" }
                    HorizontalDivider(color = Ct.colors.border)
                    GroupRow("Family", "Share with your household") { group = "family" }
                    HorizontalDivider(color = Ct.colors.border)
                    GroupRow("Automation", "Autopay auto-mark") { group = "automation" }
                    HorizontalDivider(color = Ct.colors.border)
                    GroupRow("Bank", "Linked accounts") { group = "bank" }
                    HorizontalDivider(color = Ct.colors.border)
                    GroupRow("Data", "Export, clear, delete") { group = "data" }
                    HorizontalDivider(color = Ct.colors.border)
                    GroupRow("Help & about", "Links, licenses, version") { group = "about" }
                    if (BuildConfig.DEBUG) {
                        HorizontalDivider(color = Ct.colors.border)
                        GroupRow("Developer", "Simulate subscription states") { group = "developer" }
                    }
                }
            }
            item {
                Button(onClick = { vm.logout() }, modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.surface2, contentColor = Ct.colors.red)) {
                    Text("Sign out")
                }
            }
          }
          if (group == "account") {
            item {
                Section("ACCOUNT") {
                    KeyValueRow("Email", current.email)
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("Name", current.name?.takeIf { it.isNotBlank() } ?: "Add") { dialog = "name" }
                    if (current.emailVerified) {
                        HorizontalDivider(color = Ct.colors.border)
                        NavRow("Change email", null) { dialog = "email" }
                    }
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("Change password", null) { dialog = "password" }
                    HorizontalDivider(color = Ct.colors.border)
                    val sync by vm.syncState.collectAsStateWithLifecycle()
                    Text(
                        when (sync) {
                            SyncState.Saving -> "☁ Saving to your account…"
                            SyncState.Offline -> "☁ Offline — saved on this device, will sync when back online."
                            else -> "☁ Synced to your account — changes save automatically across devices."
                        },
                        color = Ct.colors.muted, fontSize = 12.5.sp,
                        modifier = Modifier.padding(16.dp),
                    )
                }
            }
          }
          if (group == "security") {
            item {
                Section("SECURITY") {
                    val m = mfa
                    if (m == null) {
                        KeyValueRow("Two-factor", "…")
                    } else {
                        NavRow("Authenticator app", if (m.totp.enabled) "On" else "Set up",
                            valueColor = if (m.totp.enabled) Ct.colors.green else Ct.colors.accent) {
                            dialog = if (m.totp.enabled) "totpDisable" else "totpSetup"
                        }
                        HorizontalDivider(color = Ct.colors.border)
                        NavRow("Passkeys",
                            if (m.passkeys.isEmpty()) "Add" else "${m.passkeys.size} registered",
                            valueColor = if (m.passkeys.isNotEmpty()) Ct.colors.green else Ct.colors.accent) {
                            dialog = "passkeys"
                        }
                        HorizontalDivider(color = Ct.colors.border)
                        NavRow("Email codes", if (m.emailMfa.enabled) "On" else "Off",
                            valueColor = if (m.emailMfa.enabled) Ct.colors.green else Ct.colors.muted) {
                            dialog = if (m.emailMfa.enabled) "emailDisable" else "emailEnable"
                        }
                        if (m.totp.enabled) {
                            HorizontalDivider(color = Ct.colors.border)
                            NavRow("Backup codes", "${m.backupCodes.unused} left") { dialog = "backup" }
                        }
                    }
                }
            }
          }
          if (group == "preferences") {
            item {
                Section("PREFERENCES") {
                    NavRow("Appearance", themeController.pref.label) { dialog = "appearance" }
                    if (activity != null && BiometricAuth.isAvailable(activity)) {
                        HorizontalDivider(color = Ct.colors.border)
                        NavRow("Require biometric / passcode after", BioLockDelay.label(lockAfter)) { dialog = "biolock" }
                    }
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("Time zone", data.settings.timezoneSetting ?: "Auto") { dialog = "timezone" }
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("Currency", data.settings.currency ?: "USD") { dialog = "currency" }
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("Default view", defaultViewLabel(data.settings.landingView)) { dialog = "defaultview" }
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("Customize tabs", null) { dialog = "tabs" }
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("Dashboard layout",
                        if (data.settings.dashboardLayout == "widgets") "Widgets" else "Classic") { dialog = "dashboardlayout" }
                    HorizontalDivider(color = Ct.colors.border)
                    PaidGoalPicker(PaidGoalPolicy.from(data.settings.paidGoal)) { vm.setPaidGoal(it) }
                    Text(
                        "How much you must pay before a bill or card counts as fully paid. Anything less shows as a partial payment.",
                        color = Ct.colors.muted, fontSize = 12.sp,
                        modifier = Modifier.padding(top = 6.dp, start = 4.dp, end = 4.dp),
                    )
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("Budget period", periodModeLabel(data.settings.periodMode)) { dialog = "period" }
                    HorizontalDivider(color = Ct.colors.border)
                    SwitchRow("Hide fully paid on dashboard", data.settings.hidePaidOnDashboard) {
                        vm.setHidePaidOnDashboard(it)
                    }
                }
            }
          }
          if (group == "notifications") {
            item {
                Section("NOTIFICATIONS") {
                    val s = data.settings
                    SwitchRow("Remind me on this device", s.localNotifications) { on ->
                        vm.setLocalNotifications(on)
                        if (on && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            notifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        }
                    }
                    HorizontalDivider(color = Ct.colors.border)
                    SwitchRow("Push notifications", s.pushNotifications) { on ->
                        vm.setPushNotifications(on)
                        if (on && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            notifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        }
                    }
                    HorizontalDivider(color = Ct.colors.border)
                    SwitchRow("Email me bill reminders", s.billReminders) { vm.setBillReminders(it) }
                    if (s.localNotifications || s.billReminders) {
                        HorizontalDivider(color = Ct.colors.border)
                        NavRow("Remind me", leadLabel(s.reminderLeadDays)) { dialog = "leaddays" }
                        HorizontalDivider(color = Ct.colors.border)
                        SwitchRow("Also remind on the due day", s.remindOnDueDay) { vm.setRemindOnDueDay(it) }
                    }
                    HorizontalDivider(color = Ct.colors.border)
                    SwitchRow("Weekly digest email", s.weeklyDigest) { vm.setWeeklyDigest(it) }
                    HorizontalDivider(color = Ct.colors.border)
                    SwitchRow("Monthly summary email", s.monthlySummary) { vm.setMonthlySummary(it) }
                    HorizontalDivider(color = Ct.colors.border)
                    SwitchRow("Card offer reminders", s.offerReminders) { vm.setOfferReminders(it) }
                    if (s.localNotifications || s.billReminders || s.weeklyDigest || s.monthlySummary) {
                        HorizontalDivider(color = Ct.colors.border)
                        NavRow("Send at", hourLabel(s.notifyHour)) { dialog = "notifyhour" }
                    }
                    Text(
                        "On-device reminders work offline. Push and email use your reminder settings above and fire in your time zone. Enable push in the iOS or Android app — the web can't register a device token.",
                        color = Ct.colors.muted, fontSize = 12.sp,
                        modifier = Modifier.padding(top = 10.dp, start = 4.dp, end = 4.dp),
                    )
                }
            }
          }
          if (group == "family") {
            item { HouseholdSection(vm) }
          }
          if (group == "budgetlens") {
            item { BudgetLensSection(vm, data.settings) }
          }
          if (group == "automation") {
            item {
                Section("AUTOMATION") {
                    SwitchRow("Auto-mark autopay paid", data.settings.autopayMark) { vm.setAutopayMark(it) }
                    if (data.settings.autopayMark) {
                        HorizontalDivider(color = Ct.colors.border)
                        NavRow("Server marks at", hourLabel(data.settings.autopayMarkHour)) { dialog = "autopayhour" }
                    }
                    Text(
                        "Bills and cards flagged Autopay are recorded paid on their due date — on this device and on the server at the chosen hour. If a real autopay fails, delete the auto-marked payment.",
                        color = Ct.colors.muted, fontSize = 12.sp,
                        modifier = Modifier.padding(top = 10.dp, start = 4.dp, end = 4.dp),
                    )
                }
            }
          }
          if (group == "bank") {
            item {
                Section("BANK") {
                    NavRow("Bank connections", null) { dialog = "bank" }
                }
            }
          }
          if (group == "about") {
            item {
                Section("HELP & FEEDBACK") {
                    NavRow("Website", null) { uriHandler.openUri("https://fihaven.app/") }
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("Report a bug", null) {
                        uriHandler.openUri("https://github.com/Greigh/FiHaven/issues/new?template=bug_report.md")
                    }
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("Suggest a feature", null) {
                        uriHandler.openUri("https://github.com/Greigh/FiHaven/issues/new?template=feature_request.md")
                    }
                }
                Section("ABOUT") {
                    NavRow("Privacy Policy", null) { uriHandler.openUri("https://fihaven.app/privacy") }
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("Terms of Service", null) { uriHandler.openUri("https://fihaven.app/terms") }
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("Open-source licenses", null) { dialog = "licenses" }
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("License", "Source available", Ct.colors.accent) {
                        uriHandler.openUri("https://github.com/Greigh/FiHaven/blob/main/LICENSE")
                    }
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("Source code", null) { uriHandler.openUri("https://github.com/Greigh/FiHaven") }
                    HorizontalDivider(color = Ct.colors.border)
                    KeyValueRow("Version", BuildConfig.VERSION_NAME)
                }
            }
          }
          if (group == "developer") {
            item {
                Section("SUBSCRIPTION OVERRIDE") {
                    DevEntitlementRow(vm)
                }
            }
          }
          if (group == "data") {
            item {
                ExportRow(vm)
            }
            item {
                Button(onClick = { dialog = "clear" }, modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.surface2, contentColor = Ct.colors.red)) {
                    Text("Clear data")
                }
            }
            item {
                Button(onClick = { dialog = "delete" }, modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.redBg, contentColor = Ct.colors.red)) {
                    Text("Delete account")
                }
            }
          }
        }
    }

    when (dialog) {
        "name" -> ChangeNameDialog(vm, current, close)
        "email" -> ChangeEmailDialog(vm, current, close)
        "password" -> ChangePasswordDialog(vm, close)
        "clear" -> ClearDataDialog(vm, close)
        "delete" -> DeleteAccountDialog(vm, close)
        "totpSetup" -> TotpSetupDialog(vm, close)
        "totpDisable" -> TotpDisableDialog(vm, close)
        "passkeys" -> PasskeysDialog(vm, mfa?.passkeys.orEmpty(), close)
        "emailEnable" -> EmailEnableDialog(vm, current.email, close)
        "emailDisable" -> EmailDisableDialog(vm, close)
        "backup" -> BackupCodesDialog(vm, close)
        "timezone" -> TimezoneDialog(vm, close)
        "period" -> PeriodDialog(vm, data.settings, close)
        "autopayhour" -> AutopayHourDialog(vm, data.settings.autopayMarkHour, close)
        "leaddays" -> LeadDaysDialog(vm, data.settings.reminderLeadDays, close)
        "notifyhour" -> NotifyHourDialog(vm, data.settings.notifyHour, close)
        "dashboardlayout" -> DashboardLayoutDialog(vm, data.settings, close)
        "currency" -> CurrencyDialog(vm, data.settings.currency ?: "USD", close)
        "defaultview" -> DefaultViewDialog(vm, data.settings.landingView ?: "dashboard", close)
        "appearance" -> AppearanceDialog(themeController) { dialog = null }
        "biolock" -> BioLockDialog(vm, activity, lockAfter, close)
        "licenses" -> LicensesDialog(close)
        "tabs" -> TabsDialog(vm, close)
        "bank" -> BankDialog(vm, close)
    }
}

@Composable
private fun TabsDialog(vm: AppViewModel, onDone: () -> Unit) {
    val resolved = remember { resolveTabs(vm.data.value.settings.tabBar) }
    var bottom by remember { mutableStateOf(resolved.first) }
    var more by remember { mutableStateOf(resolved.second) }

    fun persist(newBottom: List<TabId>) {
        bottom = newBottom
        vm.setTabs(newBottom.map { it.id })
    }

    FormDialog("Customize tabs", saveEnabled = false, onSave = {}, onDismiss = onDone) {
        Text("BOTTOM BAR", color = Ct.colors.muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        bottom.forEachIndexed { i, t ->
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(t.label, color = Ct.colors.text, fontSize = 15.sp, modifier = Modifier.weight(1f))
                TextButton(
                    onClick = { if (i > 0) persist(bottom.toMutableList().apply { add(i - 1, removeAt(i)) }) },
                    enabled = i > 0,
                ) { Text("↑", color = Ct.colors.accent) }
                TextButton(
                    onClick = { if (i < bottom.lastIndex) persist(bottom.toMutableList().apply { add(i + 1, removeAt(i)) }) },
                    enabled = i < bottom.lastIndex,
                ) { Text("↓", color = Ct.colors.accent) }
                TextButton(onClick = { more = listOf(t) + more; persist(bottom - t) }) {
                    Text("Remove", color = Ct.colors.red)
                }
            }
        }
        Text("MORE", color = Ct.colors.muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(top = 8.dp))
        more.forEach { t ->
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(t.label, color = Ct.colors.text, fontSize = 15.sp, modifier = Modifier.weight(1f))
                TextButton(
                    onClick = { if (bottom.size < MAX_BOTTOM_TABS) { more = more - t; persist(bottom + t) } },
                    enabled = bottom.size < MAX_BOTTOM_TABS,
                ) { Text("Add", color = Ct.colors.accent) }
            }
        }
        Text(
            "Up to $MAX_BOTTOM_TABS tabs in the bottom bar; the rest live under More. Free accounts always show a Get Pro tab.",
            color = Ct.colors.muted, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp),
        )
    }
}

@Composable
private fun LicensesDialog(onDone: () -> Unit) {
    val uriHandler = LocalUriHandler.current
    // Third-party libraries bundled in the Android APK. Apache-2.0 asks
    // that we ship its license text / a notice on redistribution; Play
    // Billing is under Google's Android SDK license.
    val libs = listOf(
        "Jetpack Compose (UI, Material 3, Icons)" to "Apache-2.0",
        "AndroidX (Activity, Lifecycle)" to "Apache-2.0",
        "Kotlin & kotlinx (Coroutines, Serialization)" to "Apache-2.0",
        "AndroidX Security Crypto (Tink)" to "Apache-2.0",
        "AndroidX Biometric" to "Apache-2.0",
        "Google Play Billing Library" to "Android SDK License",
        "Plaid Link (com.plaid.link)" to "Plaid SDK License",
        "Manrope Font" to "SIL Open Font License 1.1",
        "IBM Plex Mono Font" to "SIL Open Font License 1.1"
    )
    FormDialog("Open-source licenses", saveEnabled = false, onSave = {}, onDismiss = onDone) {
        Text(
            "FiHaven is free software with an optional subscription purchase.",
            color = Ct.colors.text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold
        )
        Text(
            "FiHaven for Android bundles these open-source libraries and resources:",
            color = Ct.colors.muted, fontSize = 13.sp,
        )
        libs.forEach { (name, license) ->
            Column(Modifier.fillMaxWidth()) {
                Text(name, color = Ct.colors.text, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                Text(license, color = Ct.colors.muted, fontSize = 12.sp)
            }
        }
        TextButton(
            onClick = { uriHandler.openUri("https://www.apache.org/licenses/LICENSE-2.0") },
            contentPadding = PaddingValues(0.dp),
        ) {
            Text("View the Apache License 2.0", color = Ct.colors.accent, fontSize = 13.sp)
        }
        HorizontalDivider(color = Ct.colors.border)
        Text("FiHaven itself is source available — see github.com/Greigh/FiHaven.", color = Ct.colors.muted, fontSize = 12.sp)
    }
}

@Composable
private fun PaidGoalPicker(current: PaidGoalPolicy, onSelect: (PaidGoalPolicy) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text("Mark fully paid at", color = Ct.colors.text, fontSize = 16.sp)
        Row(
            Modifier.fillMaxWidth().padding(top = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            listOf(
                PaidGoalPolicy.MINIMUM to "Minimum",
                PaidGoalPolicy.RECOMMENDED to "Recommended",
                PaidGoalPolicy.FULL to "Full amount",
            ).forEach { (policy, label) ->
                val selected = policy == current
                Text(
                    label,
                    color = if (selected) Color.White else Ct.colors.text,
                    fontSize = 13.sp,
                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (selected) Ct.colors.accent else Ct.colors.bg)
                        .border(1.dp, if (selected) Ct.colors.accent else Ct.colors.border, RoundedCornerShape(8.dp))
                        .clickable { onSelect(policy) }
                        .padding(vertical = 10.dp),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
            }
        }
    }
}

private fun defaultViewLabel(v: String?): String = when (v) {
    "bills" -> "Bills"
    "cards" -> "Cards"
    "payoff" -> "Payoff"
    "budget" -> "Budget"
    "calendar" -> "Calendar"
    "history" -> "History"
    else -> "Dashboard"
}

/**
 * A proud membership header at the top of Settings: avatar, identity, a
 * PRO/FREE chip, and both tenures (account "Member since" and, when
 * subscribed, "Pro member for …"). Replaces the faint one-line caption that
 * was buried inside the Account group.
 */
@Composable
private fun MembershipCard(vm: AppViewModel, user: User, entitlement: Entitlement) {
    val isPro = entitlement.pro
    var showPaywall by remember { mutableStateOf(false) }
    CtCard(padding = 0) {
        Column {
            Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(46.dp).clip(CircleShape)
                        .background(if (isPro) Ct.colors.yellowBg else Ct.colors.accentBg),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(initialsFor(user),
                        color = if (isPro) Ct.colors.yellow else Ct.colors.accent,
                        fontSize = 17.sp, fontWeight = FontWeight.Bold)
                }
                Column(Modifier.weight(1f).padding(start = 12.dp)) {
                    Text("SIGNED IN AS", color = Ct.colors.muted, fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold)
                    Text(user.name?.takeIf { it.isNotBlank() } ?: user.email,
                        color = Ct.colors.text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold,
                        maxLines = 1)
                    if (!user.name.isNullOrBlank()) {
                        Text(user.email, color = Ct.colors.muted, fontSize = 13.sp, maxLines = 1)
                    }
                }
                PlanChip(isPro)
            }
            user.createdAt?.let {
                HorizontalDivider(color = Ct.colors.border)
                TenureRow("Member since", monthYear(it.toLong()), Ct.colors.accent)
            }
            HorizontalDivider(color = Ct.colors.border)
            if (isPro) {
                // Tap → manage subscription.
                TenureRow("Pro member",
                    entitlement.proSince?.let { "for " + humanDuration(it) } ?: "Active",
                    Ct.colors.yellow, onClick = { showPaywall = true })
            } else {
                // Tap → paywall to upgrade.
                TenureRow("Upgrade to FiHaven Pro", "", Ct.colors.accent,
                    labelColor = Ct.colors.accent, onClick = { showPaywall = true })
            }
        }
    }
    if (showPaywall) PaywallDialog(vm) { showPaywall = false }
}

/** Gold "PRO" pill when subscribed, otherwise a muted "FREE" pill. */
@Composable
private fun PlanChip(isPro: Boolean) {
    Box(
        Modifier
            .clip(RoundedCornerShape(50))
            .background(if (isPro) Ct.colors.yellowBg else Ct.colors.surface2)
            .border(1.dp, if (isPro) Ct.colors.yellow.copy(alpha = 0.35f) else Ct.colors.border,
                RoundedCornerShape(50))
            .padding(horizontal = 10.dp, vertical = 5.dp)
    ) {
        Text(if (isPro) "PRO" else "FREE",
            color = if (isPro) Ct.colors.yellow else Ct.colors.muted,
            fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

/**
 * One tenure line inside the card: tinted marker + label, value on the right.
 * Pass `onClick` to make it tappable (adds a chevron) — deep-links into the
 * Pro screen for manage/upgrade.
 */
@Composable
private fun TenureRow(
    label: String, value: String, tint: Color,
    labelColor: Color = Ct.colors.muted, onClick: (() -> Unit)? = null,
) {
    val base = Modifier.fillMaxWidth()
    val mod = (if (onClick != null) base.clickable(onClick = onClick) else base).padding(16.dp)
    Row(mod, verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(tint))
        Text(label, color = labelColor, fontSize = 14.sp,
            fontWeight = if (labelColor == Ct.colors.muted) FontWeight.Normal else FontWeight.SemiBold,
            modifier = Modifier.padding(start = 10.dp).weight(1f))
        if (value.isNotEmpty()) {
            Text(value, color = Ct.colors.text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        }
        if (onClick != null) {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null,
                tint = Ct.colors.muted, modifier = Modifier.padding(start = 4.dp).size(18.dp))
        }
    }
}

/** Up to two initials, from the name when set, else the email handle. */
private fun initialsFor(user: User): String {
    val src = user.name?.takeIf { it.isNotBlank() } ?: user.email
    val letters = src.split(Regex("[\\s.@]+")).filter { it.isNotEmpty() }
        .take(2).mapNotNull { it.firstOrNull() }.joinToString("").uppercase()
    return letters.ifEmpty { "?" }
}

private fun monthYear(ms: Long): String {
    val d = java.time.Instant.ofEpochMilli(ms).atZone(java.time.ZoneId.systemDefault())
    return d.month.getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.US) + " " + d.year
}

/** The longest non-zero unit since `ms`: "3 years" / "5 months" / "12 days". */
private fun humanDuration(ms: Long): String {
    val days = ((System.currentTimeMillis() - ms) / 86_400_000L).toInt()
    return when {
        days < 1 -> "today"
        days >= 365 -> (days / 365).let { "$it year${if (it == 1) "" else "s"}" }
        days >= 30 -> (days / 30).let { "$it month${if (it == 1) "" else "s"}" }
        else -> "$days day${if (days == 1) "" else "s"}"
    }
}

@Composable
private fun CurrencyDialog(vm: AppViewModel, current: String, onDone: () -> Unit) {
    val options = listOf(
        "USD" to "US Dollar ($)", "CAD" to "Canadian Dollar ($)", "AUD" to "Australian Dollar ($)",
        "GBP" to "British Pound (£)", "EUR" to "Euro (€)", "JPY" to "Japanese Yen (¥)",
        "INR" to "Indian Rupee (₹)", "CHF" to "Swiss Franc", "MXN" to "Mexican Peso ($)",
        "BRL" to "Brazilian Real (R$)",
    )
    FormDialog("Currency", saveEnabled = false, onSave = {}, onDismiss = onDone) {
        Text("How amounts are shown across FiHaven.", color = Ct.colors.muted, fontSize = 13.sp)
        options.forEach { (code, label) ->
            Text(
                "$code — $label",
                color = if (code == current) Ct.colors.accent else Ct.colors.text, fontSize = 16.sp,
                modifier = Modifier.fillMaxWidth().clickable { vm.setCurrency(code); onDone() }.padding(vertical = 11.dp),
            )
        }
    }
}

@Composable
private fun DefaultViewDialog(vm: AppViewModel, current: String, onDone: () -> Unit) {
    val options = listOf(
        "dashboard" to "Dashboard", "bills" to "Bills", "cards" to "Cards", "payoff" to "Payoff",
    )
    FormDialog("Default view", saveEnabled = false, onSave = {}, onDismiss = onDone) {
        Text("Which screen the app opens to.", color = Ct.colors.muted, fontSize = 13.sp)
        options.forEach { (value, label) ->
            Text(
                label,
                color = if (value == current) Ct.colors.accent else Ct.colors.text, fontSize = 16.sp,
                modifier = Modifier.fillMaxWidth().clickable { vm.setLandingView(value); onDone() }.padding(vertical = 12.dp),
            )
        }
    }
}

@Composable
private fun BioLockDialog(
    vm: AppViewModel,
    activity: FragmentActivity?,
    current: Int,
    onDone: () -> Unit,
) {
    var customMinutes by remember(current) {
        mutableIntStateOf(if (current > 0 && current !in BioLockDelay.PRESET_MINUTES) current else 5)
    }
    val options = listOf(
        BioLockDelay.NEVER to BioLockDelay.label(BioLockDelay.NEVER),
        BioLockDelay.IMMEDIATELY to BioLockDelay.label(BioLockDelay.IMMEDIATELY),
    ) + BioLockDelay.PRESET_MINUTES.map { it to BioLockDelay.label(it) }

    fun apply(minutes: Int) {
        val enabling = minutes >= 0 && current < 0
        if (enabling && activity != null) {
            BiometricAuth.authenticate(activity, "Enable app lock", "Confirm it's you") { ok ->
                if (ok) {
                    vm.setLockAfterMinutes(minutes)
                    onDone()
                }
            }
        } else {
            vm.setLockAfterMinutes(minutes)
            onDone()
        }
    }

    FormDialog("Require unlock after", saveEnabled = false, onSave = {}, onDismiss = onDone) {
        Text(
            "Choose when FiHaven asks for your fingerprint, face, or device passcode after you leave the app.",
            color = Ct.colors.muted, fontSize = 13.sp,
        )
        options.forEach { (value, label) ->
            Text(
                label,
                color = if (value == current) Ct.colors.accent else Ct.colors.text,
                fontSize = 16.sp,
                modifier = Modifier.fillMaxWidth().clickable { apply(value) }.padding(vertical = 12.dp),
            )
        }
        Row(
            Modifier.fillMaxWidth().padding(top = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Custom:", color = Ct.colors.text, fontSize = 16.sp, modifier = Modifier.weight(1f))
            TextButton(onClick = { if (customMinutes > 1) customMinutes-- }) { Text("−", color = Ct.colors.accent) }
            Text("$customMinutes min", color = Ct.colors.text, fontSize = 15.sp, fontFamily = PlexMono)
            TextButton(onClick = { if (customMinutes < 60) customMinutes++ }) { Text("+", color = Ct.colors.accent) }
            TextButton(onClick = { apply(customMinutes) }) { Text("Set", color = Ct.colors.accent) }
        }
    }
}

private fun hourLabel(h: Int): String {
    val hr = h.coerceIn(0, 23)
    val ampm = if (hr < 12) "AM" else "PM"
    val h12 = if (hr % 12 == 0) 12 else hr % 12
    return "$h12:00 $ampm"
}

@Composable
private fun AutopayHourDialog(vm: AppViewModel, current: Int, onDone: () -> Unit) {
    FormDialog("Auto-mark time", saveEnabled = false, onSave = {}, onDismiss = onDone) {
        Text("The hour (your time zone) the server records autopay items as paid on their due date.",
            color = Ct.colors.muted, fontSize = 13.sp)
        (0..23).forEach { h ->
            Text(hourLabel(h),
                color = if (h == current) Ct.colors.accent else Ct.colors.text, fontSize = 16.sp,
                modifier = Modifier.fillMaxWidth().clickable { vm.setAutopayMarkHour(h); onDone() }
                    .padding(vertical = 10.dp))
        }
    }
}

private val LEAD_DAY_CHOICES = listOf(0, 1, 2, 3, 5, 7, 10, 14)

private fun leadLabel(d: Int): String = when (d) {
    0 -> "On the due day"
    1 -> "1 day before"
    else -> "$d days before"
}

@Composable
private fun LeadDaysDialog(vm: AppViewModel, current: Int, onDone: () -> Unit) {
    FormDialog("Remind me", saveEnabled = false, onSave = {}, onDismiss = onDone) {
        Text("How far ahead of a bill's due date to remind you.",
            color = Ct.colors.muted, fontSize = 13.sp)
        LEAD_DAY_CHOICES.forEach { d ->
            Text(leadLabel(d),
                color = if (d == current) Ct.colors.accent else Ct.colors.text, fontSize = 16.sp,
                modifier = Modifier.fillMaxWidth().clickable { vm.setReminderLeadDays(d); onDone() }
                    .padding(vertical = 10.dp))
        }
    }
}

@Composable
private fun NotifyHourDialog(vm: AppViewModel, current: Int, onDone: () -> Unit) {
    FormDialog("Send at", saveEnabled = false, onSave = {}, onDismiss = onDone) {
        Text("The local hour reminders, the weekly digest, and the monthly summary are sent.",
            color = Ct.colors.muted, fontSize = 13.sp)
        (0..23).forEach { h ->
            Text(hourLabel(h),
                color = if (h == current) Ct.colors.accent else Ct.colors.text, fontSize = 16.sp,
                modifier = Modifier.fillMaxWidth().clickable { vm.setNotifyHour(h); onDone() }
                    .padding(vertical = 10.dp))
        }
    }
}

@Composable
private fun DashboardLayoutDialog(vm: AppViewModel, settings: JsonObject, onDone: () -> Unit) {
    var layout by remember { mutableStateOf(settings.dashboardLayout) }
    val initialEnabled = DashboardWidgets.enabled(settings)
    var order by remember { mutableStateOf(initialEnabled + DashboardWidgets.allIds.filter { it !in initialEnabled }) }
    var enabled by remember { mutableStateOf(initialEnabled.toSet()) }

    fun persist() {
        vm.setDashboardLayout(layout)
        vm.setDashboardWidgets(order.filter { it in enabled })
    }

    FormDialog("Dashboard layout", saveEnabled = false, onSave = {}, onDismiss = onDone) {
        Text("Classic is a fixed layout. Widgets lets you choose which cards appear and reorder them.",
            color = Ct.colors.muted, fontSize = 13.sp)
        listOf("classic" to "Classic — fixed", "widgets" to "Widgets — customize").forEach { (value, label) ->
            Row(Modifier.fillMaxWidth().clickable { layout = value; persist() }.padding(vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically) {
                Text(if (layout == value) "●" else "○",
                    color = if (layout == value) Ct.colors.accent else Ct.colors.muted,
                    fontSize = 16.sp, modifier = Modifier.padding(end = 10.dp))
                Text(label, color = Ct.colors.text, fontSize = 16.sp)
            }
        }
        if (layout == "widgets") {
            HorizontalDivider(color = Ct.colors.border)
            Text("WIDGETS — TOGGLE AND REORDER", color = Ct.colors.muted, fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(vertical = 8.dp))
            order.forEachIndexed { i, id ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = id in enabled, onCheckedChange = { on ->
                        enabled = if (on) enabled + id else enabled - id; persist()
                    })
                    Text(DashboardWidgets.label(id), color = Ct.colors.text, fontSize = 15.sp, modifier = Modifier.weight(1f))
                    TextButton(onClick = {
                        order = order.toMutableList().also { it.add(i - 1, it.removeAt(i)) }; persist()
                    }, enabled = i > 0) { Text("↑") }
                    TextButton(onClick = {
                        order = order.toMutableList().also { it.add(i + 1, it.removeAt(i)) }; persist()
                    }, enabled = i < order.size - 1) { Text("↓") }
                }
            }
        }
    }
}

private fun periodModeLabel(mode: String?): String = when (mode) {
    "startDay" -> "Custom start day"
    "rolling" -> "Rolling window"
    else -> "Calendar month"
}

@Composable
private fun PeriodDialog(vm: AppViewModel, settings: JsonObject, onDone: () -> Unit) {
    var mode by remember { mutableStateOf(settings.periodMode ?: "calendar") }
    var startDay by remember { mutableStateOf((settings.periodStartDay ?: 1).toString()) }
    var length by remember { mutableStateOf((settings.periodLength ?: 35).toString()) }
    var anchor by remember { mutableStateOf(settings.periodAnchor ?: "") }
    val options = listOf(
        "calendar" to "Calendar month",
        "startDay" to "Custom start day",
        "rolling" to "Rolling window",
    )
    FormDialog("Budget period", saveEnabled = true, onSave = {
        vm.setPeriodMode(mode)
        if (mode == "startDay") vm.setPeriodStartDay(startDay.toIntOrNull() ?: 1)
        if (mode == "rolling") {
            vm.setPeriodLength(length.toIntOrNull() ?: 35)
            vm.setPeriodAnchor(anchor.ifBlank { null })
        }
        onDone()
    }, onDismiss = onDone) {
        Text("How a period is defined for paid/owed tracking. A custom start day groups early-next-month bills into the period you'd plan for; a rolling window tracks a fixed number of days.",
            color = Ct.colors.muted, fontSize = 13.sp)
        options.forEach { (value, label) ->
            Row(Modifier.fillMaxWidth().clickable { mode = value }.padding(vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically) {
                Text(if (mode == value) "●" else "○", color = if (mode == value) Ct.colors.accent else Ct.colors.muted,
                    fontSize = 16.sp, modifier = Modifier.padding(end = 10.dp))
                Text(label, color = Ct.colors.text, fontSize = 16.sp)
            }
        }
        if (mode == "startDay") {
            OutlinedTextField(startDay, { startDay = it.filter(Char::isDigit).take(2) },
                label = { Text("Start day (1–28)") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth())
        }
        if (mode == "rolling") {
            OutlinedTextField(length, { length = it.filter(Char::isDigit).take(2) },
                label = { Text("Window length, days (7–90)") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth())
            OutlinedTextField(anchor, { anchor = it.filter { c -> c.isDigit() || c == '-' }.take(10) },
                label = { Text("Start on (YYYY-MM-DD, optional)") }, singleLine = true,
                placeholder = { Text("e.g. 2026-06-10") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun AppearanceDialog(controller: ThemeController, onDone: () -> Unit) {
    FormDialog("Appearance", saveEnabled = false, onSave = {}, onDismiss = onDone) {
        ThemePref.entries.forEach { p ->
            Text(
                p.label, color = Ct.colors.text, fontSize = 16.sp,
                modifier = Modifier.fillMaxWidth()
                    .clickable { controller.set(p); onDone() }
                    .padding(vertical = 12.dp),
            )
        }
    }
}

// ── shared row pieces ────────────────────────────────────────────
@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Column {
        Text(title, color = Ct.colors.muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(bottom = 8.dp))
        CtCard(padding = 0) { Column { content() } }
    }
}

@Composable
private fun KeyValueRow(label: String, value: String, valueColor: androidx.compose.ui.graphics.Color = Ct.colors.muted) {
    Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = Ct.colors.text, fontSize = 15.sp, modifier = Modifier.weight(1f))
        Text(value, color = valueColor, fontSize = 14.sp)
    }
}

private fun groupTitle(group: String): String = when (group) {
    "account" -> "Account"
    "security" -> "Security"
    "preferences" -> "Preferences"
    "notifications" -> "Notifications"
    "family" -> "Family"
    "budgetlens" -> "Budget lens"
    "automation" -> "Automation"
    "bank" -> "Bank"
    "data" -> "Data"
    "about" -> "Help & about"
    "developer" -> "Developer"
    else -> "Settings"
}

/** Dev-only: simulate each Pro entitlement state without a purchase. */
@Composable
private fun DevEntitlementRow(vm: AppViewModel) {
    var sel by remember { mutableStateOf(vm.devEntitlementOverride) }
    val options = listOf(
        "off" to "Off — use real",
        "free" to "Free",
        "active" to "Pro — active",
        "expired" to "Pro — expired",
        "grace" to "Pro — grace period",
        "canceled" to "Canceled — active until expiry",
    )
    Column {
        options.forEachIndexed { i, (value, label) ->
            if (i > 0) HorizontalDivider(color = Ct.colors.border)
            Row(
                Modifier.fillMaxWidth().clickable { sel = value; vm.devEntitlementOverride = value }.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(if (sel == value) "●" else "○",
                    color = if (sel == value) Ct.colors.accent else Ct.colors.muted,
                    fontSize = 16.sp, modifier = Modifier.padding(end = 10.dp))
                Text(label, color = Ct.colors.text, fontSize = 16.sp)
            }
        }
        Text(
            "Simulates a Pro state for testing. Local to this device; never changes your real subscription. Debug builds only.",
            color = Ct.colors.muted, fontSize = 12.sp,
            modifier = Modifier.padding(16.dp),
        )
    }
}

/** A landing row that drills into a settings group. */
@Composable
private fun GroupRow(label: String, subtitle: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(label, color = Ct.colors.text, fontSize = 16.sp)
            Text(subtitle, color = Ct.colors.muted, fontSize = 12.5.sp)
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = Ct.colors.muted)
    }
}

@Composable
private fun NavRow(label: String, value: String?, valueColor: androidx.compose.ui.graphics.Color = Ct.colors.muted, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = Ct.colors.text, fontSize = 15.sp, modifier = Modifier.weight(1f))
        if (value != null) Text(value, color = valueColor, fontSize = 14.sp)
    }
}

@Composable
private fun SwitchRow(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = Ct.colors.text, fontSize = 15.sp, modifier = Modifier.weight(1f))
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = androidx.compose.ui.graphics.Color.White,
                checkedTrackColor = Ct.colors.accent,
            ),
        )
    }
}

@Composable
private fun ExportRow(vm: AppViewModel) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    Section("DATA") {
        NavRow("Export data", null) {
            scope.launch {
                runCatching { vm.api.exportData() }.getOrNull()?.let { json ->
                    val intent = Intent(Intent.ACTION_SEND).apply {
                        type = "application/json"
                        putExtra(Intent.EXTRA_TEXT, json)
                        putExtra(Intent.EXTRA_TITLE, "fihaven-account-data.json")
                    }
                    ctx.startActivity(Intent.createChooser(intent, "Export FiHaven data"))
                }
            }
        }
    }
}

// ── dialogs ──────────────────────────────────────────────────────
@Composable
private fun PasskeysDialog(vm: AppViewModel, passkeys: List<PasskeyInfo>, onDone: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf("Android device") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var deleteId by remember { mutableStateOf<Int?>(null) }
    var deletePwd by remember { mutableStateOf("") }
    var deleteError by remember { mutableStateOf<String?>(null) }

    if (deleteId != null) {
        FormDialog(
            title = "Remove passkey",
            saveEnabled = deletePwd.isNotEmpty() && !busy,
            saveLabel = "Remove",
            onSave = {
                scope.launch {
                    busy = true
                    deleteError = null
                    try {
                        vm.api.deletePasskey(deleteId!!, deletePwd)
                        deleteId = null
                        deletePwd = ""
                        onDone()
                    } catch (e: ApiError) {
                        deleteError = e.userMessage
                    } catch (e: Exception) {
                        deleteError = e.message
                    } finally {
                        busy = false
                    }
                }
            },
            onDismiss = { deleteId = null; deletePwd = ""; deleteError = null },
        ) {
            Text("Confirm your password to remove this passkey.", color = Ct.colors.muted, fontSize = 13.sp)
            PasswordField("Current password", deletePwd) { deletePwd = it }
            deleteError?.let { Text(it, color = Ct.colors.red, fontSize = 13.sp) }
        }
        return
    }

    FormDialog(
        title = "Passkeys",
        saveEnabled = name.isNotBlank() && !busy,
        saveLabel = "Add passkey",
        onSave = {
            scope.launch {
                busy = true
                error = null
                try {
                    val start = vm.api.passkeyRegisterStart()
                    val responseJson = createPasskeyCredential(context, start.options.toString())
                    vm.api.passkeyRegisterFinish(start.challengeId, responseJson, name.trim())
                    onDone()
                } catch (_: CreateCredentialCancellationException) {
                    // User dismissed the system sheet.
                } catch (e: ApiError) {
                    error = e.userMessage
                } catch (e: Exception) {
                    error = e.message ?: "Couldn't add passkey."
                } finally {
                    busy = false
                }
            }
        },
        onDismiss = onDone,
    ) {
        Text(
            "Sign in with your fingerprint, face, or screen lock — no password needed.",
            color = Ct.colors.muted, fontSize = 13.sp,
        )
        if (passkeys.isNotEmpty()) {
            Text("Registered on this account", color = Ct.colors.muted, fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
            passkeys.forEach { pk ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(pk.name ?: "Passkey", color = Ct.colors.text, fontSize = 15.sp,
                        modifier = Modifier.weight(1f))
                    TextButton(onClick = { deleteId = pk.id }) {
                        Text("Remove", color = Ct.colors.red)
                    }
                }
            }
        }
        OutlinedTextField(
            value = name, onValueChange = { name = it },
            label = { Text("Label for this device") }, singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
        )
        error?.let { Text(it, color = Ct.colors.red, fontSize = 13.sp) }
    }
}

@Composable
private fun ChangeNameDialog(vm: AppViewModel, user: User, onDone: () -> Unit) {
    var name by remember { mutableStateOf(user.name ?: "") }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    FormDialog("Name", onSave = {
        scope.launch {
            try { val n = vm.api.changeName(name.trim()); vm.applyUser(User(user.email, n)); onDone() }
            catch (e: ApiError) { error = e.userMessage } catch (e: Exception) { error = e.message }
        }
    }, onDismiss = onDone) {
        OutlinedTextField(name, { name = it }, label = { Text("Your name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        error?.let { Text(it, color = Ct.colors.red, fontSize = 13.sp) }
    }
}

@Composable
private fun ChangeEmailDialog(vm: AppViewModel, user: User, onDone: () -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    FormDialog("Change email", saveEnabled = email.contains("@") && password.isNotEmpty(), onSave = {
        scope.launch {
            try {
                val result = vm.api.changeEmail(password, email)
                val newEmail = result.email ?: email
                vm.applyEmailChange(newEmail, result.verificationRequired)
                onDone()
            }
            catch (ex: ApiError) { error = ex.userMessage } catch (ex: Exception) { error = ex.message }
        }
    }, onDismiss = onDone) {
        Text("You'll need to verify the new address before it takes effect.", color = Ct.colors.muted, fontSize = 13.sp)
        OutlinedTextField(email, { email = it }, label = { Text("New email") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth())
        PasswordField("Current password", password) { password = it }
        error?.let { Text(it, color = Ct.colors.red, fontSize = 13.sp) }
    }
}

@Composable
private fun ChangePasswordDialog(vm: AppViewModel, onDone: () -> Unit) {
    var current by remember { mutableStateOf("") }
    var next by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    FormDialog("Change password", saveEnabled = current.isNotEmpty() && next.length >= 10, onSave = {
        scope.launch {
            try { vm.api.changePassword(current, next); onDone() }
            catch (e: ApiError) { error = e.userMessage } catch (e: Exception) { error = e.message }
        }
    }, onDismiss = onDone) {
        PasswordField("Current password", current) { current = it }
        PasswordField("New password (10+ chars)", next) { next = it }
        error?.let { Text(it, color = Ct.colors.red, fontSize = 13.sp) }
    }
}

private const val DELETE_CONFIRM_PHRASE = "DELETE ACCOUNT DATA"

@Composable
private fun DeleteAccountDialog(vm: AppViewModel, onDone: () -> Unit) {
    var password by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var confirmText by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val canDelete = password.isNotEmpty() && confirmText.trim() == DELETE_CONFIRM_PHRASE
    FormDialog("Delete account", saveEnabled = canDelete, onSave = {
        vm.deleteAccount(password, code.trim()) { error = it }
    }, onDismiss = onDone) {
        Text("This permanently deletes your account and all data. This can't be undone.",
            color = Ct.colors.muted, fontSize = 13.sp)
        PasswordField("Password", password) { password = it }
        OutlinedTextField(code, { code = it }, label = { Text("Authenticator code (if 2FA is on)") },
            singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth())
        OutlinedTextField(confirmText, { confirmText = it },
            label = { Text("Type $DELETE_CONFIRM_PHRASE to confirm") },
            singleLine = true, modifier = Modifier.fillMaxWidth())
        error?.let { Text(it, color = Ct.colors.red, fontSize = 13.sp) }
    }
}

@Composable
private fun ClearDataDialog(vm: AppViewModel, onDone: () -> Unit) {
    val options = listOf(
        "bills" to "Bills (and their payment history)",
        "cards" to "Cards & loans (and their payment history)",
        "payments" to "All payment history",
        "bank" to "Connected bank data",
    )
    var groups by remember { mutableStateOf(setOf<String>()) }
    var password by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val canClear = password.isNotEmpty() && groups.isNotEmpty()
    FormDialog("Clear data", saveEnabled = canClear, onSave = {
        vm.clearData(password, code.trim(), groups.toList(), onError = { error = it }, onDone = onDone)
    }, onDismiss = onDone) {
        Text("Erase chosen data while keeping your account and settings. This can't be undone.",
            color = Ct.colors.muted, fontSize = 13.sp)
        options.forEach { (id, label) ->
            val checked = id in groups
            Row(
                Modifier.fillMaxWidth().clickable {
                    groups = if (checked) groups - id else groups + id
                },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Checkbox(checked = checked, onCheckedChange = { on ->
                    groups = if (on) groups + id else groups - id
                })
                Text(label, color = Ct.colors.text, fontSize = 14.sp)
            }
        }
        PasswordField("Password", password) { password = it }
        OutlinedTextField(code, { code = it }, label = { Text("Authenticator code (if 2FA is on)") },
            singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth())
        error?.let { Text(it, color = Ct.colors.red, fontSize = 13.sp) }
    }
}

@Composable
private fun TotpSetupDialog(vm: AppViewModel, onDone: () -> Unit) {
    var step by remember { mutableIntStateOf(0) } // 0 password, 1 scan, 2 done
    var password by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var qr by remember { mutableStateOf<androidx.compose.ui.graphics.ImageBitmap?>(null) }
    var secret by remember { mutableStateOf("") }
    var codes by remember { mutableStateOf<List<String>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    FormDialog(
        title = "Authenticator app",
        saveEnabled = when (step) { 0 -> password.isNotEmpty(); 1 -> code.length >= 6; else -> true },
        onSave = {
            when (step) {
                0 -> scope.launch {
                    try { val s = vm.api.totpSetup(password); qr = decodeDataUrl(s.qrDataUrl); secret = s.secret; step = 1; error = null }
                    catch (e: ApiError) { error = e.userMessage } catch (e: Exception) { error = e.message }
                }
                1 -> scope.launch {
                    try { codes = vm.api.totpConfirm(code); step = 2; error = null }
                    catch (e: ApiError) { error = e.userMessage } catch (e: Exception) { error = e.message }
                }
                else -> onDone()
            }
        },
        onDismiss = onDone,
    ) {
        when (step) {
            0 -> { Text("Confirm your password.", color = Ct.colors.muted, fontSize = 13.sp); PasswordField("Password", password) { password = it } }
            1 -> {
                qr?.let { Image(it, "QR", modifier = Modifier.size(200.dp)) }
                Text("Secret: $secret", color = Ct.colors.muted, fontSize = 13.sp, fontFamily = PlexMono)
                OutlinedTextField(code, { code = it }, label = { Text("6-digit code") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.fillMaxWidth())
            }
            else -> {
                Text("Save these backup codes:", color = Ct.colors.text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                codes.forEach { Text(it, color = Ct.colors.text, fontFamily = PlexMono, fontSize = 15.sp) }
            }
        }
        error?.let { Text(it, color = Ct.colors.red, fontSize = 13.sp) }
    }
}

@Composable
private fun TotpDisableDialog(vm: AppViewModel, onDone: () -> Unit) {
    var password by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    FormDialog("Turn off authenticator", saveEnabled = password.isNotEmpty() && code.length >= 6, onSave = {
        scope.launch {
            try { vm.api.totpDisable(password, code); onDone() }
            catch (e: ApiError) { error = e.userMessage } catch (e: Exception) { error = e.message }
        }
    }, onDismiss = onDone) {
        PasswordField("Password", password) { password = it }
        OutlinedTextField(code, { code = it }, label = { Text("Current 6-digit code") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.fillMaxWidth())
        error?.let { Text(it, color = Ct.colors.red, fontSize = 13.sp) }
    }
}

@Composable
private fun EmailEnableDialog(vm: AppViewModel, email: String, onDone: () -> Unit) {
    var step by remember { mutableIntStateOf(0) }
    var password by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var challengeId by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    FormDialog("Email codes", saveEnabled = if (step == 0) password.isNotEmpty() else code.length >= 6, onSave = {
        when (step) {
            0 -> scope.launch {
                try { challengeId = vm.api.emailMfaEnable(password); step = 1; error = null }
                catch (e: ApiError) { error = e.userMessage } catch (e: Exception) { error = e.message }
            }
            else -> scope.launch {
                try { vm.api.emailMfaConfirm(challengeId, code); onDone() }
                catch (e: ApiError) { error = e.userMessage } catch (e: Exception) { error = e.message }
            }
        }
    }, onDismiss = onDone) {
        if (step == 0) { Text("Confirm your password.", color = Ct.colors.muted, fontSize = 13.sp); PasswordField("Password", password) { password = it } }
        else {
            Text("Enter the code emailed to $email.", color = Ct.colors.muted, fontSize = 13.sp)
            OutlinedTextField(code, { code = it }, label = { Text("6-digit code") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.fillMaxWidth())
        }
        error?.let { Text(it, color = Ct.colors.red, fontSize = 13.sp) }
    }
}

@Composable
private fun EmailDisableDialog(vm: AppViewModel, onDone: () -> Unit) {
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    FormDialog("Turn off email codes", saveEnabled = password.isNotEmpty(), onSave = {
        scope.launch {
            try { vm.api.emailMfaDisable(password); onDone() }
            catch (e: ApiError) { error = e.userMessage } catch (e: Exception) { error = e.message }
        }
    }, onDismiss = onDone) {
        PasswordField("Password", password) { password = it }
        error?.let { Text(it, color = Ct.colors.red, fontSize = 13.sp) }
    }
}

@Composable
private fun BackupCodesDialog(vm: AppViewModel, onDone: () -> Unit) {
    var password by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var codes by remember { mutableStateOf<List<String>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    FormDialog("Backup codes", saveEnabled = codes.isEmpty() && password.isNotEmpty() && code.length >= 6, onSave = {
        scope.launch {
            try { codes = vm.api.regenerateBackupCodes(password, code); error = null }
            catch (e: ApiError) { error = e.userMessage } catch (e: Exception) { error = e.message }
        }
    }, onDismiss = onDone) {
        if (codes.isEmpty()) {
            PasswordField("Password", password) { password = it }
            OutlinedTextField(code, { code = it }, label = { Text("Current 6-digit code") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.fillMaxWidth())
        } else {
            Text("New backup codes:", color = Ct.colors.text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            codes.forEach { Text(it, color = Ct.colors.text, fontFamily = PlexMono, fontSize = 15.sp) }
        }
        error?.let { Text(it, color = Ct.colors.red, fontSize = 13.sp) }
    }
}

@Composable
private fun TimezoneDialog(vm: AppViewModel, onDone: () -> Unit) {
    val zones = listOf("auto", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
        "America/Phoenix", "Europe/London", "Europe/Paris", "Asia/Tokyo", "Australia/Sydney", "UTC")
    FormDialog("Time zone", saveEnabled = false, onSave = {}, onDismiss = onDone) {
        zones.forEach { z ->
            Text(if (z == "auto") "Auto (device)" else z.replace("_", " "),
                color = Ct.colors.text, fontSize = 16.sp,
                modifier = Modifier.fillMaxWidth().clickable {
                    vm.setTimezone(if (z == "auto") null else z); onDone()
                }.padding(vertical = 12.dp))
        }
    }
}

@Composable
private fun PasswordField(label: String, value: String, onChange: (String) -> Unit) {
    var show by remember { mutableStateOf(false) }
    OutlinedTextField(value, onChange, label = { Text(label) }, singleLine = true,
        visualTransformation = if (show) VisualTransformation.None else PasswordVisualTransformation(),
        trailingIcon = {
            IconButton(onClick = { show = !show }) {
                Icon(
                    if (show) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                    contentDescription = if (show) "Hide password" else "Show password",
                    tint = Ct.colors.muted,
                )
            }
        },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth())
}

private fun decodeDataUrl(s: String): androidx.compose.ui.graphics.ImageBitmap? {
    val comma = s.indexOf(','); if (comma < 0) return null
    return runCatching {
        val bytes = Base64.decode(s.substring(comma + 1), Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size).asImageBitmap()
    }.getOrNull()
}

private val BUDGET_LENS_MODES = listOf(
    "off" to "Off",
    "50-30-20" to "50 / 30 / 20",
    "80-20" to "80 / 20",
    "60-20-20" to "60 / 20 / 20",
    "70-20-10" to "70 / 20 / 10",
    "custom" to "Custom split",
    "obligations-first" to "Obligations first",
    "debt-focus" to "Debt focus",
    "envelope" to "Envelope lite (Pro)",
)

@Composable
private fun BudgetLensSection(vm: AppViewModel, settings: JsonObject) {
    var mode by remember(settings) { mutableStateOf(BudgetRules.mode(settings)) }
    var needs by remember(settings) { mutableStateOf(settings.budgetRuleSplits.needs.toString()) }
    var wants by remember(settings) { mutableStateOf(settings.budgetRuleSplits.wants.toString()) }
    var save by remember(settings) { mutableStateOf(settings.budgetRuleSplits.save.toString()) }
    var debtExtra by remember(settings) { mutableStateOf(settings.debtFocusExtra.takeIf { it > 0 }?.toString() ?: "") }
    var rollover by remember(settings) { mutableStateOf(settings.envelopeRollover) }
    val overrides = settings.budgetBucketOverrides

    Section("BUDGET LENS") {
        Text("Optional lens on the Budget tab — compare income to bills, spending, and goals.",
            color = Ct.colors.muted, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
        BUDGET_LENS_MODES.forEachIndexed { i, (value, label) ->
            if (i > 0) HorizontalDivider(color = Ct.colors.border)
            Row(
                Modifier.fillMaxWidth().clickable {
                    mode = value
                    vm.setBudgetRule(value)
                }.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(if (mode == value) "●" else "○",
                    color = if (mode == value) Ct.colors.accent else Ct.colors.muted,
                    fontSize = 16.sp, modifier = Modifier.padding(end = 10.dp))
                Text(label, color = Ct.colors.text, fontSize = 16.sp)
            }
        }
        if (mode == "custom") {
            HorizontalDivider(color = Ct.colors.border)
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Custom split (%)", color = Ct.colors.muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(needs, { needs = it.filter(Char::isDigit).take(3) },
                        label = { Text("Needs") }, singleLine = true, modifier = Modifier.weight(1f),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                    OutlinedTextField(wants, { wants = it.filter(Char::isDigit).take(3) },
                        label = { Text("Wants") }, singleLine = true, modifier = Modifier.weight(1f),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                    OutlinedTextField(save, { save = it.filter(Char::isDigit).take(3) },
                        label = { Text("Save") }, singleLine = true, modifier = Modifier.weight(1f),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                }
                TextButton(onClick = {
                    vm.setBudgetRuleSplits(
                        needs.toIntOrNull() ?: 50,
                        wants.toIntOrNull() ?: 30,
                        save.toIntOrNull() ?: 20,
                    )
                }) { Text("Save custom split", color = Ct.colors.accent) }
            }
        }
        if (mode == "debt-focus") {
            HorizontalDivider(color = Ct.colors.border)
            Column(Modifier.padding(16.dp)) {
                OutlinedTextField(debtExtra, {
                    debtExtra = it
                    vm.setDebtFocusExtra(it.toDoubleOrNull() ?: 0.0)
                }, label = { Text("Extra debt payment / month") }, prefix = { Text("$") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true,
                    modifier = Modifier.fillMaxWidth())
            }
        }
        if (mode == "envelope") {
            HorizontalDivider(color = Ct.colors.border)
            SwitchRow("Roll unused categories to next period", rollover) {
                rollover = it
                vm.setEnvelopeRollover(it)
            }
        }
    }
    Section("CATEGORY BUCKETS") {
        Text("Override which needs/wants/save bucket a bill or spending category counts toward in split lenses.",
            color = Ct.colors.muted, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
        Text("Bills", color = Ct.colors.muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
        CTConstants.categories.forEach { cat ->
            BucketOverrideRow("bills", cat, overrides.bills[cat], vm)
            HorizontalDivider(color = Ct.colors.border)
        }
        Text("Spending", color = Ct.colors.muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
        SPENDING_CATEGORIES.forEachIndexed { i, cat ->
            BucketOverrideRow("spending", cat, overrides.spending[cat], vm)
            if (i < SPENDING_CATEGORIES.lastIndex) HorizontalDivider(color = Ct.colors.border)
        }
    }
}

@Composable
private fun BucketOverrideRow(kind: String, category: String, current: String?, vm: AppViewModel) {
    val options = listOf(null to "Default") + BudgetRules.budgetBuckets.map { it to it.replaceFirstChar { c -> c.uppercase() } }
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(category, color = Ct.colors.text, fontSize = 15.sp, modifier = Modifier.weight(1f))
        options.forEach { (value, label) ->
            val selected = current == value || (value == null && current == null)
            Text(
                label,
                color = if (selected) Color.White else Ct.colors.text,
                fontSize = 11.sp,
                modifier = Modifier
                    .padding(start = 4.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(if (selected) Ct.colors.accent else Ct.colors.bg)
                    .border(1.dp, if (selected) Ct.colors.accent else Ct.colors.border, RoundedCornerShape(6.dp))
                    .clickable { vm.setBudgetBucketOverride(kind, category, value) }
                    .padding(horizontal = 6.dp, vertical = 6.dp),
            )
        }
    }
}
