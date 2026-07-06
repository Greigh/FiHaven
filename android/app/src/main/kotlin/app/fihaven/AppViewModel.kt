package app.fihaven

import android.app.Application
import android.content.Context
import androidx.biometric.BiometricManager
import androidx.core.content.edit
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.fihaven.core.model.AppData
import app.fihaven.core.model.Account
import app.fihaven.core.model.Bill
import app.fihaven.core.model.Card
import app.fihaven.core.model.Entitlement
import app.fihaven.core.model.IncomeAdjustment
import app.fihaven.core.model.IncomeSource
import app.fihaven.core.model.Payment
import app.fihaven.core.model.PromoResult
import app.fihaven.core.model.SavingsGoal
import app.fihaven.core.model.SpendTransaction
import app.fihaven.core.model.withCategoryBudget
import app.fihaven.core.model.withBudgetBucketOverride
import app.fihaven.core.model.withBudgetRule
import app.fihaven.core.model.withBudgetRuleSplits
import app.fihaven.core.model.withDebtFocusExtra
import app.fihaven.core.model.withEnvelopeAssignCategory
import app.fihaven.core.model.withEnvelopeAssignGoal
import app.fihaven.core.model.envelopeRollover
import app.fihaven.core.model.withEnvelopeRollover
import app.fihaven.core.model.autopayDone
import app.fihaven.core.model.perkUsage
import app.fihaven.core.model.withPerkUsage
import app.fihaven.core.model.withAutopayDone
import app.fihaven.core.model.autopayMark
import app.fihaven.core.model.incomeAdjustments
import app.fihaven.core.model.incomes
import app.fihaven.core.model.paidGoal
import app.fihaven.core.model.timezoneSetting
import app.fihaven.core.model.currency
import app.fihaven.core.model.hidePaidOnDashboard
import app.fihaven.core.model.withIncomeAdjustments
import app.fihaven.core.model.withIncomes
import app.fihaven.core.model.withPaidGoal
import app.fihaven.core.model.withSetting
import app.fihaven.core.model.rolloverPrefill
import app.fihaven.core.model.lastVisitKey
import app.fihaven.core.model.withTimezone
import app.fihaven.core.Money
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import app.fihaven.core.logic.BillSchedule
import app.fihaven.core.logic.BudgetRules
import app.fihaven.core.logic.DateLogic
import app.fihaven.core.logic.PaidGoalPolicy
import app.fihaven.core.logic.PaidState
import app.fihaven.core.logic.Period
import app.fihaven.core.logic.PeriodBounds
import app.fihaven.core.logic.PeriodConfig
import app.fihaven.core.logic.Schedule
import app.fihaven.core.logic.UpcomingItem
import app.fihaven.core.net.ApiClient
import app.fihaven.core.net.ApiConfig
import app.fihaven.core.net.ApiError
import app.fihaven.core.net.LoginOutcome
import app.fihaven.core.net.MfaChallenge
import app.fihaven.core.net.User
import app.fihaven.data.PrefsTokenStore
import kotlinx.coroutines.Job
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import app.fihaven.core.model.FiHavenJson
import app.fihaven.core.model.HouseholdStreamFrame
import app.fihaven.core.model.SharedEntity
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate
import java.time.ZoneId
import kotlin.time.Duration.Companion.milliseconds

private const val BIO_KEY = "fh_biometric"
private const val BIO_LOCK_AFTER_KEY = "fh_bio_lock_after"

/** Local lock-delay values — mirrors BioLockDelay in Biometrics.swift. */
object BioLockDelay {
    const val NEVER = -1
    const val IMMEDIATELY = 0
    val PRESET_MINUTES = listOf(1, 5, 15, 30)

    fun label(minutes: Int): String = when (minutes) {
        NEVER -> "Never"
        IMMEDIATELY -> "Immediately"
        1 -> "1 minute"
        else -> "$minutes minutes"
    }

    fun clamp(minutes: Int): Int = when {
        minutes < 0 -> NEVER
        minutes == 0 -> IMMEDIATELY
        else -> minutes.coerceIn(1, 60)
    }
}

sealed interface Session {
    data object Loading : Session
    data object SignedOut : Session
    data class Mfa(val challenge: MfaChallenge) : Session
    data class Unverified(val user: User) : Session
    data class SignedIn(val user: User) : Session
}

/// Live data-save state, shown in Settings to reassure that data auto-syncs.
enum class SyncState { Idle, Saving, Saved, Offline }

/// Mirrors the iOS AppEnvironment: owns the API client + token store and
/// the auth state machine, and holds the loaded AppData.
class AppViewModel(app: Application) : AndroidViewModel(app) {
    private val tokens = PrefsTokenStore(app)
    val api = ApiClient(ApiConfig(BuildConfig.API_BASE), tokens)

    init {
        PushRegistrar.configure(api)
    }

    private val _session = MutableStateFlow<Session>(Session.Loading)
    val session: StateFlow<Session> = _session.asStateFlow()

    private val _data = MutableStateFlow(AppData())
    val data: StateFlow<AppData> = _data.asStateFlow()

    private val _dataLoaded = MutableStateFlow(false)
    val dataLoaded: StateFlow<Boolean> = _dataLoaded.asStateFlow()

    private val _dataError = MutableStateFlow<String?>(null)
    val dataError: StateFlow<String?> = _dataError.asStateFlow()

    private val _entitlement = MutableStateFlow(Entitlement())
    val entitlement: StateFlow<Entitlement> = _entitlement.asStateFlow()
    private val _stripePortal = MutableStateFlow(false)
    val stripePortal: StateFlow<Boolean> = _stripePortal.asStateFlow()

    // Live save/sync state, surfaced in Settings so users know data
    // auto-syncs to their account. Mirrors the web sync pill + iOS syncState.
    private val _syncState = MutableStateFlow(SyncState.Idle)
    val syncState: StateFlow<SyncState> = _syncState.asStateFlow()

    // ── Biometric app lock (local, per-device) ───────────────────────
    private val prefs = app.getSharedPreferences("fh_prefs", Context.MODE_PRIVATE)
    private val lockAfterDefault: Int = run {
        val delay = when {
            prefs.contains(BIO_LOCK_AFTER_KEY) -> prefs.getInt(BIO_LOCK_AFTER_KEY, BioLockDelay.IMMEDIATELY)
            prefs.contains(BIO_KEY) -> if (prefs.getBoolean(BIO_KEY, false)) BioLockDelay.IMMEDIATELY else BioLockDelay.NEVER
            else -> {
                val can = BiometricManager.from(app).canAuthenticate(
                    BiometricManager.Authenticators.BIOMETRIC_WEAK
                ) == BiometricManager.BIOMETRIC_SUCCESS
                if (can) BioLockDelay.IMMEDIATELY else BioLockDelay.NEVER
            }
        }
        if (!prefs.contains(BIO_LOCK_AFTER_KEY)) {
            prefs.edit {
                putInt(BIO_LOCK_AFTER_KEY, delay)
                putBoolean(BIO_KEY, delay >= 0)
            }
        }
        delay
    }
    private val _lockAfterMinutes = MutableStateFlow(lockAfterDefault)
    val lockAfterMinutes: StateFlow<Int> = _lockAfterMinutes.asStateFlow()
    private val _biometricEnabled = MutableStateFlow(lockAfterDefault >= 0)
    val biometricEnabled: StateFlow<Boolean> = _biometricEnabled.asStateFlow()
    // Cold launch starts locked when a delay is configured; a fresh login clears it.
    private val _locked = MutableStateFlow(lockAfterDefault >= 0)
    val locked: StateFlow<Boolean> = _locked.asStateFlow()
    private var backgroundedAt: Long? = null

    // First-run intro is local (no account yet) — shown once before auth.
    private val _introSeen = MutableStateFlow(prefs.getBoolean("intro_seen", false))
    val introSeen: StateFlow<Boolean> = _introSeen.asStateFlow()

    fun markIntroSeen() {
        _authError.value = null
        prefs.edit { putBoolean("intro_seen", true) }
        _introSeen.value = true
    }

    fun setLockAfterMinutes(minutes: Int) {
        val clamped = BioLockDelay.clamp(minutes)
        _lockAfterMinutes.value = clamped
        _biometricEnabled.value = clamped >= 0
        prefs.edit {
            putInt(BIO_LOCK_AFTER_KEY, clamped)
            putBoolean(BIO_KEY, clamped >= 0)
        }
        _locked.value = false
        backgroundedAt = null
    }

    /** @deprecated Prefer [setLockAfterMinutes]. */
    fun setBiometricEnabled(on: Boolean) {
        setLockAfterMinutes(if (on) BioLockDelay.IMMEDIATELY else BioLockDelay.NEVER)
    }

    fun onBackground() {
        backgroundedAt = System.currentTimeMillis()
        if (_lockAfterMinutes.value == BioLockDelay.IMMEDIATELY) {
            _locked.value = true
        }
    }

    fun onForeground() {
        val delay = _lockAfterMinutes.value
        if (delay <= 0) return
        val at = backgroundedAt ?: return
        if (System.currentTimeMillis() - at >= delay * 60_000L) {
            _locked.value = true
        }
    }

    fun confirmUnlock() {
        _locked.value = false
        backgroundedAt = null
    }

    /** DEBUG screenshot aid: force the lock screen. */
    fun demoLock() {
        setLockAfterMinutes(BioLockDelay.IMMEDIATELY)
        _locked.value = true
    }

    private val _working = MutableStateFlow(false)
    val working: StateFlow<Boolean> = _working.asStateFlow()

    private val _authError = MutableStateFlow<String?>(null)
    val authError: StateFlow<String?> = _authError.asStateFlow()

    private var authStartedAt = ApiClient.now()

    init { bootstrap() }

    fun markAuthStarted() {
        authStartedAt = ApiClient.now()
        _authError.value = null
    }

    private fun bootstrap() = viewModelScope.launch {
        if (tokens.get() != null) {
            try {
                val user = api.me()
                if (user != null) { enterSignedIn(user); return@launch }
                tokens.clear()
            } catch (_: Exception) {
                tokens.clear()
            }
        }
        _session.value = Session.SignedOut
    }

    fun login(
        email: String,
        password: String,
        captchaToken: String,
        startedAtOverride: Long? = null,
    ) = viewModelScope.launch {
        runAuth {
            when (val outcome = api.login(email, password, captchaToken, startedAtOverride ?: authStartedAt)) {
                is LoginOutcome.Authenticated -> enterSignedIn(outcome.session.user, fresh = true)
                is LoginOutcome.MfaRequired -> _session.value = Session.Mfa(outcome.challenge)
            }
        }
    }

    fun signup(email: String, password: String, captchaToken: String) =
        viewModelScope.launch {
            runAuth { enterSignedIn(api.signup(email, password, captchaToken, authStartedAt).user, fresh = true) }
        }

    fun verifyMfa(code: String) = viewModelScope.launch {
        val challenge = (_session.value as? Session.Mfa)?.challenge ?: return@launch
        runAuth { enterSignedIn(api.verifyMfa(challenge.mfaToken, code).user, fresh = true) }
    }

    /** Sign in with a provider OIDC ID token (apple|google). */
    fun oauthSignIn(provider: String, idToken: String, name: String? = null) =
        viewModelScope.launch {
            runAuth { enterSignedIn(api.oauthSignIn(provider, idToken, name).user, fresh = true) }
        }

    /** Finish a passwordless passkey login: the UI runs Credential Manager and
     *  hands back the challenge id + the authenticator's assertion JSON. */
    fun loginWithPasskey(challengeId: String, responseJson: String) =
        viewModelScope.launch {
            runAuth { enterSignedIn(api.passkeyLoginFinish(challengeId, responseJson).user, fresh = true) }
        }

    fun cancelMfa() { _session.value = Session.SignedOut; _authError.value = null }

    fun logout() = viewModelScope.launch {
        PushRegistrar.clear()
        runCatching { api.logout() }
        _authError.value = null
        _session.value = Session.SignedOut
        _data.value = AppData()
        _entitlement.value = Entitlement()
        _stripePortal.value = false
        _dataLoaded.value = false
        _dataError.value = null
    }

    /// DEBUG screenshot helper: log in as the dev demo account.
    fun devAutoLogin() =
        login("demo@fihaven.app", "demopassword11", "dev-bypass-token", ApiClient.now() - 3000)

    private suspend fun enterSignedIn(user: User, fresh: Boolean = false) {
        // Unconfirmed email → the verify screen, never the dashboard. The
        // server also returns email-unverified on data calls, but gating
        // here avoids fetching the data at all.
        if (!user.emailVerified) {
            _session.value = Session.Unverified(user)
            return
        }
        // A fresh password/MFA sign-in already authenticated the user, so
        // don't gate behind biometrics; a token-restored session stays locked.
        if (fresh) _locked.value = false
        _session.value = Session.SignedIn(user)
        loadData()
    }

    /** Re-send the verification email. Returns true on success. */
    suspend fun resendVerification(): Boolean =
        runCatching { api.resendVerification() }.isSuccess

    /** Re-check verification after the user opens the email link elsewhere.
     *  Enters the app when confirmed; returns false (and stays put) if not. */
    suspend fun refreshVerification(): Boolean =
        try {
            val user = api.me()
            when {
                user == null -> { _session.value = Session.SignedOut; false }
                user.emailVerified -> { enterSignedIn(user, fresh = true); true }
                else -> { _session.value = Session.Unverified(user); false }
            }
        } catch (_: ApiError) {
            false
        } catch (_: Exception) {
            false
        }

    private suspend fun loadData() {
        _dataLoaded.value = false
        _dataError.value = null
        try {
            val fetched = api.fetchData()
            _data.value = applyEnvelopeRolloverIfNeeded(fetched)
            Money.setCurrency(fetched.settings.currency)
            fetched.entitlement?.let { _entitlement.value = it }
            runAutopayMark()
            refreshEntitlement()
            _dataLoaded.value = true
            _syncState.value = SyncState.Saved
            refreshNotifications()
            refreshPush()
            checkNewMonth()
        } catch (e: ApiError) {
            _dataError.value = e.userMessage
        } catch (e: Exception) {
            _dataError.value = e.message ?: "Couldn't load your data."
        }
    }

    fun retryDataLoad() = viewModelScope.launch {
        if (_session.value is Session.SignedIn) loadData()
    }

    /** Opt-in: auto-mark autopay bills/cards paid once their due date in the
     *  current period has arrived. Each item is marked at most once per
     *  period, tracked in `settings.autopayDone` so a user's undo isn't
     *  reverted and $0 items behave (membership, not a payment amount, gates
     *  a second mark). The memory is keyed by calendar month — read across
     *  every month the period overlaps — to line up with the server.
     *  Mirrors autopay.js + the server scheduler. */
    fun runAutopayMark() {
        val d = _data.value
        if (!d.settings.autopayMark) return
        val bounds = currentBounds()
        val todayD = DateLogic.today(zone())
        val mkCal = DateLogic.currentMonthKey(zone())

        fun occ(base: LocalDate, dueDay: Int) = base.withDayOfMonth(1).plusDays((dueDay - 1).toLong())
        fun dueInPeriod(dueDay: Int): LocalDate? {
            var due = occ(bounds.start, dueDay)
            if (due.isBefore(bounds.start)) due = occ(bounds.start.plusMonths(1), dueDay)
            return if (due.isBefore(bounds.end)) due else null
        }

        val newPayments = mutableListOf<Payment>()
        // Items already auto-marked, read across every calendar month the
        // period overlaps (a long rolling window can span several).
        val done = d.settings.autopayDone
        val handled = monthsInBounds(bounds).flatMap { done[it] ?: emptyList() }.toMutableSet()
        val newlyMarked = mutableListOf<String>()
        fun considerBill(b: Bill) {
            if (!b.autopay) return
            val refKey = "bill:${b.id}"
            if (refKey in handled) return
            if (b.dueDay == null && b.startDate.isNullOrEmpty()) return
            val apDay = b.autopayDay ?: 0
            if (apDay > 0) {
                // Autopay pulls on its own day; the bill must still be
                // scheduled this period, but the trigger is the autopay day.
                if (!BillSchedule.dueInPeriod(b, bounds, zone())) return
                val due = dueInPeriod(apDay) ?: return
                if (due.isAfter(todayD)) return
            } else {
                BillSchedule.dueOnOrBeforeInPeriod(b, bounds, zone(), todayD) ?: return
            }
            val refId = b.id.toString()
            if (Schedule.paidAmount(d.payments, "bill", refId, bounds) > Schedule.PAID_EPSILON) return
            if (Schedule.isSkipped(d.payments, "bill", refId, bounds)) return
            val iso = "%04d-%02d-%02d".format(todayD.year, todayD.monthValue, todayD.dayOfMonth)
            newPayments.add(Payment(newPaymentId(), "bill", refId, b.name, b.amount, iso, mkCal, "Auto-marked (autopay)", false))
            handled.add(refKey); newlyMarked.add(refKey)
        }
        fun considerCard(type: String, refId: String, name: String, dueDay: Int?, autopay: Boolean, amount: Double) {
            if (!autopay || dueDay == null || dueDay <= 0) return
            val refKey = "$type:$refId"
            if (refKey in handled) return
            val due = dueInPeriod(dueDay) ?: return
            if (due.isAfter(todayD)) return
            if (Schedule.paidAmount(d.payments, type, refId, bounds) > Schedule.PAID_EPSILON) return
            if (Schedule.isSkipped(d.payments, type, refId, bounds)) return
            val iso = "%04d-%02d-%02d".format(todayD.year, todayD.monthValue, todayD.dayOfMonth)
            newPayments.add(Payment(newPaymentId(), type, refId, name, amount, iso, mkCal, "Auto-marked (autopay)", false))
            handled.add(refKey); newlyMarked.add(refKey)
        }
        d.bills.forEach { considerBill(it) }
        d.cards.forEach {
            // Autopay pulls on `autopayDay`; null falls back to the due day.
            val effDay = it.autopayDay?.takeIf { day -> day > 0 } ?: it.dueDay
            considerCard("card", it.id.toString(), it.name + " (payment)", effDay, it.autopay,
                goalAmount("card", it.id.toString()))
        }
        if (newPayments.isNotEmpty()) {
            // New marks go in this month's bucket; keep buckets for the last 4
            // months (covers the longest rolling window) and drop the rest.
            val calBucket = ((done[mkCal] ?: emptyList()) + newlyMarked).toSet().toList()
            val minKey = shiftMonthKey(mkCal, -3)
            val next = done.filterKeys { it >= minKey && it != mkCal }.toMutableMap()
            next[mkCal] = calBucket
            mutate { it.copy(payments = it.payments + newPayments, settings = it.settings.withAutopayDone(next)) }
        }
    }

    /** Shift a "YYYY-MM" key by `delta` months. */
    private fun shiftMonthKey(mk: String, delta: Int): String {
        val parts = mk.split("-").mapNotNull { it.toIntOrNull() }
        if (parts.size != 2) return mk
        val total = parts[0] * 12 + (parts[1] - 1) + delta
        return "%04d-%02d".format(Math.floorDiv(total, 12), Math.floorMod(total, 12) + 1)
    }

    /** The "YYYY-MM" calendar months a period's [start, end) overlaps. */
    private fun monthsInBounds(bounds: app.fihaven.core.logic.PeriodBounds): List<String> {
        val last = bounds.end.minusDays(1)
        var idx = bounds.start.year * 12 + (bounds.start.monthValue - 1)
        val endIdx = last.year * 12 + (last.monthValue - 1)
        val out = mutableListOf<String>()
        while (idx <= endIdx) {
            out.add("%04d-%02d".format(idx / 12, idx % 12 + 1))
            idx++
        }
        return out
    }

    // ── Billing / entitlement ────────────────────────────────────────
    suspend fun refreshEntitlement() {
        devEntitlement(devEntitlementOverride)?.let { _entitlement.value = it; return }
        runCatching {
            val status = api.billingStatusFull()
            _entitlement.value = status.entitlement
            _stripePortal.value = status.stripePortal
        }
    }

    fun billingNote(ent: Entitlement): String? = when {
        !ent.pro -> null
        ent.source == "comp" -> "You have complimentary Pro access — no subscription to manage."
        ent.source == "promo" -> "Your Pro access is from a promo code — no subscription to manage."
        else -> null
    }

    fun manageButtonLabel(ent: Entitlement): String? = when {
        !ent.pro -> null
        _stripePortal.value -> "Manage subscription"
        ent.source == "google" -> "Manage in Play Store"
        else -> null
    }

    fun manageSubscription(context: android.content.Context) = viewModelScope.launch {
        when {
            _stripePortal.value -> runCatching {
                val url = api.createStripePortal()
                context.startActivity(
                    android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))
                )
            }
            _entitlement.value.source == "google" -> {
                context.startActivity(
                    android.content.Intent(
                        android.content.Intent.ACTION_VIEW,
                        android.net.Uri.parse("https://play.google.com/store/account/subscriptions?package=app.fihaven"),
                    )
                )
            }
        }
    }

    // ── Dev-only entitlement override (testing; debug builds) ─────────
    // Simulates each Pro state without a real purchase. Local to the device;
    // never touches the server. devEntitlement() returns null in release.
    private val devEntKey = "fh_dev_entitlement"
    var devEntitlementOverride: String
        get() = prefs.getString(devEntKey, "off") ?: "off"
        set(value) {
            prefs.edit().apply { if (value == "off") remove(devEntKey) else putString(devEntKey, value) }.apply()
            val synth = devEntitlement(value)
            if (synth != null) _entitlement.value = synth
            else viewModelScope.launch { refreshEntitlement() }
        }

    private fun devEntitlement(state: String): Entitlement? {
        if (!BuildConfig.DEBUG) return null
        val now = System.currentTimeMillis(); val day = 86_400_000L
        return when (state) {
            "free" -> Entitlement(pro = false, source = "dev")
            "active" -> Entitlement(pro = true, source = "dev", plan = "monthly", expiresAt = now + 30 * day, autoRenew = true, proSince = now - 90 * day)
            "expired" -> Entitlement(pro = false, source = "dev", plan = "monthly", expiresAt = now - 2 * day, autoRenew = false)
            "grace" -> Entitlement(pro = true, source = "dev", plan = "monthly", expiresAt = now - day, autoRenew = false, proSince = now - 120 * day)
            "canceled" -> Entitlement(pro = true, source = "dev", plan = "monthly", expiresAt = now + 10 * day, autoRenew = false, proSince = now - 200 * day)
            else -> null
        }
    }

    /** "Restore purchases" — re-sync entitlement from the server. */
    fun restore() = viewModelScope.launch { refreshEntitlement() }

    /** Send a verified Play purchase to the server and adopt the entitlement. */
    fun verifyGooglePurchase(productId: String, purchaseToken: String) = viewModelScope.launch {
        runCatching { _entitlement.value = api.verifyGoogle(productId, purchaseToken) }
    }

    /** Redeem a server promo code. onResult(result, errorMessage). */
    fun redeemPromo(code: String, onResult: (PromoResult?, String?) -> Unit) = viewModelScope.launch {
        runCatching { api.redeemPromo(code.trim()) }
            .onSuccess { result ->
                result.entitlement?.let { _entitlement.value = it }
                onResult(result, null)
            }
            .onFailure { e ->
                onResult(null, (e as? ApiError)?.let(::promoError) ?: "Couldn’t redeem that code.")
            }
    }

    private fun promoError(e: ApiError): String = when ((e as? ApiError.Http)?.code) {
        "already-redeemed" -> "You’ve already used that code."
        "code-exhausted" -> "That code has reached its limit."
        "code-expired" -> "That code has expired."
        "invalid-code" -> "That code isn’t valid."
        else -> "Couldn’t redeem that code."
    }

    private suspend fun runAuth(block: suspend () -> Unit) {
        _working.value = true
        _authError.value = null
        try {
            block()
        } catch (e: ApiError) {
            _authError.value = e.userMessage
        } catch (e: Exception) {
            _authError.value = e.message ?: "Something went wrong."
        } finally {
            _working.value = false
        }
    }

    // ── Account helpers (used by Settings) ───────────────────────────
    val currentUser: User? get() = (_session.value as? Session.SignedIn)?.user

    /** Opens the household live-delta SSE stream (Phase 3) and invokes
     *  [onEntity] for each delta until the coroutine is cancelled. Uses
     *  HttpURLConnection directly — the core transport is request/response. */
    suspend fun streamHousehold(since: Long, onEntity: (SharedEntity) -> Unit) = withContext(Dispatchers.IO) {
        val url = URL(BuildConfig.API_BASE.trimEnd('/') + "/api/household/stream/" + since)
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 15_000
            readTimeout = 0 // keep the stream open
            setRequestProperty("Accept", "text/event-stream")
            tokens.get()?.let { setRequestProperty("Authorization", "Bearer $it") }
        }
        try {
            if (conn.responseCode != 200) return@withContext
            conn.inputStream.bufferedReader(Charsets.UTF_8).use { reader ->
                while (isActive) {
                    val line = reader.readLine() ?: break
                    if (line.startsWith("data:")) {
                        val json = line.substring(5).trim()
                        runCatching {
                            onEntity(FiHavenJson.decodeFromString(HouseholdStreamFrame.serializer(), json).entity)
                        }
                    }
                }
            }
        } catch (_: Exception) {
            // dropped; caller re-subscribes on next reload
        } finally {
            conn.disconnect()
        }
    }

    fun applyUser(user: User) {
        if (_session.value is Session.SignedIn) _session.value = Session.SignedIn(user)
    }

    /** After a successful change-email: stay signed in but gate on verify when required. */
    fun applyEmailChange(email: String, verificationRequired: Boolean) {
        val name = currentUser?.name
        val user = User(email, name, emailVerified = !verificationRequired)
        _session.value = if (verificationRequired) Session.Unverified(user) else Session.SignedIn(user)
    }

    /** Mark first-run onboarding complete, then drop the gate. Best-effort:
     *  the local flag flips regardless so a network error never traps the
     *  user on the intro. */
    fun completeOnboarding() {
        viewModelScope.launch {
            runCatching { api.markOnboarded() }
            currentUser?.let { applyUser(it.copy(onboarded = true)) }
        }
    }

    fun deleteAccount(password: String, code: String = "", onError: (String) -> Unit) = viewModelScope.launch {
        try {
            api.deleteAccount(password, code)
            tokens.clear()
            _session.value = Session.SignedOut
            _data.value = AppData()
            _entitlement.value = Entitlement()
        _stripePortal.value = false
        } catch (e: ApiError) {
            onError(e.userMessage)
        } catch (e: Exception) {
            onError(e.message ?: "Something went wrong.")
        }
    }

    /** Erase selected data groups (bills/cards/payments/bank) while keeping the
     *  account + settings, then reload from the server. */
    fun clearData(password: String, code: String = "", groups: List<String>, onError: (String) -> Unit, onDone: () -> Unit) =
        viewModelScope.launch {
            try {
                api.clearData(password, code, groups)
                loadData()
                onDone()
            } catch (e: ApiError) {
                onError(e.userMessage)
            } catch (e: Exception) {
                onError(e.message ?: "Something went wrong.")
            }
        }

    // ── Data store: in-memory edits + debounced full-snapshot save ───
    private var saveJob: Job? = null

    fun mutate(transform: (AppData) -> AppData) {
        _data.value = transform(_data.value)
        _syncState.value = SyncState.Saving
        saveJob?.cancel()
        saveJob = viewModelScope.launch {
            delay(800.milliseconds)
            _syncState.value = if (runCatching { api.saveData(_data.value) }.isSuccess)
                SyncState.Saved else SyncState.Offline
            // Reschedule on-device reminders from the latest data (local —
            // independent of whether the network save succeeded).
            refreshNotifications()
        }
    }

    /** Re-sync on-device bill reminders to the current bills + settings. */
    fun refreshNotifications() {
        val d = _data.value
        runCatching {
            NotificationScheduler.reschedule(getApplication(), d.bills, d.cards, d.settings, zone())
        }
    }

    fun upsertBill(bill: Bill) = mutate { d ->
        val list = d.bills.toMutableList()
        val i = list.indexOfFirst { it.id == bill.id }
        if (i >= 0) list[i] = bill else list.add(bill)
        d.copy(bills = list)
    }

    fun deleteBill(bill: Bill) = mutate { it.copy(bills = it.bills.filterNot { b -> b.id == bill.id }) }

    fun upsertCard(card: Card) = mutate { d ->
        val list = d.cards.toMutableList()
        val i = list.indexOfFirst { it.id == card.id }
        if (i >= 0) list[i] = card else list.add(card)
        d.copy(cards = list)
    }

    fun deleteCard(card: Card) = mutate { it.copy(cards = it.cards.filterNot { c -> c.id == card.id }) }

    fun upsertAccount(account: Account) = mutate { d ->
        val list = d.accounts.toMutableList()
        val i = list.indexOfFirst { it.id == account.id }
        if (i >= 0) list[i] = account else list.add(account)
        d.copy(accounts = list)
    }

    fun deleteAccount(account: Account) =
        mutate { it.copy(accounts = it.accounts.filterNot { a -> a.id == account.id }) }

    fun upsertGoal(goal: SavingsGoal) = mutate { d ->
        val list = d.goals.toMutableList()
        val i = list.indexOfFirst { it.id == goal.id }
        if (i >= 0) list[i] = goal else list.add(goal)
        d.copy(goals = list)
    }

    fun deleteGoal(goal: SavingsGoal) =
        mutate { it.copy(goals = it.goals.filterNot { g -> g.id == goal.id }) }

    fun addTransaction(amount: Double, category: String, merchant: String, dateIso: String) = mutate { d ->
        d.copy(transactions = d.transactions + SpendTransaction(newPaymentId(), dateIso, amount, category, merchant, ""))
    }

    fun deleteTransaction(tx: SpendTransaction) =
        mutate { it.copy(transactions = it.transactions.filterNot { t -> t.id == tx.id }) }

    fun setCategoryBudget(category: String, amount: Double) =
        mutate { it.copy(settings = it.settings.withCategoryBudget(category, amount)) }

    fun setBudgetRule(mode: String) = mutate { it.copy(settings = it.settings.withBudgetRule(mode)) }

    fun setBudgetRuleSplits(needs: Int, wants: Int, save: Int) =
        mutate { it.copy(settings = it.settings.withBudgetRuleSplits(needs, wants, save)) }

    fun setDebtFocusExtra(amount: Double) =
        mutate { it.copy(settings = it.settings.withDebtFocusExtra(amount)) }

    fun setEnvelopeRollover(on: Boolean) =
        mutate { it.copy(settings = it.settings.withEnvelopeRollover(on)) }

    fun setEnvelopeAssignGoal(goalId: String, amount: Double) =
        mutate { it.copy(settings = it.settings.withEnvelopeAssignGoal(goalId, amount)) }

    fun setEnvelopeAssignCategory(category: String, amount: Double) =
        mutate { it.copy(settings = it.settings.withEnvelopeAssignCategory(category, amount)) }

    fun setBudgetBucketOverride(kind: String, category: String, bucket: String?) =
        mutate { it.copy(settings = it.settings.withBudgetBucketOverride(kind, category, bucket)) }

    /** Roll unused envelope category amounts from the previous period once per period key. */
    private fun applyEnvelopeRolloverIfNeeded(data: AppData): AppData {
        val settings = data.settings
        if (!settings.envelopeRollover) return data
        val cfg = Period.config(settings)
        val zone = DateLogic.zone(settings.timezoneSetting)
        val bounds = Period.currentBounds(cfg, zone)
        val prev = Period.shift(bounds, -1, cfg)
        val nextSettings = BudgetRules.applyEnvelopeRollover(settings, data.transactions, prev)
        return if (nextSettings == settings) data else data.copy(settings = nextSettings)
    }

    // ── Monthly rollover ────────────────────────────────────────────
    data class RolloverPrompt(val prevLabel: String, val currLabel: String, val missedNames: List<String>)

    private val _rolloverPrompt = MutableStateFlow<RolloverPrompt?>(null)
    val rolloverPrompt: StateFlow<RolloverPrompt?> = _rolloverPrompt.asStateFlow()

    /** New-month detection (mirrors the web's checkNewMonth): when the calendar
     *  month has advanced since the last visit, surface the rollover prompt with
     *  the items that were never marked paid, then record the new month so it
     *  fires only once. */
    fun checkNewMonth() {
        val d = _data.value
        val zone = DateLogic.zone(d.settings.timezoneSetting)
        val currentMk = DateLogic.monthKey(DateLogic.today(zone))
        val lastMk = d.settings.lastVisitKey
        if (!lastMk.isNullOrBlank() && lastMk != currentMk) {
            val missed = buildList {
                d.bills.filter { (it.dueDay != null || it.startDate != null) && DateLogic.billActive(it, zone) }
                    .forEach { if (!Schedule.isPaid(d.payments, "bill", it.id, lastMk)) add(it.name) }
                d.cards.filter { it.dueDay != null }
                    .forEach { if (!Schedule.isPaid(d.payments, "card", it.id, lastMk)) add(it.name) }
            }
            _rolloverPrompt.value = RolloverPrompt(
                DateLogic.monthKeyLabel(lastMk), DateLogic.monthKeyLabel(currentMk), missed,
            )
        }
        if (lastMk != currentMk) {
            mutate { it.copy(settings = it.settings.withSetting("lastVisitKey", JsonPrimitive(currentMk))) }
        }
    }

    fun dismissRolloverPrompt() { _rolloverPrompt.value = null }

    fun setRolloverPrefill(mode: String) =
        mutate { it.copy(settings = it.settings.withSetting("rolloverPrefill", JsonPrimitive(mode))) }

    /** Bills active in the current period — the rows shown in the rollover review. */
    fun rolloverBills(): List<Bill> {
        val d = _data.value
        val zone = DateLogic.zone(d.settings.timezoneSetting)
        return d.bills.filter { (it.dueDay != null || it.startDate != null) && DateLogic.billActive(it, zone) }
    }

    /** Pre-filled amount for a bill under the active rollover policy. */
    fun rolloverPrefillAmount(bill: Bill): Double {
        val d = _data.value
        val avg = Schedule.recentPaymentAverage(d.payments, "bill", bill.id)
        return Schedule.rolloverAmount(d.settings.rolloverPrefill, bill.amount, avg)
    }

    /** Apply reviewed amounts (billId → amount) to the matching bills. */
    fun applyRolloverAmounts(amounts: Map<String, Double>) {
        if (amounts.isEmpty()) return
        mutate { d -> d.copy(bills = d.bills.map { b -> amounts[b.id]?.let { b.copy(amount = it) } ?: b }) }
    }

    fun deletePayment(payment: Payment) = mutate { d ->
        val payments = d.payments.filterNot { p -> p.id == payment.id }
        // Undo the balance decrement a card payment applied.
        val cards = if (payment.type == "card")
            applyCardPaymentDelta(d.cards, payment.refId, -payment.amount) else d.cards
        d.copy(payments = payments, cards = cards)
    }

    fun updatePayment(payment: Payment, amount: Double, dateIso: String, note: String) = mutate { d ->
        val i = d.payments.indexOfFirst { it.id == payment.id }
        if (i < 0) return@mutate d
        val oldAmt = d.payments[i].amount
        val mk = DateLogic.parseDate(dateIso)?.let { DateLogic.monthKey(it) } ?: d.payments[i].monthKey
        val payments = d.payments.toMutableList()
        payments[i] = payment.copy(amount = amount, date = dateIso, monthKey = mk, note = note)
        val cards = if (payment.type == "card" && oldAmt != amount)
            applyCardPaymentDelta(d.cards, payment.refId, amount - oldAmt) else d.cards
        d.copy(payments = payments, cards = cards)
    }

    fun upsertIncome(source: IncomeSource) = mutate { d ->
        val list = d.settings.incomes.toMutableList()
        val i = list.indexOfFirst { it.id == source.id }
        if (i >= 0) list[i] = source else list.add(source)
        d.copy(settings = d.settings.withIncomes(list))
    }

    fun deleteIncome(source: IncomeSource) =
        mutate { d -> d.copy(settings = d.settings.withIncomes(d.settings.incomes.filterNot { it.id == source.id })) }

    fun upsertAdjustment(adj: IncomeAdjustment) = mutate { d ->
        val list = d.settings.incomeAdjustments.toMutableList()
        val i = list.indexOfFirst { it.id == adj.id }
        if (i >= 0) list[i] = adj else list.add(adj)
        d.copy(settings = d.settings.withIncomeAdjustments(list))
    }

    fun deleteAdjustment(adj: IncomeAdjustment) = mutate { d ->
        d.copy(settings = d.settings.withIncomeAdjustments(d.settings.incomeAdjustments.filterNot { it.id == adj.id }))
    }

    fun setTimezone(tz: String?) = mutate { it.copy(settings = it.settings.withTimezone(tz)) }

    fun setPaidGoal(policy: PaidGoalPolicy) =
        mutate { it.copy(settings = it.settings.withPaidGoal(policy.raw)) }

    fun setPeriodMode(mode: String) =
        mutate { it.copy(settings = it.settings.withSetting("periodMode", JsonPrimitive(mode))) }
    fun setPeriodStartDay(day: Int) =
        mutate { it.copy(settings = it.settings.withSetting("periodStartDay", JsonPrimitive(day.coerceIn(1, 28)))) }
    fun setPeriodLength(len: Int) =
        mutate { it.copy(settings = it.settings.withSetting("periodLength", JsonPrimitive(len.coerceIn(7, 90)))) }
    /** Set/clear the rolling-window start anchor ("YYYY-MM-DD"; blank = epoch). */
    fun setPeriodAnchor(anchor: String?) =
        mutate { it.copy(settings = it.settings.withSetting("periodAnchor",
            JsonPrimitive(anchor?.takeIf { a -> Regex("""^\d{4}-\d{2}-\d{2}$""").matches(a) } ?: ""))) }

    fun setCurrency(code: String) {
        Money.setCurrency(code)
        mutate { it.copy(settings = it.settings.withSetting("currency", JsonPrimitive(code))) }
    }

    fun setLandingView(view: String) =
        mutate { it.copy(settings = it.settings.withSetting("landingView", JsonPrimitive(view))) }

    /// Persist the bottom-bar tab order (ids). Tabs not listed fall under More.
    fun setTabs(ids: List<String>) =
        mutate { it.copy(settings = it.settings.withSetting("tabs", buildJsonArray { ids.forEach { id -> add(id) } })) }

    fun setBillReminders(on: Boolean) =
        mutate { it.copy(settings = it.settings.withSetting("billReminders", JsonPrimitive(on))) }

    fun setHidePaidOnDashboard(on: Boolean) =
        mutate { it.copy(settings = it.settings.withSetting("hidePaidOnDashboard", JsonPrimitive(on))) }

    fun setDashboardLayout(layout: String) =
        mutate { it.copy(settings = it.settings.withSetting("dashboardLayout", JsonPrimitive(layout))) }
    fun setDashboardWidgets(ids: List<String>) =
        mutate { it.copy(settings = it.settings.withSetting("dashboardWidgets", buildJsonArray { ids.forEach { id -> add(id) } })) }

    fun setMonthlySummary(on: Boolean) =
        mutate { it.copy(settings = it.settings.withSetting("monthlySummary", JsonPrimitive(on))) }

    fun setWeeklyDigest(on: Boolean) =
        mutate { it.copy(settings = it.settings.withSetting("weeklyDigest", JsonPrimitive(on))) }
    /** Card-linked offer expiry reminders (email + on-device). Reschedules so
     *  a device notification is (un)set immediately. */
    fun setOfferReminders(on: Boolean) {
        mutate { it.copy(settings = it.settings.withSetting("offerReminders", JsonPrimitive(on))) }
        refreshNotifications()
    }
    /** Opt-in: let synced bank balances update matching cards (server-applied). */
    fun setPlaidUpdateBalances(on: Boolean) =
        mutate { it.copy(settings = it.settings.withSetting("plaidUpdateBalances", JsonPrimitive(on))) }
    /** Mark a card-linked offer used (so it drops off the active list). */
    fun setOfferUsed(cardId: String, offerId: String, used: Boolean) {
        mutate { d ->
            d.copy(cards = d.cards.map { c ->
                if (c.id.toString() != cardId) c
                else c.copy(offers = c.offers.map { if (it.id == offerId) it.copy(used = used) else it })
            })
        }
    }

    /** Log how much of a card perk's credit has been used this cycle. */
    fun setPerkUsage(cardId: String, perk: app.fihaven.core.model.CardPerk, amount: Double) {
        val next = app.fihaven.core.logic.Perks.applyUsage(
            _data.value.settings.perkUsage, cardId, perk, amount, DateLogic.today(zone()))
        mutate { it.copy(settings = it.settings.withPerkUsage(next)) }
    }

    fun setReminderLeadDays(days: Int) =
        mutate { it.copy(settings = it.settings.withSetting("reminderLeadDays", JsonPrimitive(days.coerceIn(0, 14)))) }
    fun setRemindOnDueDay(on: Boolean) =
        mutate { it.copy(settings = it.settings.withSetting("remindOnDueDay", JsonPrimitive(on))) }
    fun setNotifyHour(hour: Int) =
        mutate { it.copy(settings = it.settings.withSetting("notifyHour", JsonPrimitive(hour.coerceIn(0, 23)))) }
    /** On-device reminders. Reschedules immediately; the SettingsScreen
     *  requests the POST_NOTIFICATIONS runtime permission when turning on. */
    fun setLocalNotifications(on: Boolean) {
        mutate { it.copy(settings = it.settings.withSetting("localNotifications", JsonPrimitive(on))) }
        refreshNotifications()
    }

    fun setPushNotifications(on: Boolean) {
        mutate { it.copy(settings = it.settings.withSetting("pushNotifications", JsonPrimitive(on))) }
        refreshPush()
    }

    private fun refreshPush() = viewModelScope.launch {
        PushRegistrar.sync(getApplication(), _data.value.settings)
    }

    fun setAutopayMark(on: Boolean) {
        mutate { it.copy(settings = it.settings.withSetting("autopayMark", JsonPrimitive(on))) }
        if (on) runAutopayMark()
    }
    fun setAutopayMarkHour(hour: Int) =
        mutate { it.copy(settings = it.settings.withSetting("autopayMarkHour", JsonPrimitive(hour.coerceIn(0, 23)))) }

    /**
     * Record a payment of [amount] toward a bill/card on [date]. Payments accumulate
     * toward the monthly goal (partial installments are kept). Card payments decrement
     * the balance, mirroring confirmPay + applyCardPaymentDelta on the web.
     */
    fun recordPayment(type: String, refId: String, name: String, amount: Double, date: LocalDate, note: String) =
        mutate { d ->
            val mk = DateLogic.monthKey(date)
            val iso = "%04d-%02d-%02d".format(date.year, date.monthValue, date.dayOfMonth)
            val payments = d.payments.toMutableList()
            payments.add(Payment(newPaymentId(), type, refId, name, amount, iso, mk, note))
            val cards = if (type == "card") applyCardPaymentDelta(d.cards, refId, amount) else d.cards
            d.copy(payments = payments, cards = cards)
        }

    /** Mark/unmark paid for the current period (row toggles). */
    fun setPaid(type: String, refId: String, name: String, amount: Double, paid: Boolean) = mutate { d ->
        val mk = DateLogic.currentMonthKey(zone())
        val i = d.payments.indexOfFirst { it.type == type && it.refId == refId && it.monthKey == mk && !it.skipped }
        val payments = d.payments.toMutableList()
        var cards = d.cards
        if (paid && i < 0) {
            val iso = "%04d-%02d-%02d".format(DateLogic.today(zone()).year, DateLogic.today(zone()).monthValue, DateLogic.today(zone()).dayOfMonth)
            payments.add(Payment(newPaymentId(), type, refId, name, amount, iso, mk, ""))
            if (type == "card") cards = applyCardPaymentDelta(cards, refId, amount)
        } else if (!paid && i >= 0) {
            val removed = payments.removeAt(i)
            if (type == "card") cards = applyCardPaymentDelta(cards, refId, -removed.amount)
        }
        d.copy(payments = payments, cards = cards)
    }

    /// A new unique string id for payments, matching the web's format
    /// (base36 timestamp + random) so ids round-trip across platforms.
    private fun newPaymentId(): String {
        val charset = ('a'..'z') + ('0'..'9')
        val rand = (1..8).map { charset.random() }.joinToString("")
        return System.currentTimeMillis().toString(36) + rand
    }

    /** Decrement a card's balance (and promo balance) by [delta]; negative reverses. */
    private fun applyCardPaymentDelta(cards: List<Card>, refId: String, delta: Double): List<Card> {
        if (delta == 0.0) return cards
        return cards.map { c ->
            if (c.id.toString() != refId) c
            else c.copy(
                balance = (c.balance - delta).coerceAtLeast(0.0),
                promoBalance = c.promoBalance?.let { (it - delta).coerceAtLeast(0.0) },
            )
        }
    }

    // ── Budget period (calendar / startDay / rolling) ───────────────────────
    fun periodConfig(): PeriodConfig = Period.config(_data.value.settings)
    fun currentBounds(): PeriodBounds = Period.currentBounds(periodConfig(), zone())
    fun currentPeriodKey(): String = currentBounds().key

    // ── Fully-paid goal logic (mirrors utils.js) ────────────────────────────
    fun paidGoalPolicy(): PaidGoalPolicy = PaidGoalPolicy.from(_data.value.settings.paidGoal)

    fun goalAmount(type: String, refId: String): Double {
        val d = _data.value
        return if (type == "bill") {
            d.bills.firstOrNull { it.id.toString() == refId }?.let { Schedule.goalAmount(it) } ?: 0.0
        } else {
            d.cards.firstOrNull { it.id.toString() == refId }?.let {
                Schedule.goalAmount(it, paidGoalPolicy(), d.payments, currentBounds(), zone())
            } ?: 0.0
        }
    }

    fun paidAmountFor(type: String, refId: String): Double =
        Schedule.paidAmount(_data.value.payments, type, refId, currentBounds())

    fun isSkipped(type: String, refId: String): Boolean =
        Schedule.isSkipped(_data.value.payments, type, refId, currentBounds())

    fun remainingFor(type: String, refId: String): Double =
        if (isSkipped(type, refId)) 0.0
        else (goalAmount(type, refId) - paidAmountFor(type, refId)).coerceAtLeast(0.0)

    fun isFullyPaid(type: String, refId: String): Boolean =
        remainingFor(type, refId) <= Schedule.PAID_EPSILON

    fun paidState(type: String, refId: String): PaidState = when {
        isFullyPaid(type, refId) -> PaidState.FULL
        paidAmountFor(type, refId) > Schedule.PAID_EPSILON -> PaidState.PARTIAL
        else -> PaidState.UNPAID
    }

    // UpcomingItem conveniences.
    fun goalAmount(item: UpcomingItem) = goalAmount(item.type, item.refId)
    fun paidAmountFor(item: UpcomingItem) = paidAmountFor(item.type, item.refId)
    fun remainingFor(item: UpcomingItem) = remainingFor(item.type, item.refId)
    fun paidState(item: UpcomingItem) = paidState(item.type, item.refId)
    fun isSkipped(item: UpcomingItem) = isSkipped(item.type, item.refId)

    /** Billing-cycle noun for period-correct labels ("Paid this quarter").
     *  Cards are always monthly; bills follow their own frequency. */
    fun periodNoun(item: UpcomingItem): String {
        if (item.type != "bill") return "month"
        val bill = _data.value.bills.firstOrNull { it.id.toString() == item.refId } ?: return "month"
        return BillSchedule.periodNoun(bill.frequency)
    }

    /** A warning to show before skipping a card this period, or null when it's
     *  safe to skip. Warns if the minimum (late-fee risk) or the suggested
     *  payment under the active goal policy hasn't been met. Mirrors the web's
     *  skipMonth warning in modals.js. */
    fun cardSkipWarning(refId: String, name: String): String? {
        val card = _data.value.cards.firstOrNull { it.id.toString() == refId } ?: return null
        val paid = paidAmountFor("card", refId)
        val min = card.minPayment
        val goal = goalAmount("card", refId)
        return when {
            min > 0 && paid + Schedule.PAID_EPSILON < min ->
                "You haven’t paid the minimum of ${Money.fmt(min)} on $name yet. " +
                    "Skipping could mean a late fee or extra interest."
            goal > 0 && paid + Schedule.PAID_EPSILON < goal ->
                "You haven’t reached your suggested payment of ${Money.fmt(goal)} on $name yet."
            else -> null
        }
    }

    fun periodObligationItems(upcoming: List<UpcomingItem>): List<UpcomingItem> {
        val bounds = currentBounds()
        return upcoming.filter { item ->
            if (item.type == "card") return@filter true
            val bill = _data.value.bills.firstOrNull { it.id.toString() == item.refId } ?: return@filter false
            BillSchedule.dueInPeriod(bill, bounds, zone())
        }
    }

    fun dashboardUpcoming(upcoming: List<UpcomingItem>): List<UpcomingItem> {
        if (!_data.value.settings.hidePaidOnDashboard) return upcoming
        return upcoming.filter { !isFullyPaid(it.type, it.refId) }
    }

    /** Skip a bill/card for the current period: a `skipped` payment (amount 0).
     *  Matched by the active period (date range); the stored monthKey is the
     *  calendar month, for back-compat. */
    fun skipMonth(type: String, refId: String, name: String) = mutate { d ->
        val bounds = currentBounds()
        val exists = d.payments.any { it.skipped && it.type == type && it.refId == refId && bounds.contains(it) }
        if (exists) return@mutate d
        val t = DateLogic.today(zone())
        val iso = "%04d-%02d-%02d".format(t.year, t.monthValue, t.dayOfMonth)
        val mk = DateLogic.currentMonthKey(zone())
        val payments = d.payments + Payment(newPaymentId(), type, refId, name, 0.0, iso, mk, "Skipped this period", true)
        d.copy(payments = payments)
    }

    /** Reverse a skip for the current period. */
    fun unskip(type: String, refId: String) = mutate { d ->
        val bounds = currentBounds()
        d.copy(payments = d.payments.filterNot { it.skipped && it.type == type && it.refId == refId && bounds.contains(it) })
    }

    fun zone(): ZoneId = DateLogic.zone(_data.value.settings.timezoneSetting)
}
