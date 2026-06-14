package com.danielhipskind.fihaven

import android.app.Application
import android.content.Context
import androidx.biometric.BiometricManager
import androidx.core.content.edit
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.danielhipskind.fihaven.core.model.AppData
import com.danielhipskind.fihaven.core.model.Account
import com.danielhipskind.fihaven.core.model.Bill
import com.danielhipskind.fihaven.core.model.Card
import com.danielhipskind.fihaven.core.model.Entitlement
import com.danielhipskind.fihaven.core.model.IncomeAdjustment
import com.danielhipskind.fihaven.core.model.IncomeSource
import com.danielhipskind.fihaven.core.model.Payment
import com.danielhipskind.fihaven.core.model.PromoResult
import com.danielhipskind.fihaven.core.model.SavingsGoal
import com.danielhipskind.fihaven.core.model.SpendTransaction
import com.danielhipskind.fihaven.core.model.withCategoryBudget
import com.danielhipskind.fihaven.core.model.autopayMark
import com.danielhipskind.fihaven.core.model.incomeAdjustments
import com.danielhipskind.fihaven.core.model.incomes
import com.danielhipskind.fihaven.core.model.paidGoal
import com.danielhipskind.fihaven.core.model.timezoneSetting
import com.danielhipskind.fihaven.core.model.currency
import com.danielhipskind.fihaven.core.model.hidePaidOnDashboard
import com.danielhipskind.fihaven.core.model.withIncomeAdjustments
import com.danielhipskind.fihaven.core.model.withIncomes
import com.danielhipskind.fihaven.core.model.withPaidGoal
import com.danielhipskind.fihaven.core.model.withSetting
import com.danielhipskind.fihaven.core.model.withTimezone
import com.danielhipskind.fihaven.core.Money
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import com.danielhipskind.fihaven.core.logic.BillSchedule
import com.danielhipskind.fihaven.core.logic.DateLogic
import com.danielhipskind.fihaven.core.logic.PaidGoalPolicy
import com.danielhipskind.fihaven.core.logic.PaidState
import com.danielhipskind.fihaven.core.logic.Period
import com.danielhipskind.fihaven.core.logic.PeriodBounds
import com.danielhipskind.fihaven.core.logic.PeriodConfig
import com.danielhipskind.fihaven.core.logic.Schedule
import com.danielhipskind.fihaven.core.logic.UpcomingItem
import com.danielhipskind.fihaven.core.net.ApiClient
import com.danielhipskind.fihaven.core.net.ApiConfig
import com.danielhipskind.fihaven.core.net.ApiError
import com.danielhipskind.fihaven.core.net.LoginOutcome
import com.danielhipskind.fihaven.core.net.MfaChallenge
import com.danielhipskind.fihaven.core.net.User
import com.danielhipskind.fihaven.data.PrefsTokenStore
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
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

/// Mirrors the iOS AppEnvironment: owns the API client + token store and
/// the auth state machine, and holds the loaded AppData.
class AppViewModel(app: Application) : AndroidViewModel(app) {
    private val tokens = PrefsTokenStore(app)
    val api = ApiClient(ApiConfig(BuildConfig.API_BASE), tokens)

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

    fun markAuthStarted() { authStartedAt = ApiClient.now() }

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

    fun cancelMfa() { _session.value = Session.SignedOut; _authError.value = null }

    fun logout() = viewModelScope.launch {
        runCatching { api.logout() }
        _session.value = Session.SignedOut
        _data.value = AppData()
        _entitlement.value = Entitlement()
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
        } catch (e: ApiError) {
            _authError.value = e.userMessage; false
        } catch (e: Exception) {
            _authError.value = e.message ?: "Something went wrong."; false
        }

    private suspend fun loadData() {
        _dataLoaded.value = false
        _dataError.value = null
        try {
            val fetched = api.fetchData()
            _data.value = fetched
            Money.setCurrency(fetched.settings.currency)
            fetched.entitlement?.let { _entitlement.value = it }
            runAutopayMark()
            refreshEntitlement()
            _dataLoaded.value = true
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
     *  current period has arrived and they have no payment yet. Mirrors
     *  autopay.js + the server scheduler safety net. */
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
        fun considerBill(b: Bill) {
            if (!b.autopay) return
            if (b.dueDay == null && b.startDate.isNullOrEmpty()) return
            val due = BillSchedule.dueOnOrBeforeInPeriod(b, bounds, zone(), todayD) ?: return
            val refId = b.id.toString()
            if (Schedule.paidAmount(d.payments, "bill", refId, bounds) > Schedule.PAID_EPSILON) return
            if (Schedule.isSkipped(d.payments, "bill", refId, bounds)) return
            val iso = "%04d-%02d-%02d".format(todayD.year, todayD.monthValue, todayD.dayOfMonth)
            newPayments.add(Payment(newPaymentId(), "bill", refId, b.name, b.amount, iso, mkCal, "Auto-marked (autopay)", false))
        }
        fun considerCard(type: String, refId: String, name: String, dueDay: Int?, autopay: Boolean, amount: Double) {
            if (!autopay || dueDay == null || dueDay <= 0) return
            val due = dueInPeriod(dueDay) ?: return
            if (due.isAfter(todayD)) return
            if (Schedule.paidAmount(d.payments, type, refId, bounds) > Schedule.PAID_EPSILON) return
            if (Schedule.isSkipped(d.payments, type, refId, bounds)) return
            val iso = "%04d-%02d-%02d".format(todayD.year, todayD.monthValue, todayD.dayOfMonth)
            newPayments.add(Payment(newPaymentId(), type, refId, name, amount, iso, mkCal, "Auto-marked (autopay)", false))
        }
        d.bills.forEach { considerBill(it) }
        d.cards.forEach { considerCard("card", it.id.toString(), it.name + " (payment)", it.dueDay, it.autopay,
            goalAmount("card", it.id.toString())) }
        if (newPayments.isNotEmpty()) mutate { it.copy(payments = it.payments + newPayments) }
    }

    // ── Billing / entitlement ────────────────────────────────────────
    suspend fun refreshEntitlement() {
        runCatching { _entitlement.value = api.billingStatus() }
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

    fun applyUser(user: User) {
        if (_session.value is Session.SignedIn) _session.value = Session.SignedIn(user)
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

    fun deleteAccount(password: String, onError: (String) -> Unit) = viewModelScope.launch {
        try {
            api.deleteAccount(password)
            tokens.clear()
            _session.value = Session.SignedOut
            _data.value = AppData()
            _entitlement.value = Entitlement()
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
        saveJob?.cancel()
        saveJob = viewModelScope.launch {
            delay(800.milliseconds)
            runCatching { api.saveData(_data.value) }
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

    fun setMonthlySummary(on: Boolean) =
        mutate { it.copy(settings = it.settings.withSetting("monthlySummary", JsonPrimitive(on))) }

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
