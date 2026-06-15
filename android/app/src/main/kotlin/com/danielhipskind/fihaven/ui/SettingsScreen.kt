package com.danielhipskind.fihaven.ui

import com.danielhipskind.fihaven.ui.theme.PlexMono

import android.content.Intent
import androidx.fragment.app.FragmentActivity
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.Image
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
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
import com.danielhipskind.fihaven.BuildConfig
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.danielhipskind.fihaven.AppViewModel
import com.danielhipskind.fihaven.BioLockDelay
import com.danielhipskind.fihaven.core.model.autopayMark
import com.danielhipskind.fihaven.core.model.autopayMarkHour
import com.danielhipskind.fihaven.core.model.billReminders
import com.danielhipskind.fihaven.core.model.currency
import com.danielhipskind.fihaven.core.model.hidePaidOnDashboard
import com.danielhipskind.fihaven.core.model.landingView
import com.danielhipskind.fihaven.core.model.monthlySummary
import com.danielhipskind.fihaven.core.model.paidGoal
import com.danielhipskind.fihaven.core.model.periodLength
import com.danielhipskind.fihaven.core.model.periodMode
import com.danielhipskind.fihaven.core.model.periodStartDay
import com.danielhipskind.fihaven.core.model.tabBar
import com.danielhipskind.fihaven.core.model.timezoneSetting
import com.danielhipskind.fihaven.core.logic.PaidGoalPolicy
import kotlinx.serialization.json.JsonObject
import com.danielhipskind.fihaven.core.net.ApiError
import com.danielhipskind.fihaven.core.net.MfaStatus
import com.danielhipskind.fihaven.core.net.User
import com.danielhipskind.fihaven.ui.theme.Ct
import com.danielhipskind.fihaven.ui.theme.LocalThemeController
import com.danielhipskind.fihaven.ui.theme.ThemeController
import com.danielhipskind.fihaven.ui.theme.ThemePref
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(vm: AppViewModel, user: User, padding: PaddingValues, onBack: (() -> Unit)? = null) {
    val data by vm.data.collectAsStateWithLifecycle()
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

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        ScreenHeader("Settings", onBack = onBack, branded = true)
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item {
                Section("ACCOUNT") {
                    KeyValueRow("Email", current.email)
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("Name", current.name?.takeIf { it.isNotBlank() } ?: "Add") { dialog = "name" }
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("Change email", null) { dialog = "email" }
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("Change password", null) { dialog = "password" }
                }
            }
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
            item {
                Section("NOTIFICATIONS") {
                    SwitchRow("Bill reminders", data.settings.billReminders) { vm.setBillReminders(it) }
                    HorizontalDivider(color = Ct.colors.border)
                    SwitchRow("Monthly summary", data.settings.monthlySummary) { vm.setMonthlySummary(it) }
                    Text(
                        "Optional emails to your verified address, sent in your time zone. Reminders 3 days before a bill is due; the summary on the 1st.",
                        color = Ct.colors.muted, fontSize = 12.sp,
                        modifier = Modifier.padding(top = 10.dp, start = 4.dp, end = 4.dp),
                    )
                }
            }
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
            item {
                Section("BANK") {
                    NavRow("Bank connections", null) { dialog = "bank" }
                }
            }
            item {
                Section("ABOUT") {
                    NavRow("Privacy Policy", null) { uriHandler.openUri("https://fihaven.app/privacy") }
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("Terms of Service", null) { uriHandler.openUri("https://fihaven.app/terms") }
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("Open-source licenses", null) { dialog = "licenses" }
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("License", "AGPL-3.0", Ct.colors.accent) {
                        uriHandler.openUri("https://github.com/Greigh/FiHaven/blob/main/LICENSE")
                    }
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("Source code", null) { uriHandler.openUri("https://github.com/Greigh/FiHaven") }
                    HorizontalDivider(color = Ct.colors.border)
                    KeyValueRow("Version", BuildConfig.VERSION_NAME)
                }
            }
            item {
                ExportRow(vm)
            }
            item {
                Button(onClick = { dialog = "delete" }, modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.redBg, contentColor = Ct.colors.red)) {
                    Text("Delete account")
                }
            }
            item {
                Button(onClick = { vm.logout() }, modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.surface2, contentColor = Ct.colors.red)) {
                    Text("Sign out")
                }
            }
        }
    }

    when (dialog) {
        "name" -> ChangeNameDialog(vm, current, close)
        "email" -> ChangeEmailDialog(vm, current, close)
        "password" -> ChangePasswordDialog(vm, close)
        "delete" -> DeleteAccountDialog(vm, close)
        "totpSetup" -> TotpSetupDialog(vm, close)
        "totpDisable" -> TotpDisableDialog(vm, close)
        "emailEnable" -> EmailEnableDialog(vm, current.email, close)
        "emailDisable" -> EmailDisableDialog(vm, close)
        "backup" -> BackupCodesDialog(vm, close)
        "timezone" -> TimezoneDialog(vm, close)
        "period" -> PeriodDialog(vm, data.settings, close)
        "autopayhour" -> AutopayHourDialog(vm, data.settings.autopayMarkHour, close)
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
        Text("FiHaven itself is licensed under AGPL-3.0.", color = Ct.colors.muted, fontSize = 12.sp)
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
    val options = listOf(
        "calendar" to "Calendar month",
        "startDay" to "Custom start day",
        "rolling" to "Rolling window",
    )
    FormDialog("Budget period", saveEnabled = true, onSave = {
        vm.setPeriodMode(mode)
        if (mode == "startDay") vm.setPeriodStartDay(startDay.toIntOrNull() ?: 1)
        if (mode == "rolling") vm.setPeriodLength(length.toIntOrNull() ?: 35)
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
            try { val e = vm.api.changeEmail(password, email) ?: email; vm.applyUser(User(e, user.name)); onDone() }
            catch (ex: ApiError) { error = ex.userMessage } catch (ex: Exception) { error = ex.message }
        }
    }, onDismiss = onDone) {
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

@Composable
private fun DeleteAccountDialog(vm: AppViewModel, onDone: () -> Unit) {
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    FormDialog("Delete account", saveEnabled = password.isNotEmpty(), onSave = {
        vm.deleteAccount(password) { error = it }
    }, onDismiss = onDone) {
        Text("This permanently deletes your account and all data. This can't be undone.",
            color = Ct.colors.muted, fontSize = 13.sp)
        PasswordField("Password", password) { password = it }
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
