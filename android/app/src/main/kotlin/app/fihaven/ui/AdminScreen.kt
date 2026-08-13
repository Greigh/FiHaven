package app.fihaven.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.fihaven.AppViewModel
import app.fihaven.core.net.AdminCardPreset
import app.fihaven.core.net.AdminPresetsPage
import app.fihaven.core.net.AdminPromo
import app.fihaven.core.net.AdminUser
import app.fihaven.core.net.AdminUsersPage
import app.fihaven.core.net.ApiError
import app.fihaven.ui.theme.Ct
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * The admin console — users, the rewards catalog, and promo codes. The native
 * counterpart of the web overlay.
 *
 * Reached from a Settings row that only appears for `user.isAdmin`. That row
 * is a convenience, not a lock: the server mounts every admin route behind
 * `requireAdmin`, so a non-admin who arrived here anyway would see nothing but
 * "You don't have access".
 */
@Composable
fun AdminScreen(vm: AppViewModel) {
    var tab by remember { mutableIntStateOf(0) }
    val titles = listOf("Users", "Rewards", "Promos")

    Column(Modifier.fillMaxSize()) {
        TabRow(selectedTabIndex = tab, containerColor = Ct.colors.bg, contentColor = Ct.colors.accent) {
            titles.forEachIndexed { i, title ->
                Tab(selected = tab == i, onClick = { tab = i }, text = { Text(title) })
            }
        }
        when (tab) {
            0 -> AdminUsersTab(vm)
            1 -> AdminPresetsTab(vm)
            2 -> AdminPromosTab(vm)
        }
    }
}

/* ── shared bits ─────────────────────────────────────────────── */

/** Renders the server's error codes with the same words the web console uses. */
internal fun adminErrorText(e: Throwable): String = when {
    e is ApiError && e.serverCode == "forbidden" -> "You don't have access to the admin console."
    e is ApiError && e.serverCode == "cannot-demote-self" -> "You can't remove your own admin role."
    e is ApiError && e.serverCode == "cannot-suspend-self" -> "You can't suspend your own account."
    e is ApiError && e.serverCode == "cannot-delete-self" -> "You can't delete your own account here."
    e is ApiError && e.serverCode == "confirm-email-mismatch" -> "That email doesn't match the account."
    e is ApiError && e.serverCode == "bad-plan" -> "That plan isn't one this server offers."
    e is ApiError && e.serverCode == "bad-days" -> "Enter a number of days greater than zero."
    e is ApiError && e.serverCode == "id-taken" -> "A preset with that id already exists."
    e is ApiError && e.serverCode == "not-found" -> "That record no longer exists."
    e is ApiError -> e.userMessage
    else -> e.message ?: "Something went wrong."
}

private val dayFormat = SimpleDateFormat("MMM d, yyyy", Locale.getDefault())

internal fun adminDate(ms: Double?): String =
    if (ms == null || ms <= 0) "Unknown" else dayFormat.format(Date(ms.toLong()))

/** "7d ago" while that's useful, an absolute date after. Mirrors the web console. */
internal fun adminRelative(ms: Double?, fallback: String): String {
    if (ms == null || ms <= 0) return fallback
    val diff = System.currentTimeMillis() - ms.toLong()
    if (diff < 0) return dayFormat.format(Date(ms.toLong()))
    val mins = diff / 60_000
    if (mins < 1) return "Just now"
    if (mins < 60) return "${mins}m ago"
    val hrs = mins / 60
    if (hrs < 24) return "${hrs}h ago"
    val days = hrs / 24
    if (days == 1L) return "Yesterday"
    if (days < 14) return "${days}d ago"
    return dayFormat.format(Date(ms.toLong()))
}

@Composable
private fun AdminPill(text: String, tint: androidx.compose.ui.graphics.Color = Ct.colors.muted) {
    Surface(shape = RoundedCornerShape(999.dp), color = tint.copy(alpha = 0.14f)) {
        Text(
            text, color = tint, fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
        )
    }
}

/** Loading / error / empty, so every tab behaves the same way. */
@Composable
private fun AdminState(loading: Boolean, error: String?, empty: String?, onRetry: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        when {
            loading -> CircularProgressIndicator(color = Ct.colors.accent)
            error != null -> {
                Text(error, color = Ct.colors.muted, fontSize = 14.sp)
                TextButton(onClick = onRetry) { Text("Try again", color = Ct.colors.accent) }
            }
            empty != null -> Text(empty, color = Ct.colors.muted, fontSize = 14.sp)
        }
    }
}

/* ── Users ───────────────────────────────────────────────────── */

@Composable
private fun AdminUsersTab(vm: AppViewModel) {
    var query by remember { mutableStateOf("") }
    var page by remember { mutableIntStateOf(1) }
    var result by remember { mutableStateOf<AdminUsersPage?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf<AdminUser?>(null) }
    var reload by remember { mutableIntStateOf(0) }

    // Debounced so a fast typist doesn't fire a request per keystroke.
    LaunchedEffect(query, page, reload) {
        if (query.isNotEmpty()) delay(300)
        loading = true
        runCatching { vm.api.adminUsers(query.trim(), page) }
            .onSuccess { result = it; error = null }
            .onFailure { error = adminErrorText(it) }
        loading = false
    }

    selected?.let { user ->
        AdminUserDialog(vm, user, result?.plans ?: emptyList()) {
            selected = null
            reload++
        }
    }

    LazyColumn(
        Modifier.fillMaxSize().background(Ct.colors.bg),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            OutlinedTextField(
                query, { query = it; page = 1 },
                label = { Text("Search by email or name") },
                singleLine = true, modifier = Modifier.fillMaxWidth(),
            )
        }
        val users = result?.users.orEmpty()
        if (users.isEmpty()) {
            item {
                AdminState(loading, error, if (loading || error != null) null else "No accounts match that search.") { reload++ }
            }
        } else {
            item {
                Text("${result?.total ?: users.size} accounts", color = Ct.colors.muted, fontSize = 12.sp)
            }
            items(users) { user ->
                CtCard { AdminUserRow(user) { selected = user } }
            }
            result?.let { r ->
                if (r.pages > 1) {
                    item {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically) {
                            TextButton(enabled = r.page > 1, onClick = { page = r.page - 1 }) { Text("Previous") }
                            Text("Page ${r.page} of ${r.pages}", color = Ct.colors.muted, fontSize = 12.sp)
                            TextButton(enabled = r.page < r.pages, onClick = { page = r.page + 1 }) { Text("Next") }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AdminUserRow(user: AdminUser, onClick: () -> Unit) {
    Column(Modifier.fillMaxWidth().clickable(onClick = onClick), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            user.name?.takeIf { it.isNotBlank() } ?: user.email,
            color = Ct.colors.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
        )
        if (!user.name.isNullOrBlank()) {
            Text(user.email, color = Ct.colors.muted, fontSize = 12.sp)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            if (user.isAdmin) AdminPill("Admin", Ct.colors.accent)
            if (user.suspended) AdminPill("Suspended", Ct.colors.red)
            if (user.pro) AdminPill((user.proPlan ?: "Pro").replaceFirstChar { it.uppercase() }, Ct.colors.green)
            else AdminPill("Free")
        }
        Column {
            Text("Created · ${adminDate(user.createdAt)}", color = Ct.colors.muted, fontSize = 11.sp)
            Text("Last sign-in · ${signInLabel(user)}", color = Ct.colors.muted, fontSize = 11.sp)
            Text(
                "Last active · ${adminRelative(user.lastSeenAt, if (user.lastLoginAt == null) "Never" else "Unknown")}",
                color = Ct.colors.muted, fontSize = 11.sp,
            )
            Text(
                "Last data change · ${adminRelative(user.lastUsedAt, "No changes yet")}",
                color = Ct.colors.muted, fontSize = 11.sp,
            )
        }
    }
}

private fun signInLabel(user: AdminUser): String {
    if (user.lastLoginAt == null) {
        return if (user.lastSeenAt != null || user.lastUsedAt != null) "Unknown (pre-tracking)" else "Never signed in"
    }
    val when_ = adminRelative(user.lastLoginAt, "Never signed in")
    val how = when (user.lastLoginMethod) {
        null, "" -> null
        "oauth-google" -> "Google"
        "oauth-apple" -> "Apple"
        else -> user.lastLoginMethod
    }
    return if (how == null) when_ else "$when_ · $how"
}

/** Everything you can do to one account. Destructive actions confirm first. */
@Composable
private fun AdminUserDialog(vm: AppViewModel, user: AdminUser, plans: List<String>, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var plan by remember { mutableStateOf("monthly") }
    var days by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("") }
    var confirmEmail by remember { mutableStateOf("") }
    var note by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    // Shared busy/error/notice handling for every action in here.
    fun run(label: String, work: suspend () -> Unit) {
        if (busy) return
        busy = true; error = null
        scope.launch {
            runCatching { work() }
                .onSuccess { note = label }
                .onFailure { error = adminErrorText(it) }
            busy = false
        }
    }

    FormDialog(user.email, saveLabel = "Done", onSave = onDone, onDismiss = onDone) {
        Text(
            if (user.pro) "Pro · ${(user.proPlan ?: "pro")}${user.proSource?.let { " ($it)" } ?: ""}" else "Free",
            color = Ct.colors.muted, fontSize = 13.sp,
        )
        user.proExpiresAt?.let { Text("Expires ${adminDate(it)}", color = Ct.colors.muted, fontSize = 12.sp) }

        HorizontalDivider(color = Ct.colors.border)
        Text("PRO", color = Ct.colors.muted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        DropdownField(
            label = "Plan",
            options = plans.ifEmpty { listOf("trial", "monthly", "yearly", "family", "lifetime") },
            selected = plan,
            onSelect = { plan = it },
        )
        // Blank means "the plan's default length"; lifetime ignores it.
        OutlinedTextField(
            days, { days = it.filter(Char::isDigit) },
            label = { Text("Days (optional)") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = { run("Granted $plan.") { vm.api.adminGrantPro(user.id, plan, days.toIntOrNull()) } },
            enabled = !busy,
            colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent),
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Grant Pro") }
        if (user.revocable) {
            TextButton(enabled = !busy, onClick = { run("Comp grant revoked.") { vm.api.adminRevokePro(user.id) } }) {
                Text("Revoke what this console granted", color = Ct.colors.red)
            }
        }
        Text(
            "Revoking pulls back comp grants and promos only. Store subscriptions are cancelled at the App Store, Play, or Paddle.",
            color = Ct.colors.muted, fontSize = 11.sp,
        )

        HorizontalDivider(color = Ct.colors.border)
        Text("ACCESS", color = Ct.colors.muted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        if (user.suspended) {
            user.suspendedReason?.takeIf { it.isNotBlank() }?.let {
                Text("Reason: $it", color = Ct.colors.muted, fontSize = 12.sp)
            }
            TextButton(enabled = !busy, onClick = { run("Account restored.") { vm.api.adminSuspend(user.id, false) } }) {
                Text("Unsuspend", color = Ct.colors.accent)
            }
        } else {
            OutlinedTextField(
                reason, { reason = it },
                label = { Text("Reason (optional)") }, singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            TextButton(
                enabled = !busy,
                onClick = { run("Account suspended.") { vm.api.adminSuspend(user.id, true, reason.ifBlank { null }) } },
            ) { Text("Suspend", color = Ct.colors.red) }
        }
        TextButton(enabled = !busy, onClick = { run("Reset email sent.") { vm.api.adminSendPasswordReset(user.id) } }) {
            Text("Send password-reset email", color = Ct.colors.accent)
        }
        TextButton(enabled = !busy, onClick = {
            run("Sessions cleared.") { vm.api.adminForceLogout(user.id) }
        }) { Text("Force sign-out everywhere", color = Ct.colors.accent) }
        TextButton(enabled = !busy, onClick = {
            run(if (user.isAdmin) "Admin role removed." else "Now an admin.") {
                vm.api.adminSetRole(user.id, !user.isAdmin)
            }
        }) { Text(if (user.isAdmin) "Remove admin role" else "Make admin", color = Ct.colors.accent) }
        Text(
            "Suspending leaves sessions alive so an open app shows the locked screen. Force sign-out drops them.",
            color = Ct.colors.muted, fontSize = 11.sp,
        )

        HorizontalDivider(color = Ct.colors.border)
        Text("DANGER ZONE", color = Ct.colors.red, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        // The typed-email echo is the safety catch, same as the web console —
        // the server rejects a mismatch outright.
        OutlinedTextField(
            confirmEmail, { confirmEmail = it },
            label = { Text("Type ${user.email} to confirm") }, singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        TextButton(
            enabled = !busy && confirmEmail.trim().equals(user.email, ignoreCase = true),
            onClick = {
                busy = true; error = null
                scope.launch {
                    runCatching { vm.api.adminDeleteUser(user.id, confirmEmail.trim()) }
                        .onSuccess { onDone() }
                        .onFailure { error = adminErrorText(it) }
                    busy = false
                }
            },
        ) { Text("Delete account permanently", color = Ct.colors.red) }

        note?.let { Text(it, color = Ct.colors.green, fontSize = 13.sp) }
        error?.let { Text(it, color = Ct.colors.red, fontSize = 13.sp) }
    }
}

/* ── Promo codes ─────────────────────────────────────────────── */

@Composable
private fun AdminPromosTab(vm: AppViewModel) {
    var promos by remember { mutableStateOf<List<AdminPromo>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var creating by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(reload) {
        loading = true
        runCatching { vm.api.adminPromos() }
            .onSuccess { promos = it; error = null }
            .onFailure { error = adminErrorText(it) }
        loading = false
    }

    if (creating) AdminPromoDialog(vm) { creating = false; reload++ }

    LazyColumn(
        Modifier.fillMaxSize().background(Ct.colors.bg),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Button(
                onClick = { creating = true }, modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent),
            ) { Text("New promo code") }
        }
        if (promos.isEmpty()) {
            item {
                AdminState(loading, error, if (loading || error != null) null else "No promo codes yet.") { reload++ }
            }
        } else {
            items(promos) { promo ->
                CtCard {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            promo.code, color = Ct.colors.text, fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Monospace,
                            modifier = Modifier.weight(1f),
                        )
                        when {
                            promo.redeemable -> AdminPill("Live", Ct.colors.green)
                            !promo.active -> AdminPill("Off")
                            promo.expired -> AdminPill("Expired", Ct.colors.red)
                            promo.exhausted -> AdminPill("Used up", Ct.colors.red)
                        }
                    }
                    Text(promoDetail(promo), color = Ct.colors.muted, fontSize = 12.sp)
                    promo.note?.takeIf { it.isNotBlank() }?.let {
                        Text(it, color = Ct.colors.muted, fontSize = 11.sp)
                    }
                    if (promo.active) {
                        TextButton(onClick = {
                            scope.launch {
                                runCatching { vm.api.adminDeactivatePromo(promo.code) }
                                    .onSuccess { reload++ }
                                    .onFailure { error = adminErrorText(it) }
                            }
                        }) { Text("Deactivate", color = Ct.colors.red) }
                    }
                }
            }
        }
    }
}

private fun promoDetail(p: AdminPromo): String {
    val bits = mutableListOf((p.plan ?: "pro").replaceFirstChar { it.uppercase() })
    p.grantDays?.let { bits += "$it days" }
    bits += if (p.maxRedemptions != null) "${p.redeemedCount}/${p.maxRedemptions} used" else "${p.redeemedCount} used"
    p.expiresAt?.let { bits += "expires ${adminDate(it)}" }
    return bits.joinToString(" · ")
}

@Composable
private fun AdminPromoDialog(vm: AppViewModel, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var code by remember { mutableStateOf("") }
    var plan by remember { mutableStateOf("monthly") }
    var days by remember { mutableStateOf("30") }
    var maxRedemptions by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    FormDialog(
        "New promo code",
        saveLabel = "Create",
        saveEnabled = (days.toIntOrNull() ?: 0) > 0,
        onSave = {
            scope.launch {
                runCatching {
                    vm.api.adminCreatePromo(
                        code = code.trim(),
                        plan = plan,
                        grantDays = days.toIntOrNull() ?: 0,
                        note = note.ifBlank { null },
                        maxRedemptions = maxRedemptions.toIntOrNull(),
                    )
                }.onSuccess { onDone() }.onFailure { error = adminErrorText(it) }
            }
        },
        onDismiss = onDone,
    ) {
        OutlinedTextField(code, { code = it.uppercase() }, label = { Text("Code (blank to generate)") },
            singleLine = true, modifier = Modifier.fillMaxWidth())
        DropdownField(
            label = "Plan",
            options = listOf("trial", "monthly", "three_month", "yearly", "family", "lifetime"),
            selected = plan,
            onSelect = { plan = it },
        )
        OutlinedTextField(days, { days = it.filter(Char::isDigit) }, label = { Text("Days granted") },
            singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth())
        OutlinedTextField(maxRedemptions, { maxRedemptions = it.filter(Char::isDigit) },
            label = { Text("Max redemptions (blank = unlimited)") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth())
        OutlinedTextField(note, { note = it }, label = { Text("Note") }, singleLine = true,
            modifier = Modifier.fillMaxWidth())
        error?.let { Text(it, color = Ct.colors.red, fontSize = 13.sp) }
    }
}

/* ── Rewards catalog ─────────────────────────────────────────── */

@Composable
private fun AdminPresetsTab(vm: AppViewModel) {
    var query by remember { mutableStateOf("") }
    var page by remember { mutableIntStateOf(1) }
    var result by remember { mutableStateOf<AdminPresetsPage?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var editing by remember { mutableStateOf<AdminCardPreset?>(null) }
    var creating by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }

    LaunchedEffect(query, page, reload) {
        if (query.isNotEmpty()) delay(300)
        loading = true
        runCatching { vm.api.adminCardPresets(query.trim(), page = page) }
            .onSuccess { result = it; error = null }
            .onFailure { error = adminErrorText(it) }
        loading = false
    }

    editing?.let { preset ->
        AdminPresetDialog(vm, preset, isNew = false) { editing = null; reload++ }
    }
    if (creating) {
        AdminPresetDialog(vm, AdminCardPreset(), isNew = true) { creating = false; reload++ }
    }

    LazyColumn(
        Modifier.fillMaxSize().background(Ct.colors.bg),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            OutlinedTextField(query, { query = it; page = 1 }, label = { Text("Search issuer or card") },
                singleLine = true, modifier = Modifier.fillMaxWidth())
        }
        item {
            Button(
                onClick = { creating = true }, modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent),
            ) { Text("New card preset") }
        }
        val presets = result?.presets.orEmpty()
        if (presets.isEmpty()) {
            item {
                AdminState(loading, error, if (loading || error != null) null else "No presets match that search.") { reload++ }
            }
        } else {
            items(presets) { preset ->
                CtCard {
                    Column(Modifier.fillMaxWidth().clickable { editing = preset }) {
                        Text(preset.label, color = Ct.colors.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                        Text(presetSummary(preset), color = Ct.colors.muted, fontSize = 12.sp)
                    }
                }
            }
            result?.let { r ->
                if (r.pages > 1) {
                    item {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically) {
                            TextButton(enabled = r.page > 1, onClick = { page = r.page - 1 }) { Text("Previous") }
                            Text("Page ${r.page} of ${r.pages}", color = Ct.colors.muted, fontSize = 12.sp)
                            TextButton(enabled = r.page < r.pages, onClick = { page = r.page + 1 }) { Text("Next") }
                        }
                    }
                }
            }
        }
    }
}

private fun fmtRate(value: Double): String =
    if (value == Math.floor(value)) value.toInt().toString() else String.format(Locale.US, "%.2f", value)

private fun presetSummary(p: AdminCardPreset): String {
    val bits = mutableListOf("${fmtRate(p.rewardBase)}x base")
    if (p.network.isNotBlank()) bits += p.network
    if (p.rewardCategories.isNotEmpty()) bits += "${p.rewardCategories.size} categories"
    p.pointValue?.let { bits += "${it}¢/pt" }
    return bits.joinToString(" · ")
}

/** Create/edit one catalog row, including its per-category rate map. */
@Composable
private fun AdminPresetDialog(vm: AppViewModel, preset: AdminCardPreset, isNew: Boolean, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var issuer by remember { mutableStateOf(preset.issuer) }
    var name by remember { mutableStateOf(preset.name) }
    var network by remember { mutableStateOf(preset.network) }
    var base by remember { mutableStateOf(fmtRate(preset.rewardBase)) }
    var pointValue by remember { mutableStateOf(preset.pointValue?.toString() ?: "") }
    var rotatingRate by remember { mutableStateOf(preset.rotatingRate?.let { fmtRate(it) } ?: "") }
    // The map as an ordered, editable list — binding rows straight to a map
    // makes the keys jump around while you type.
    var categories by remember {
        mutableStateOf(preset.rewardCategories.toList().sortedBy { it.first }.map { it.first to fmtRate(it.second) })
    }
    var error by remember { mutableStateOf<String?>(null) }

    FormDialog(
        if (isNew) "New preset" else preset.label,
        onSave = {
            val body = preset.copy(
                issuer = issuer.trim(),
                name = name.trim(),
                network = network.trim(),
                rewardBase = base.toDoubleOrNull() ?: 1.0,
                pointValue = pointValue.toDoubleOrNull(),
                rotatingRate = rotatingRate.toDoubleOrNull(),
                // Drop blank rows rather than sending empty keys the server would store.
                rewardCategories = categories.mapNotNull { (k, v) ->
                    val key = k.trim()
                    val rate = v.toDoubleOrNull()
                    if (key.isEmpty() || rate == null) null else key to rate
                }.toMap(),
            )
            scope.launch {
                runCatching {
                    if (isNew) vm.api.adminCreateCardPreset(body) else vm.api.adminUpdateCardPreset(body)
                }.onSuccess { onDone() }.onFailure { error = adminErrorText(it) }
            }
        },
        onDismiss = onDone,
        onDelete = if (isNew) null else ({
            scope.launch {
                runCatching { vm.api.adminDeleteCardPreset(preset.id) }
                    .onSuccess { onDone() }
                    .onFailure { error = adminErrorText(it) }
            }
        }),
    ) {
        OutlinedTextField(issuer, { issuer = it }, label = { Text("Issuer") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(network, { network = it }, label = { Text("Network") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        if (isNew) {
            Text("The id is generated from issuer and name.", color = Ct.colors.muted, fontSize = 11.sp)
        } else {
            Text("Id: ${preset.id}", color = Ct.colors.muted, fontSize = 11.sp)
        }

        HorizontalDivider(color = Ct.colors.border)
        OutlinedTextField(base, { base = it }, label = { Text("Base rate") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth())
        OutlinedTextField(pointValue, { pointValue = it }, label = { Text("Point value (¢)") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth())
        OutlinedTextField(rotatingRate, { rotatingRate = it }, label = { Text("Rotating rate") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth())

        HorizontalDivider(color = Ct.colors.border)
        Text("CATEGORY RATES", color = Ct.colors.muted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        categories.forEachIndexed { index, (cat, rate) ->
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    cat, { v -> categories = categories.toMutableList().also { it[index] = v to rate } },
                    label = { Text("Category") }, singleLine = true, modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(8.dp))
                OutlinedTextField(
                    rate, { v -> categories = categories.toMutableList().also { it[index] = cat to v } },
                    label = { Text("Rate") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.width(96.dp),
                )
                TextButton(onClick = {
                    categories = categories.toMutableList().also { it.removeAt(index) }
                }) { Text("✕", color = Ct.colors.red) }
            }
        }
        TextButton(onClick = { categories = categories + ("" to "") }) {
            Text("Add category", color = Ct.colors.accent)
        }
        error?.let { Text(it, color = Ct.colors.red, fontSize = 13.sp) }
        Spacer(Modifier.height(4.dp))
    }
}
