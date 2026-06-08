package com.danielhipskind.fihaven.ui

import com.danielhipskind.fihaven.ui.theme.PlexMono

import android.content.Intent
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.background
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
import androidx.compose.foundation.Image
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.danielhipskind.fihaven.AppViewModel
import com.danielhipskind.fihaven.core.model.billReminders
import com.danielhipskind.fihaven.core.model.currency
import com.danielhipskind.fihaven.core.model.landingView
import com.danielhipskind.fihaven.core.model.monthlySummary
import com.danielhipskind.fihaven.core.model.paidGoal
import com.danielhipskind.fihaven.core.model.timezoneSetting
import com.danielhipskind.fihaven.core.logic.PaidGoalPolicy
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
    val bioEnabled by vm.biometricEnabled.collectAsStateWithLifecycle()
    var dialog by remember { mutableStateOf<String?>(null) }
    var mfa by remember { mutableStateOf<MfaStatus?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    val current = vm.currentUser ?: user

    LaunchedEffect(reload) { mfa = runCatching { vm.api.mfaStatus() }.getOrNull() }
    val close: () -> Unit = { dialog = null; reload++ }

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        ScreenHeader("Settings", onBack = onBack)
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
                        SwitchRow("Require biometric unlock", bioEnabled) { want ->
                            if (want) {
                                BiometricAuth.authenticate(activity, "Enable biometric lock", "Confirm it's you") { ok ->
                                    if (ok) vm.setBiometricEnabled(true)
                                }
                            } else {
                                vm.setBiometricEnabled(false)
                            }
                        }
                    }
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("Time zone", data.settings.timezoneSetting ?: "Auto") { dialog = "timezone" }
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("Currency", data.settings.currency ?: "USD") { dialog = "currency" }
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("Default view", defaultViewLabel(data.settings.landingView)) { dialog = "defaultview" }
                    HorizontalDivider(color = Ct.colors.border)
                    NavRow("Mark fully paid at", paidGoalLabel(PaidGoalPolicy.from(data.settings.paidGoal))) { dialog = "paidgoal" }
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
        "paidgoal" -> PaidGoalDialog(vm, close)
        "currency" -> CurrencyDialog(vm, data.settings.currency ?: "USD", close)
        "defaultview" -> DefaultViewDialog(vm, data.settings.landingView ?: "dashboard", close)
        "appearance" -> AppearanceDialog(themeController) { dialog = null }
    }
}

private fun paidGoalLabel(policy: PaidGoalPolicy): String = when (policy) {
    PaidGoalPolicy.MINIMUM -> "Minimum"
    PaidGoalPolicy.RECOMMENDED -> "Recommended"
    PaidGoalPolicy.FULL -> "Full amount"
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
private fun PaidGoalDialog(vm: AppViewModel, onDone: () -> Unit) {
    val options = listOf(
        PaidGoalPolicy.MINIMUM to "The minimum payment",
        PaidGoalPolicy.RECOMMENDED to "The recommended amount (clears 0% promos in time)",
        PaidGoalPolicy.FULL to "The full balance / amount",
    )
    FormDialog("Mark fully paid at", saveEnabled = false, onSave = {}, onDismiss = onDone) {
        Text("How much you must pay before a bill or card counts as fully paid. Anything less shows as a partial payment. Bills always use their full amount.",
            color = Ct.colors.muted, fontSize = 13.sp)
        options.forEach { (policy, label) ->
            Text(label, color = Ct.colors.text, fontSize = 16.sp,
                modifier = Modifier.fillMaxWidth().clickable {
                    vm.setPaidGoal(policy); onDone()
                }.padding(vertical = 12.dp))
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
    OutlinedTextField(value, onChange, label = { Text(label) }, singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth())
}

private fun decodeDataUrl(s: String): androidx.compose.ui.graphics.ImageBitmap? {
    val comma = s.indexOf(','); if (comma < 0) return null
    return runCatching {
        val bytes = Base64.decode(s.substring(comma + 1), Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size).asImageBitmap()
    }.getOrNull()
}
